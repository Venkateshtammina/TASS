import React, { useEffect, useRef } from 'react';
import Chart from 'chart.js/auto';
import '../styles/TrafficGraph.css';

const TrafficGraph = ({ routeData, selectedRoute }) => {
  const chartRef = useRef(null);
  const chartInstance = useRef(null);

  useEffect(() => {
    if (!routeData || routeData.length === 0 || selectedRoute === null) return;

    const ctx = chartRef.current.getContext('2d');

    // Destroy previous chart instance if it exists
    if (chartInstance.current) {
      chartInstance.current.destroy();
    }

    // Prepare data for the chart
    const labels = routeData.map(d => d.time);
    const trafficData = routeData.map(data => data.trafficLevel);
    const durationData = routeData.map(data => data.duration);

    // Create the chart
    chartInstance.current = new Chart(ctx, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [
          {
            label: 'Traffic Level',
            data: trafficData,
            borderColor: '#4285f4',
            backgroundColor: 'rgba(66, 133, 244, 0.1)',
            yAxisID: 'y',
            tension: 0.4
          },
          {
            label: 'Duration (minutes)',
            data: durationData,
            borderColor: '#34a853',
            backgroundColor: 'rgba(52, 168, 83, 0.1)',
            yAxisID: 'y1',
            tension: 0.4
          }
        ]
      },
      options: {
        responsive: true,
        interaction: {
          mode: 'index',
          intersect: false,
        },
        plugins: {
          title: {
            display: true,
            text: `Traffic Pattern for Route ${selectedRoute + 1}`,
            font: {
              size: 16
            }
          },
          tooltip: {
            callbacks: {
              label: function(context) {
                let label = context.dataset.label || '';
                if (label) {
                  label += ': ';
                }
                if (context.datasetIndex === 0) {
                  label += `${context.raw}% traffic`;
                } else {
                  label += `${context.raw} minutes`;
                }
                return label;
              }
            }
          }
        },
        scales: {
          y: {
            type: 'linear',
            display: true,
            position: 'left',
            title: {
              display: true,
              text: 'Traffic Level (%)'
            },
            min: 0,
            max: 100
          },
          y1: {
            type: 'linear',
            display: true,
            position: 'right',
            title: {
              display: true,
              text: 'Duration (minutes)'
            },
            grid: {
              drawOnChartArea: false
            }
          }
        }
      }
    });

    return () => {
      if (chartInstance.current) {
        chartInstance.current.destroy();
      }
    };
  }, [routeData, selectedRoute]);

  // Find the best time to travel (lowest traffic level)
  let bestTime = null;
  let minTraffic = null;
  if (routeData && routeData.length > 0) {
    minTraffic = Math.min(...routeData.map(d => d.trafficLevel));
    const best = routeData.find(d => d.trafficLevel === minTraffic);
    bestTime = best ? best.time : null;
  }

  return (
    <div className="traffic-graph-container">
      <canvas ref={chartRef}></canvas>
      {bestTime && (
        <div className="traffic-summary">
          <h3>Best Time to Travel</h3>
          <p>
            The best time to take this route is around <b>{bestTime}</b> with <b>{minTraffic}%</b> traffic
          </p>
        </div>
      )}
    </div>
  );
};

export default TrafficGraph;