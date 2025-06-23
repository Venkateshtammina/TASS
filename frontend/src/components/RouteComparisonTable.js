import React from "react";

const RouteComparisonTable = ({ routes }) => (
  <table className="route-comparison-table">
    <thead>
      <tr>
        <th>Route</th>
        <th>Distance</th>
        <th>Duration</th>
        <th>Real-Time</th>
        <th>ETA</th>
        <th>Start</th>
        <th>End</th>
        <th>Steps</th>
        <th>Tolls</th>
        <th>Highways</th>
        <th>Recommended</th>
      </tr>
    </thead>
    <tbody>
      {routes.map((route, idx) => (
        <tr key={idx}>
          <td>{idx + 1}</td>
          <td>{route.distance}</td>
          <td>{route.duration}</td>
          <td>{route.duration_in_traffic}</td>
          <td>{route.eta || "N/A"}</td>
          <td>{route.start_location}</td>
          <td>{route.end_location}</td>
          <td>
            {route.steps && route.steps.length > 0
              ? <ul style={{textAlign: "left", margin: 0, paddingLeft: 16}}>
                  {route.steps.map((step, i) => (
                    <li key={i} dangerouslySetInnerHTML={{__html: step}} />
                  ))}
                </ul>
              : "N/A"}
          </td>
          <td>{route.avoid_tolls ? "No" : "Yes"}</td>
          <td>{route.avoid_highways ? "No" : "Yes"}</td>
          <td>{route.is_optimal ? "✅" : ""}</td>
        </tr>
      ))}
    </tbody>
  </table>
);

export default RouteComparisonTable;