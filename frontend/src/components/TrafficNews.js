import React, { useEffect, useState } from "react";
import axios from "axios";

const TrafficNews = () => {
  const [news, setNews] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    axios.get("http://localhost:8000/api/traffic-news")
      .then(res => {
        setNews(res.data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  return (
    <div className="traffic-news">
      <h3>Live Traffic News & Incidents</h3>
      {loading && <div>Loading...</div>}
      <ul>
        {news.map((item, idx) => (
          <li key={idx} style={{marginBottom: 12}}>
            <a href={item.url} target="_blank" rel="noopener noreferrer"><strong>{item.title}</strong></a>
            <div>{item.description}</div>
            <small style={{color: "#888"}}>{new Date(item.publishedAt).toLocaleString()}</small>
          </li>
        ))}
      </ul>
      {!loading && news.length === 0 && <div>No news found.</div>}
    </div>
  );
};

export default TrafficNews;