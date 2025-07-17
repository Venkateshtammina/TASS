// frontend/src/App.js
import React, { useState, useEffect, useRef } from 'react';
import axios from "axios"; // Keep axios for news and potentially other calls
import './styles/App.css';
import Navbar from './components/Navbar';
import RouteForm from './components/RouteForm';
import RouteComparisonTable from './components/RouteComparisonTable';
import TrafficNews from './components/TrafficNews';

const api_Key = process.env.REACT_APP_GOOGLE_MAPS_API_KEY; // This is for frontend Google Maps JS API loading

const App = () => {
  const [routes, setRoutes] = useState([]);
  const [loading, setLoading] = useState(false); // Used for overall form submission loading
  const [error, setError] = useState(null);
  const [selectedRoute, setSelectedRoute] = useState(null);
  const [activeTab, setActiveTab] = useState('routes');
  const [isMapInitialized, setIsMapInitialized] = useState(false);
  const [directionsRenderer, setDirectionsRenderer] = useState(null);
  const [alerts, setAlerts] = useState([]); // For real-time alerts
  const [weatherData, setWeatherData] = useState(null); // For weather data
  const [selectedStep, setSelectedStep] = useState(null); // Track selected step
  const [stepMarker, setStepMarker] = useState(null); // Track the step marker on the map
  const [infoWindow, setInfoWindow] = useState(null); // Track the info window
  const mapRef = useRef(null);
  const mapInstance = useRef(null);
  const trafficLayerRef = useRef(null);

  // Helper function to get Unix timestamp for a given time string (HH:MM)
  function getUnixTimestampForToday(timeStr) {
    if (!timeStr) return "now"; // Return "now" if no time string provided
    const [hours, minutes] = timeStr.split(":").map(Number);
    const now = new Date();
    now.setHours(hours, minutes, 0, 0);
    return Math.floor(now.getTime() / 1000);
  }

  // Function to decode a Google Maps Encoded Polyline string into an array of [lng, lat] coordinates
  const decodePolyline = (encoded) => {
    let points = [];
    let index = 0, lat = 0, lng = 0;

    while (index < encoded.length) {
      let b, shift = 0, result = 0;
      do {
        b = encoded.charCodeAt(index++) - 63;
        result |= (b & 0x1f) << shift;
        shift += 5;
      } while (b >= 0x20);
      const dlat = (result & 1) ? ~(result >> 1) : (result >> 1);
      lat += dlat;

      shift = 0;
      result = 0;
      do {
        b = encoded.charCodeAt(index++) - 63;
        result |= (b & 0x1f) << shift;
        shift += 5;
      } while (b >= 0x20);
      const dlng = (result & 1) ? ~(result >> 1) : (result >> 1);
      lng += dlng;

      points.push([lng / 1e5, lat / 1e5]);
    }
    return points;
  };

  // Main handler for RouteForm submission
  const handleFormSubmit = async (formData) => {
    setLoading(true); // Start loading
    setError(null);    // Clear previous errors
    setRoutes([]);     // Clear previous routes
    setSelectedRoute(null); // Reset selected route

    try {
      // Fetch weather data for destination
      if (formData.destination) {
        try {
          const geocodeResponse = await axios.get(`http://localhost:8000/api/geocode?address=${encodeURIComponent(formData.destination)}`);
          const { latitude, longitude } = geocodeResponse.data;
          const weatherResponse = await axios.get(`http://localhost:8000/api/weather?latitude=${latitude}&longitude=${longitude}`);
          console.log('Weather API Response:', weatherResponse.data);
          setWeatherData(weatherResponse.data);
        } catch (weatherError) {
          console.error('Error fetching weather data:', weatherError);
          // Continue with route fetching even if weather fetch fails
        }
      }

      // Step 3: Fetch route suggestions (original functionality)
      const departure_time = formData.departureTime
        ? getUnixTimestampForToday(formData.departureTime)
        : "now";

      const routeResponse = await axios.post('http://localhost:8000/api/routes', {
        origin: formData.origin,
        destination: formData.destination,
        avoid_tolls: formData.avoidTolls,
        avoid_highways: formData.avoidHighways,
        departure_time
      });

      setRoutes(routeResponse.data); // Update routes state
      displayAllPolylines(routeResponse.data); // Display polylines on map
      
    } catch (err) {
      console.error("Error during form submission:", err);
      setError(`Failed to process request: ${err.response?.data?.detail || err.message}`);
    } finally {
      setLoading(false); // End loading
    }
  };

  // Handle route selection from the routes list
  const handleRouteSelect = (index) => {
    setSelectedRoute(index);
    // Render the selected route on the map
    if (routes[index] && mapInstance.current) {
      renderGoogleDirections(routes[index], index);
    }
  };

  // Fetch alerts on mount and every 60 seconds (existing functionality)
  useEffect(() => {
    const fetchAlerts = async () => {
      try {
        const res = await axios.get('http://localhost:8000/api/alerts');
        setAlerts(res.data);
      } catch (e) {
        setAlerts([]); // Clear alerts if there's an error
        console.error("Error fetching alerts:", e);
      }
    };
    fetchAlerts();
    const interval = setInterval(fetchAlerts, 60000); // Fetch every minute
    return () => clearInterval(interval); // Cleanup interval
  }, []);

  // Clean up markers and reset state when routes change
  useEffect(() => {
    // Clean up existing marker and info window
    if (stepMarker) {
      stepMarker.setMap(null);
    }
    if (infoWindow) {
      infoWindow.close();
    }
    
    // Reset states
    setSelectedStep(null);
    setStepMarker(null);
  }, [routes]);

  // Draw all polylines for route selection (before a route is selected)
  const displayAllPolylines = (routesData) => {
    if (!mapInstance.current) return;

    // Clear previous map data and directions
    mapInstance.current.data.forEach(feature => {
      mapInstance.current.data.remove(feature);
    });
    if (directionsRenderer) {
      directionsRenderer.setMap(null);
      directionsRenderer.setPanel(null);
    }

    // Add GeoJSON features for each route's overview polyline
    const geoJson = {
      type: "FeatureCollection",
      features: routesData.map((route, index) => ({
        type: "Feature",
        geometry: {
          type: "LineString",
          coordinates: decodePolyline(route.polyline)
        },
        properties: {
          name: `Route ${index + 1}`,
          distance: route.distance,
          duration: route.duration,
          routeIndex: index
        }
      }))
    };
    mapInstance.current.data.addGeoJson(geoJson);

    // Fit map bounds to the first route if available
    if (routesData.length > 0 && geoJson.features.length > 0) {
      const bounds = new window.google.maps.LatLngBounds();
      const coordinates = decodePolyline(routesData[0].polyline);
      coordinates.forEach(point => {
        bounds.extend(new window.google.maps.LatLng(point[1], point[0]));
      });

      // Add start and end markers
      const startPoint = coordinates[0];
      const endPoint = coordinates[coordinates.length - 1];

      new window.google.maps.Marker({
        position: { lat: startPoint[1], lng: startPoint[0] },
        map: mapInstance.current,
        icon: {
          path: window.google.maps.SymbolPath.CIRCLE,
          fillColor: "#4CAF50", // Green
          fillOpacity: 1,
          strokeWeight: 2,
          strokeColor: "#ffffff",
          scale: 8
        },
        title: "Start Point"
      });

      new window.google.maps.Marker({
        position: { lat: endPoint[1], lng: endPoint[0] },
        map: mapInstance.current,
        icon: {
          path: window.google.maps.SymbolPath.CIRCLE,
          fillColor: "#F44336", // Red
          fillOpacity: 1,
          strokeWeight: 2,
          strokeColor: "#ffffff",
          scale: 8
        },
        title: "End Point"
      });

      mapInstance.current.fitBounds(bounds);
    }

    // Clear existing data layer click listeners to prevent duplicates
    window.google.maps.event.clearListeners(mapInstance.current.data, "click");

    // Add click listener to data layer features (polylines)
    mapInstance.current.data.addListener("click", function (event) {
      const routeIndex = event.feature.getProperty("routeIndex");
      if (typeof routeIndex === "number") {
        handleRouteSelect(routeIndex);
      }
    });
  };

  // Handle step selection from directions list
  const handleStepClick = (step, index) => {
    setSelectedStep(index);
    
    if (step.start_location && mapInstance.current) {
      const position = new window.google.maps.LatLng(
        step.start_location.lat(),
        step.start_location.lng()
      );
      
      // Pan and zoom to the step location
      mapInstance.current.panTo(position);
      mapInstance.current.setZoom(17);
      
      // Remove existing marker if any
      if (stepMarker) {
        stepMarker.setMap(null);
      }
      
      // Create a new marker for the step
      const newMarker = new window.google.maps.Marker({
        position: position,
        map: mapInstance.current,
        title: 'Step ' + (index + 1),
        icon: {
          path: window.google.maps.SymbolPath.CIRCLE,
          fillColor: '#4285F4',
          fillOpacity: 1,
          strokeWeight: 2,
          strokeColor: '#FFFFFF',
          scale: 10,
        },
        zIndex: 1000 // Ensure the marker appears above other map elements
      });
      
      // Create or update info window
      const stepInfo = step.instructions || 'Step ' + (index + 1);
      const infoContent = `
        <div style="padding: 8px;">
          <div style="font-weight: bold; margin-bottom: 4px;">Step ${index + 1}</div>
          <div>${stepInfo.replace(/<[^>]*>?/gm, '')}</div>
        </div>
      `;
      
      let infoWin = infoWindow;
      if (!infoWin) {
        infoWin = new window.google.maps.InfoWindow();
        setInfoWindow(infoWin);
      }
      
      infoWin.setContent(infoContent);
      infoWin.open({
        anchor: newMarker,
        map: mapInstance.current,
        shouldFocus: false
      });
      
      setStepMarker(newMarker);
    }
  };

  // Show only the selected route using DirectionsRenderer with correct routeIndex
  const renderGoogleDirections = (route, routeIdx) => {
    if (!window.google || !mapInstance.current) return;

    // Clear previous map data and directions
    mapInstance.current.data.forEach(feature => {
      mapInstance.current.data.remove(feature);
    });
    if (directionsRenderer) {
      directionsRenderer.setMap(null);
      directionsRenderer.setPanel(null);
    }

    // Draw step polylines for the selected route
    if (route.step_polylines && route.step_polylines.length > 0) {
      route.step_polylines.forEach((stepPolyline, stepIdx) => {
        if (stepPolyline) {
          const stepCoords = decodePolyline(stepPolyline);
          const stepFeature = {
            type: "Feature",
            geometry: {
              type: "LineString",
              coordinates: stepCoords
            },
            properties: {
              name: `Step ${stepIdx + 1}`,
              routeIndex: routeIdx,
              stepIndex: stepIdx
            }
          };
          mapInstance.current.data.addGeoJson({
            type: "FeatureCollection",
            features: [stepFeature]
          });
        }
      });
    }

    // Use DirectionsService to get full route details for rendering in panel
    const directionsService = new window.google.maps.DirectionsService();
    const newRenderer = new window.google.maps.DirectionsRenderer({
      map: mapInstance.current,
      panel: document.getElementById("directions-panel"), // Render directions in this div
      suppressMarkers: false, // Show default markers
      preserveViewport: true, // Keep current map zoom/center
      routeIndex: routeIdx // Highlight the selected route
    });

    // Use route data for origin and destination
    const origin = route.start_location;
    const destination = route.end_location;

    directionsService.route(
      {
        origin,
        destination,
        travelMode: window.google.maps.TravelMode.DRIVING,
        provideRouteAlternatives: true, // Allow alternative routes to be shown by Google
      },
      (result, status) => {
        if (status === "OK") {
          newRenderer.setDirections(result);
        } else {
          console.error(`Directions request failed due to ${status}`);
          setError(`Could not display detailed directions: ${status}`);
        }
      }
    );
    setDirectionsRenderer(newRenderer); // Store the new renderer instance
  };

  // Effect to re-render Google Directions when selectedRoute or routes change
  useEffect(() => {
    if (
      selectedRoute !== null &&
      routes[selectedRoute] &&
      mapInstance.current
    ) {
      renderGoogleDirections(routes[selectedRoute], selectedRoute);
    } else if (routes.length > 0 && mapInstance.current) {
      // If no route is selected but routes exist, display all overview polylines
      displayAllPolylines(routes);
    }
    // eslint-disable-next-line
  }, [selectedRoute, routes, mapInstance.current]); // Added mapInstance.current as dependency

  // Effect to initialize Google Map
  useEffect(() => {
    const initMap = () => {
      if (!mapRef.current) return; // Exit if map container ref is not available

      try {
        // Initialize the map
        mapInstance.current = new window.google.maps.Map(mapRef.current, {
          zoom: 12,
          center: { lat: 12.9716, lng: 77.5946 }, // Default center (Bengaluru)
          mapTypeControl: true,
          streetViewControl: false,
          fullscreenControl: true
        });

        // Add live traffic overlay
        const trafficLayer = new window.google.maps.TrafficLayer();
        trafficLayer.setMap(mapInstance.current);
        trafficLayerRef.current = trafficLayer; // Store reference to traffic layer

        // Example congestion points (can be dynamic from backend or static)
        const congestionPoints = [
          { lat: 12.9716, lng: 77.5946, title: "MG Road Junction" },
          { lat: 12.9784, lng: 77.6408, title: "Indiranagar Junction" },
          { lat: 12.9279, lng: 77.6271, title: "Koramangala Junction" },
          { lat: 12.9175, lng: 77.6254, title: "Silk Board Junction" },
          { lat: 12.9568, lng: 77.7011, title: "Marathahalli Junction" }
        ];

        // Add markers for congestion points
        congestionPoints.forEach(point => {
          new window.google.maps.Marker({
            position: { lat: point.lat, lng: point.lng },
            map: mapInstance.current,
            title: point.title,
            label: {
              text: "!", // Exclamation mark for congestion
              color: "#ffffff",
              fontSize: "14px",
              fontWeight: "bold"
            }
          });
        });

        // Define custom colors for routes to make them stand out
        const customRouteColors = [
          "#8e24aa", // purple
          "#ff6f00", // orange
          "#00bcd4", // cyan
          "#c62828", // dark red
          "#43a047", // dark green
          "#fbc02d", // yellow
          "#3949ab", // indigo
          "#d84315", // deep orange
        ];

        // Set style for data layer (polylines)
        mapInstance.current.data.setStyle(function(feature) {
          const routeIndex = feature.getProperty('routeIndex');
          const stepIndex = feature.getProperty('stepIndex');
          if (typeof stepIndex === 'number') {
            // Style for individual step polylines (when a route is selected)
            return {
              strokeColor: '#000000', // Black for steps
              strokeWeight: 5,
              strokeOpacity: 0.9,
              zIndex: 2
            };
          }
          // Style for overview polylines (when no route is selected)
          return {
            strokeColor: customRouteColors[routeIndex % customRouteColors.length],
            strokeWeight: 7,
            strokeOpacity: 1,
            zIndex: 1
          };
        });

        setIsMapInitialized(true); // Set map initialized state to true
      } catch (error) {
        console.error('Error initializing map:', error);
        setError('Failed to initialize map. Please refresh the page.');
      }
    };

    // Load Google Maps script if not already loaded
    if (!window.google) {
      const script = document.createElement('script');
      script.src = `https://maps.googleapis.com/maps/api/js?key=${api_Key}&libraries=places&v=weekly`;
      script.async = true;
      script.defer = true;

      // Assign initMap to window for Google Maps API to call it
      script.onload = () => {
        window.initGoogleMaps = initMap; // This is a global callback for Google Maps API
        initMap(); // Call it directly if script loads after component
      };

      document.head.appendChild(script);
    } else {
      initMap(); // If Google Maps is already loaded, just initialize the map
    }

    // Cleanup function for map and traffic layer on component unmount
    return () => {
      if (mapInstance.current) {
        mapInstance.current = null;
      }
      if (trafficLayerRef.current) {
        trafficLayerRef.current.setMap(null);
      }
    };
  }, []); // Empty dependency array means this effect runs once on mount

  // Effect to handle map display based on activeTab
  useEffect(() => {
    if (!isMapInitialized || !mapRef.current || !mapInstance.current) return;

    if (activeTab === 'routes') {
      mapRef.current.style.display = 'block';
      // Trigger map resize to ensure it renders correctly after display change
      setTimeout(() => {
        if (mapInstance.current) {
          window.google.maps.event.trigger(mapInstance.current, 'resize');
        }
      }, 100);
    } else {
      mapRef.current.style.display = 'none';
    }
  }, [activeTab, isMapInitialized]); // Dependencies: activeTab and map initialization status

  // Responsive styles (existing)
  const responsiveStyles = `
    @media (max-width: 900px) {
      .routes-container {
        min-width: 90vw !important;
        max-width: 98vw !important;
        left: 50% !important;
        right: auto !important;
        transform: translateX(-50%) !important;
        padding: 12px !important;
      }
      .routes-list .route-item {
        font-size: 15px !important;
      }
    }
    @media (max-width: 600px) {
      .routes-container {
        min-width: 98vw !important;
        max-width: 99vw !important;
        left: 50% !important;
        right: auto !important;
        transform: translateX(-50%) !important;
        padding: 6px !important;
      }
      .routes-list .route-item {
        font-size: 13px !important;
      }
      .app-container {
        padding: 0 !important;
      }
      .map-container {
        min-height: 300px !important;
      }
    }
    @media (max-width: 600px) {
      .alerts-panel {
        max-width: 98vw !important;
        left: 50% !important;
        transform: translateX(-50%) !important;
        padding: 8px !important;
        font-size: 14px !important;
      }
    }
    @media (max-width: 900px) {
      .flex-row-responsive {
        flex-direction: column !important;
        gap: 16px !important;
        left: 0 !important;
        top: 0 !important;
        position: static !important;
      }
      .route-form-responsive {
        min-width: 90vw !important;
        max-width: 98vw !important;
      }
      #directions-panel {
        min-width: 90vw !important;
        max-width: 98vw !important;
        left: 0 !important;
        top: 0 !important;
        position: static !important;
      }
    }
  `;

  return (
    <div className="app-container" style={{padding: 16}}>
      <style>{responsiveStyles}</style>
      <Navbar activeTab={activeTab} onTabChange={setActiveTab} />

      {/* Alerts Panel - only show on 'routes' tab */}
      {activeTab === 'routes' && alerts.length > 0 && (
        <div
          className="alerts-panel"
          style={{
            background: "#fff3cd",
            color: "#856404",
            border: "1px solid #ffeeba",
            borderRadius: 8,
            padding: "12px 20px",
            margin: "32px 32px 16px 32px",
            maxWidth: 600,
            zIndex: 100,
            position: "absolute",
            top: 60,
            left: "50%",
            transform: "translateX(-50%)"
          }}>
          <strong>Real-Time Alerts:</strong>
          <ul style={{margin: 0, paddingLeft: 20}}>
            {alerts.map((alert, idx) => (
              <li key={idx}>
                <b>{alert.type}:</b> {alert.description}
              </li>
            ))}
          </ul>
        </div>
      )}

      {activeTab === 'routes' ? (
        <>
          {/* Flex container for RouteForm and Directions */}
          <div
            className="flex-row-responsive"
            style={{
              position: "absolute",
              top: 32,
              left: 32,
              zIndex: 60,
              display: "flex",
              flexDirection: "row",
              gap: 40
            }}
          >
            {/* RouteForm - Always Visible */}
            <div className="route-form-responsive" style={{ zIndex: 31, minWidth: 320, maxWidth: 400, maxHeight: 600 }}>
              <div style={{ position: "relative" }}>
                <RouteForm onSubmit={handleFormSubmit} isLoading={loading} />
              </div>
            </div>

          </div>

          <div ref={mapRef} className="map-container" style={{ display: activeTab === 'routes' ? 'block' : 'none', position: "relative" }}>
            {/* Routes list floats on the right */}
            {routes.length > 0 && (
              <div
                className="routes-container"
                style={{
                  position: "absolute",
                  top: 32,
                  right: 32,
                  zIndex: 20,
                  background: "#fff",
                  borderRadius: 12,
                  boxShadow: "0 2px 16px rgba(0,0,0,0.15)",
                  padding: 24,
                  minWidth: 520,
                  maxWidth: 520,
                  maxHeight: 600,
                  overflowY: "auto"
                }}
              >
                <h3>Available Routes</h3>
                <div className="routes-list">
                  {routes.map((route, index) => (
                    <div
                      key={index}
                      className={`route-item ${selectedRoute === index ? 'selected' : ''} ${route.is_optimal ? 'optimal-route' : ''}`}
                      onClick={() => handleRouteSelect(index)}
                      style={{
                        border: route.is_optimal ? '2px solid #34a853' : '1px solid #ccc',
                        background: selectedRoute === index
                          ? '#d0e8ff'
                          : route.is_optimal
                            ? '#eaffea'
                            : 'white',
                        marginBottom: 12,
                        cursor: "pointer",
                        boxShadow: selectedRoute === index ? '0 0 8px #2196f3' : 'none',
                        transition: 'background 0.2s, box-shadow 0.2s'
                      }}
                    >
                      <h4>
                        Route {index + 1} {route.is_optimal && <span style={{color: "#34a853"}}> (Recommended)</span>}
                      </h4>
                      <p>Distance: {route.distance}</p>
                      <p>Duration: {route.duration}</p>
                      <p>Real-Time: {route.duration_in_traffic}</p>
                      <p>ETA: {route.eta || "N/A"}</p>
                    </div>
                  ))}
                </div>
                <div className="route-details">
                  {console.log('Current weatherData:', weatherData) || null}
                  {weatherData && (
                    <div className="weather-widget" style={{ marginBottom: '20px', padding: '15px', background: '#f0f8ff', borderRadius: '8px' }}>
                      <h3>Weather at Destination</h3>
                      <p>
                        Temperature: {weatherData.temperature !== undefined 
                          ? `${weatherData.temperature}°C`
                          : 'N/A'}
                      </p>
                      <p>Conditions: {weatherData.weather_description || 'N/A'}</p>
                      {weatherData.precipitation_probability !== undefined && (
                        <p>💧 Rain: {weatherData.precipitation_probability}% chance</p>
                      )}
                      {weatherData.wind_speed !== undefined && (
                        <p>💨 Wind: {weatherData.wind_speed} km/h</p>
                      )}
                      {weatherData.humidity !== undefined && (
                        <p>Humidity: {weatherData.humidity}%</p>
                      )}
                      {weatherData.time && (
                        <p style={{ fontSize: '0.8em', color: '#666', marginTop: '8px' }}>
                          Last updated: {new Date(weatherData.time).toLocaleString()}
                        </p>
                      )}
                    </div>
                  )}
                  {selectedRoute === null ? (
                    <RouteComparisonTable routes={routes} />
                  ) : (
                    <div style={{marginTop: 24, padding: 16, background: "#f9f9f9", borderRadius: 8}}>
                      <h4>Route {selectedRoute + 1} Details</h4>
                      <p><strong>Distance:</strong> {routes[selectedRoute].distance}</p>
                      <p><strong>Duration:</strong> {routes[selectedRoute].duration}</p>
                      <p><strong>Real-Time:</strong> {routes[selectedRoute].duration_in_traffic}</p>
                      <p><strong>ETA:</strong> {routes[selectedRoute].eta || "N/A"}</p>
                      <p><strong>Start:</strong> {routes[selectedRoute].start_address}</p>
                      <p><strong>End:</strong> {routes[selectedRoute].end_address}</p>
                      <div>
                        <strong>Steps:</strong>
                        <ol style={{ paddingLeft: '20px' }}>
                          {routes[selectedRoute].steps && routes[selectedRoute].steps.map((step, idx) => {
                            // Extract the instruction text from the HTML
                            const instruction = step.replace(/<[^>]*>?/gm, '');
                            return (
                              <li 
                                key={idx} 
                                onClick={() => handleStepClick(routes[selectedRoute].steps[idx], idx)}
                                style={{
                                  cursor: 'pointer',
                                  padding: '8px',
                                  margin: '4px 0',
                                  borderRadius: '4px',
                                  backgroundColor: selectedStep === idx ? '#e3f2fd' : 'transparent',
                                  transition: 'background-color 0.2s',
                                  listStyleType: 'decimal',
                                  marginLeft: '20px'
                                }}
                                onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#f5f5f5'}
                                onMouseOut={(e) => e.currentTarget.style.backgroundColor = selectedStep === idx ? '#e3f2fd' : 'transparent'}
                              >
                                <div dangerouslySetInnerHTML={{__html: step}} />
                              </li>
                            );
                          })}
                        </ol>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </>
      ) : (
        <div>
          <TrafficNews />
        </div>
      )}
    </div>
  );
};

export default App;
