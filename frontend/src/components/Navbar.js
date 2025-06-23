import React from "react";
import "../styles/Navbar.css";

const Navbar = ({ activeTab, onTabChange }) => (
  <nav className="navbar">
    <div className="navbar-title" style={{ fontWeight: "bold", fontSize: 24, color: "#2196f3" }}>TAS</div>
    <div className="navbar-tabs" style={{ float: "right" }}>
      <button
        className={activeTab === 'routes' ? 'active' : ''}
        style={{
          marginRight: 10,
          background: activeTab === 'routes' ? "#e3f2fd" : "white",
          border: "none",
          padding: "8px 16px",
          borderRadius: 4,
          cursor: "pointer",
          fontWeight: activeTab === 'routes' ? "bold" : "normal"
        }}
        onClick={() => onTabChange('routes')}
      >
        Best Time
      </button>
      <button
        className={activeTab === 'news' ? 'active' : ''}
        style={{
          background: activeTab === 'news' ? "#e3f2fd" : "white",
          border: "none",
          padding: "8px 16px",
          borderRadius: 4,
          cursor: "pointer",
          fontWeight: activeTab === 'news' ? "bold" : "normal"
        }}
        onClick={() => onTabChange('news')}
      >
        Traffic News
      </button>
    </div>
  </nav>
);

export default Navbar;