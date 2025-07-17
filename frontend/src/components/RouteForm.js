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
      // Check if Google Maps API and Places library are loaded
      if (window.google && window.google.maps && window.google.maps.places) {
        // Initialize origin autocomplete if ref is available and not already initialized
        if (originRef.current && !originAutocomplete) {
          const newOriginAutocomplete = new window.google.maps.places.Autocomplete(originRef.current, {
            types: ['geocode', 'establishment'], // Restrict results to addresses and businesses
            componentRestrictions: { country: 'in' } // Restrict to India
          });
          setOriginAutocomplete(newOriginAutocomplete);

          // Add listener for when a place is selected from origin autocomplete
          newOriginAutocomplete.addListener('place_changed', () => {
            const place = newOriginAutocomplete.getPlace();
            if (place.formatted_address) {
              // Update form data with the selected formatted address
              setFormData(prev => ({ ...prev, origin: place.formatted_address }));
            }
          });
        }

        // Initialize destination autocomplete if ref is available and not already initialized
        if (destinationRef.current && !destinationAutocomplete) {
          const newDestinationAutocomplete = new window.google.maps.places.Autocomplete(destinationRef.current, {
            types: ['geocode', 'establishment'],
            componentRestrictions: { country: 'in' }
          });
          setDestinationAutocomplete(newDestinationAutocomplete);

          // Add listener for when a place is selected from destination autocomplete
          newDestinationAutocomplete.addListener('place_changed', () => {
            const place = newDestinationAutocomplete.getPlace();
            if (place.formatted_address) {
              // Update form data with the selected formatted address
              setFormData(prev => ({ ...prev, destination: place.formatted_address }));
            }
          });
        }
      }
    };

    // Try to initialize immediately on component mount
    initializeAutocomplete();

    // Set up an interval to repeatedly check for Google Maps API availability
    // This is useful if the script loads asynchronously after component render
    const checkInterval = setInterval(() => {
      if (window.google && window.google.maps && window.google.maps.places) {
        initializeAutocomplete(); // Attempt to initialize if not already done
        clearInterval(checkInterval); // Clear the interval once initialized
      }
    }, 100); // Check every 100 milliseconds

    // Cleanup function to clear the interval when the component unmounts
    return () => clearInterval(checkInterval);
  }, [originAutocomplete, destinationAutocomplete]); // Dependencies: re-run if autocomplete instances change

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData({
      ...formData,
      [name]: type === 'checkbox' ? checked : value
    });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    // Call the onSubmit prop function passed from App.js with the current form data
    onSubmit(formData);
  };

  return (
    <div className="route-form-container">
      <h3 className="route-form-title">Find Routes</h3>
      <form className="route-form" onSubmit={handleSubmit}>
        <div className="form-group">
          <label className="form-label">Origin:</label>
          <input
            ref={originRef} // Attach ref for Google Autocomplete
            type="text"
            name="origin"
            value={formData.origin}
            onChange={handleChange} // Keep onChange for manual typing
            className="form-input"
            required
            placeholder="Enter origin"
            autoComplete="off"
          />
        </div>
        
        <div className="form-group">
          <label className="form-label">Destination:</label>
          <input
            ref={destinationRef} // Attach ref for Google Autocomplete
            type="text"
            name="destination"
            value={formData.destination}
            onChange={handleChange} // Keep onChange for manual typing
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
          disabled={isLoading} // Button disabled when loading
          className="submit-button"
        >
          {isLoading ? 'Loading...' : 'Get Routes & Weather'} {/* Dynamic button text */}
        </button>
      </form>
    </div>
  );
};

export default RouteForm;
