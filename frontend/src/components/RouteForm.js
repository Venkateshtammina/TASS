import React, { useState, useEffect, useRef } from 'react';
import '../styles/RouteForm.css';

const RouteForm = ({ onSubmit, isLoading }) => {
  const [formData, setFormData] = useState({
    origin: "",
    destination: "",
    avoidTolls: false,
    avoidHighways: false
  });

  const originRef = useRef(null);
  const destinationRef = useRef(null);
  const [originAutocomplete, setOriginAutocomplete] = useState(null);
  const [destinationAutocomplete, setDestinationAutocomplete] = useState(null);

  useEffect(() => {
    const initializeAutocomplete = () => {
      if (window.google && window.google.maps && window.google.maps.places) {
        if (originRef.current && !originAutocomplete) {
          const originAutocomplete = new window.google.maps.places.Autocomplete(originRef.current, {
            types: ['geocode', 'establishment'],
            componentRestrictions: { country: 'in' }
          });
          setOriginAutocomplete(originAutocomplete);

          originAutocomplete.addListener('place_changed', () => {
            const place = originAutocomplete.getPlace();
            if (place.formatted_address) {
              setFormData(prev => ({ ...prev, origin: place.formatted_address }));
            }
          });
        }

        if (destinationRef.current && !destinationAutocomplete) {
          const destinationAutocomplete = new window.google.maps.places.Autocomplete(destinationRef.current, {
            types: ['geocode', 'establishment'],
            componentRestrictions: { country: 'in' }
          });
          setDestinationAutocomplete(destinationAutocomplete);

          destinationAutocomplete.addListener('place_changed', () => {
            const place = destinationAutocomplete.getPlace();
            if (place.formatted_address) {
              setFormData(prev => ({ ...prev, destination: place.formatted_address }));
            }
          });
        }
      }
    };

    // Try to initialize immediately
    initializeAutocomplete();

    // Set up an interval to check for Google Maps API availability
    const checkInterval = setInterval(() => {
      if (window.google && window.google.maps && window.google.maps.places) {
        initializeAutocomplete();
        clearInterval(checkInterval);
      }
    }, 100);

    // Cleanup interval on unmount
    return () => clearInterval(checkInterval);
  }, [originAutocomplete, destinationAutocomplete]);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData({
      ...formData,
      [name]: type === 'checkbox' ? checked : value
    });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit(formData);
  };

  return (
    <div className="route-form-container">
      <h3 className="route-form-title">Find Routes</h3>
      <form className="route-form" onSubmit={handleSubmit}>
        <div className="form-group">
          <label className="form-label">Origin:</label>
          <input
            ref={originRef}
            type="text"
            name="origin"
            value={formData.origin}
            onChange={handleChange}
            className="form-input"
            required
            placeholder="Enter origin"
            autoComplete="off"
          />
        </div>
        
        <div className="form-group">
          <label className="form-label">Destination:</label>
          <input
            ref={destinationRef}
            type="text"
            name="destination"
            value={formData.destination}
            onChange={handleChange}
            className="form-input"
            required
            placeholder="Enter destination"
            autoComplete="off"
          />
        </div>
        
        <div className="checkbox-group">
          <label className="checkbox-label">
            <input
              type="checkbox"
              name="avoidTolls"
              checked={formData.avoidTolls}
              onChange={handleChange}
              className="checkbox-input"
            />
            Avoid Tolls
          </label>
          
          <label className="checkbox-label">
            <input
              type="checkbox"
              name="avoidHighways"
              checked={formData.avoidHighways}
              onChange={handleChange}
              className="checkbox-input"
            />
            Avoid Highways
          </label>
        </div>
        
        <button 
          type="submit" 
          disabled={isLoading}
          className="submit-button"
        >
          {isLoading ? 'Loading...' : 'Get Routes'}
        </button>
      </form>
    </div>
  );
};

export default RouteForm;