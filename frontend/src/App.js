import React, { useState, useEffect, useRef } from 'react';
import axios from "axios";
import RouteForm from './components/RouteForm';
import Navbar from './components/Navbar';
import TrafficNews from './components/TrafficNews';
import './styles/App.css';
import RouteComparisonTable from './components/RouteComparisonTable';

const api_Key = process.env.REACT_APP_GOOGLE_MAPS_API_KEY;

const App = () => {
  const [routes, setRoutes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedRoute, setSelectedRoute] = useState(null);
  const [formData, setFormData] = useState(null);
  const [activeTab, setActiveTab] = useState('routes');
  const [isMapInitialized, setIsMapInitialized] = useState(false);
  const [directionsRenderer, setDirectionsRenderer] = useState(null);
  const [routeFormMinimized, setRouteFormMinimized] = useState(false);
  const [alerts, setAlerts] = useState([]);
  const mapRef = useRef(null);
  const mapInstance = useRef(null);
  const trafficLayerRef = useRef(null);

  function getUnixTimestampForToday(timeStr) {
    if (!timeStr) return "now";
    const [hours, minutes] = timeStr.split(":").map(Number);
    const now = new Date();
    now.setHours(hours, minutes, 0, 0);
    return Math.floor(now.getTime() / 1000);
  }

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

  const fetchRoutes = async (formData) => {
    setLoading(true);
    setError(null);
    setFormData(formData);
    setSelectedRoute(null);
    setRouteFormMinimized(false);

    try {
      const departure_time = formData.departureTime
        ? getUnixTimestampForToday(formData.departureTime)
        : "now";
      const response = await axios.post('http://localhost:8000/api/routes', {
        origin: formData.origin,
        destination: formData.destination,
        avoid_tolls: formData.avoidTolls,
        avoid_highways: formData.avoidHighways,
        departure_time
      });

      setRoutes(response.data);
      displayAllPolylines(response.data);
      setLoading(false);
    } catch (err) {
      console.error("Error fetching routes:", err);
      setError("Failed to fetch routes. Please try again later.");
      setLoading(false);
    }
  };

  // Fetch alerts on mount and every 60 seconds
  useEffect(() => {
    const fetchAlerts = async () => {
      try {
        const res = await axios.get('http://localhost:8000/api/alerts');
        setAlerts(res.data);
      } catch (e) {
        setAlerts([]);
      }
    };
    fetchAlerts();
    const interval = setInterval(fetchAlerts, 60000);
    return () => clearInterval(interval);
  }, []);

  // Draw all polylines for route selection (before a route is selected)
  const displayAllPolylines = (routesData) => {
    if (!mapInstance.current) return;

    // Remove previous polylines
    mapInstance.current.data.forEach(feature => {
      mapInstance.current.data.remove(feature);
    });

    // Remove DirectionsRenderer if present
    if (directionsRenderer) {
      directionsRenderer.setMap(null);
      directionsRenderer.setPanel(null);
    }

    // Draw overview polylines for each route
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

    if (routesData.length > 0 && geoJson.features.length > 0) {
      const bounds = new window.google.maps.LatLngBounds();
      const coordinates = decodePolyline(routesData[0].polyline);
      coordinates.forEach(point => {
        bounds.extend(new window.google.maps.LatLng(point[1], point[0]));
      });

      const startPoint = coordinates[0];
      const endPoint = coordinates[coordinates.length - 1];

      new window.google.maps.Marker({
        position: { lat: startPoint[1], lng: startPoint[0] },
        map: mapInstance.current,
        icon: {
          path: window.google.maps.SymbolPath.CIRCLE,
          fillColor: "#4CAF50",
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
          fillColor: "#F44336",
          fillOpacity: 1,
          strokeWeight: 2,
          strokeColor: "#ffffff",
          scale: 8
        },
        title: "End Point"
      });

      mapInstance.current.fitBounds(bounds);
    }

    window.google.maps.event.clearListeners(mapInstance.current.data, "click");

    mapInstance.current.data.addListener("click", function (event) {
      const routeIndex = event.feature.getProperty("routeIndex");
      if (typeof routeIndex === "number") {
        handleRouteSelect(routeIndex);
      }
    });
  };

  // Show only the selected route using DirectionsRenderer with correct routeIndex
  const renderGoogleDirections = (route, routeIdx) => {
    if (!window.google || !mapInstance.current) return;

    // Remove previous polylines
    mapInstance.current.data.forEach(feature => {
      mapInstance.current.data.remove(feature);
    });

    // Remove previous renderer
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

    // Optionally, you can still use DirectionsRenderer for panel
    const directionsService = new window.google.maps.DirectionsService();
    const newRenderer = new window.google.maps.DirectionsRenderer({
      map: mapInstance.current,
      panel: document.getElementById("directions-panel"),
      suppressMarkers: false,
      preserveViewport: true,
      routeIndex: routeIdx
    });

    const origin = formData?.origin || route.start_location;
    const destination = formData?.destination || route.end_location;

    directionsService.route(
      {
        origin,
        destination,
        travelMode: window.google.maps.TravelMode.DRIVING,
        provideRouteAlternatives: true,
      },
      (result, status) => {
        if (status === "OK") {
          newRenderer.setDirections(result);
        }
      }
    );
    setDirectionsRenderer(newRenderer);
  };

  // Handle route selection from card or polyline
  const handleRouteSelect = (index) => {
    setSelectedRoute(index);
    setRouteFormMinimized(true);
  };

  // Expand RouteForm and hide directions
  const handleExpandRouteForm = () => {
    setRouteFormMinimized(false);
    setSelectedRoute(null);
    // Optionally, redraw all polylines
    if (routes.length > 0 && mapInstance.current) {
      displayAllPolylines(routes);
    }
  };

  useEffect(() => {
    if (
      selectedRoute !== null &&
      routes[selectedRoute] &&
      mapInstance.current
    ) {
      renderGoogleDirections(routes[selectedRoute], selectedRoute);
    } else if (routes.length > 0 && mapInstance.current) {
      displayAllPolylines(routes);
    }
    // eslint-disable-next-line
  }, [selectedRoute, routes, mapInstance.current]);

  useEffect(() => {
    const initMap = () => {
      if (!mapRef.current) return;

      try {
        mapInstance.current = new window.google.maps.Map(mapRef.current, {
          zoom: 12,
          center: { lat: 12.9716, lng: 77.5946 },
          mapTypeControl: true,
          streetViewControl: false,
          fullscreenControl: true
        });

        // --- Add live traffic overlay ---
        const trafficLayer = new window.google.maps.TrafficLayer();
        trafficLayer.setMap(mapInstance.current);
        trafficLayerRef.current = trafficLayer;

        const congestionPoints = [
          { lat: 12.9716, lng: 77.5946, title: "MG Road Junction" },
          { lat: 12.9784, lng: 77.6408, title: "Indiranagar Junction" },
          { lat: 12.9784, lng: 77.6408, title: "Koramangala Junction" },
          { lat: 12.9784, lng: 77.6408, title: "Silk Board Junction" },
          { lat: 12.9784, lng: 77.6408, title: "Marathahalli Junction" }
        ];

        congestionPoints.forEach(point => {
          new window.google.maps.Marker({
            position: { lat: point.lat, lng: point.lng },
            map: mapInstance.current,
            title: point.title,
            label: {
              text: "!",
              color: "#ffffff",
              fontSize: "14px",
              fontWeight: "bold"
            }
          });
        });

        // Use custom, high-contrast colors for your routes to stand out from Google traffic colors
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

        mapInstance.current.data.setStyle(function(feature) {
          const routeIndex = feature.getProperty('routeIndex');
          const stepIndex = feature.getProperty('stepIndex');
          if (typeof stepIndex === 'number') {
            // Step polyline: use black for high contrast
            return {
              strokeColor: '#000000',
              strokeWeight: 5,
              strokeOpacity: 0.9,
              zIndex: 2
            };
          }
          // Route overview polyline: use custom color
          return {
            strokeColor: customRouteColors[routeIndex % customRouteColors.length],
            strokeWeight: 7,
            strokeOpacity: 1,
            zIndex: 1
          };
        });

        setIsMapInitialized(true);
      } catch (error) {
        console.error('Error initializing map:', error);
        setError('Failed to initialize map. Please refresh the page.');
      }
    };

    if (!window.google) {
      const script = document.createElement('script');
      script.src = `https://maps.googleapis.com/maps/api/js?key=${api_Key}&libraries=places&v=weekly`;
      script.async = true;
      script.defer = true;

      script.onload = () => {
        window.initGoogleMaps = initMap;
        initMap();
      };

      document.head.appendChild(script);
    } else {
      initMap();
    }

    return () => {
      if (mapInstance.current) {
        mapInstance.current = null;
      }
      if (trafficLayerRef.current) {
        trafficLayerRef.current.setMap(null);
      }
    };
  }, []);

  useEffect(() => {
    if (!isMapInitialized || !mapRef.current || !mapInstance.current) return;

    if (activeTab === 'routes') {
      mapRef.current.style.display = 'block';
      setTimeout(() => {
        if (mapInstance.current) {
          window.google.maps.event.trigger(mapInstance.current, 'resize');
        }
      }, 100);
    } else {
      mapRef.current.style.display = 'none';
    }
  }, [activeTab, isMapInitialized]);

  // Responsive styles
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
            {/* RouteForm */}
            <div className="route-form-responsive" style={{ zIndex: 31 , minWidth: 320, maxWidth: 400, maxHeight: 600 }}>
              {!routeFormMinimized ? (
                <div style={{ position: "relative" }}>
                  <RouteForm onSubmit={fetchRoutes} isLoading={loading} />
                  {selectedRoute !== null && (
                    <button
                      style={{
                        position: "absolute",
                        top: 8,
                        right: 8,
                        background: "#2196f3",
                        color: "#fff",
                        border: "none",
                        borderRadius: 4,
                        padding: "8px 8px",
                        cursor: "pointer",
                        fontSize: 12,
                      }}
                      onClick={() => setRouteFormMinimized(true)}
                      title="Minimize"
                    >
                      &minus;
                    </button>
                  )}
                </div>
              ) : (
                <button
                  style={{
                    width: 40,
                    height: 40,
                    position: "absolute",
                    top: 20,
                    borderRadius: "50%",
                    background: "#2196f3",
                    color: "#fff",
                    border: "none",
                    fontSize: 24,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center"
                  }}
                  onClick={handleExpandRouteForm}
                  title="Expand Route Form"
                >
                  &#43;
                </button>
              )}
            </div>
            {/* Directions panel */}
            {selectedRoute !== null && routeFormMinimized && (
              <div
                id="directions-panel"
                style={{
                  zIndex: 31,
                  position: "absolute",
                  top: 20,
                  left: 40,
                  background: "#fff",
                  borderRadius: 12,
                  boxShadow: "0 2px 16px rgba(0,0,0,0.15)",
                  padding: 24,
                  minWidth: 320,
                  maxWidth: 350,
                  maxHeight: 404,
                  overflowY: "auto"
                }}
              />
            )}
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
                {/* Show comparison table only if no route is selected */}
                {selectedRoute === null && <RouteComparisonTable routes={routes} />}
                {/* Show details for selected route only */}
                {selectedRoute !== null && (
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
                      <ol>
                        {routes[selectedRoute].steps && routes[selectedRoute].steps.map((step, idx) => (
                          <li key={idx} dangerouslySetInnerHTML={{__html: step}} />
                        ))}
                      </ol>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      ) : (
        <TrafficNews />
      )}
    </div>
  );
};

export default App;