import React, { useState, useEffect, useRef } from 'react';
import axios from "axios";
import RouteForm from './components/RouteForm';
import TrafficGraph from './components/TrafficGraph';
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
  const [trafficData, setTrafficData] = useState([]);
  const [formData, setFormData] = useState(null);
  const [activeTab, setActiveTab] = useState('routes');
  const [isMapInitialized, setIsMapInitialized] = useState(false);
  const [directionsRenderer, setDirectionsRenderer] = useState(null);
  const [routeFormMinimized, setRouteFormMinimized] = useState(false);
  const mapRef = useRef(null);
  const mapInstance = useRef(null);

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
    setTrafficData([]);
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

  const fetchTrafficData = async () => {
    try {
      const response = await axios.get('http://localhost:8000/api/traffic', {
        params: { label: "Bangalore_Center" }
      });
      setTrafficData(Array.isArray(response.data) ? response.data : []);
    } catch (err) {
      setError("Failed to fetch traffic data. Please try again later.");
      setTrafficData([]);
    }
  };

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
    fetchTrafficData(index);
  };

  // Expand RouteForm and hide directions
  const handleExpandRouteForm = () => {
    setRouteFormMinimized(false);
    setSelectedRoute(null);
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

        mapInstance.current.data.setStyle(function(feature) {
          const routeIndex = parseInt(feature.getProperty('name').split(' ')[1]) - 1;
          const colors = ['#4285F4', '#DB4437', '#0F9D58'];
          return {
            strokeColor: colors[routeIndex % colors.length],
            strokeWeight: 6,
            strokeOpacity: 0.8,
            zIndex: -1
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

  return (
    <div className="app-container">
      <Navbar activeTab={activeTab} onTabChange={setActiveTab} />

      {activeTab === 'routes' ? (
        <>
          {/* Flex container for RouteForm and Directions */}
          <div
            style={{
              position: "absolute",
              top: 32,
              left: 32,
              zIndex: 30,
              display: "flex",
              flexDirection: "row",
              gap: 16
            }}
          >
            {/* RouteForm */}
            <div style={{ zIndex: 31 }}>
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
                        padding: "2px 8px",
                        cursor: "pointer",
                        fontSize: 12
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
                  background: "#fff",
                  borderRadius: 12,
                  boxShadow: "0 2px 16px rgba(0,0,0,0.15)",
                  padding: 24,
                  minWidth: 320,
                  maxWidth: 350,
                  maxHeight: 400,
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
                  minWidth: 320,
                  maxWidth: 350,
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
                <RouteComparisonTable routes={routes} />
              </div>
            )}
          </div>

          {selectedRoute !== null && (
            <>
              {trafficData && trafficData.length > 0 ? (
                <TrafficGraph
                  routeData={trafficData}
                  selectedRoute={selectedRoute}
                />
              ) : (
                <div style={{padding: 16, color: "#888"}}>No traffic data available for this route.</div>
              )}
            </>
          )}
        </>
      ) : (
        <TrafficNews />
      )}
    </div>
  );
};

export default App;