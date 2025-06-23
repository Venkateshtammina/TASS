import os
import requests
from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

load_dotenv()

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

HERE_API_KEY = os.getenv("HERE_API_KEY")

@app.get("/api/traffic/{route_index}")
def get_real_traffic_data(
    route_index: int,
    origin: str = Query(...),
    destination: str = Query(...)
):
    """
    Fetch real-time traffic data for a route using HERE Routing API.
    """
    if not HERE_API_KEY:
        return {"error": "HERE_API_KEY not set in environment variables."}

    url = (
        f"https://router.hereapi.com/v8/routes"
        f"?transportMode=car"
        f"&origin={origin}"
        f"&destination={destination}"
        f"&return=summary,travelSummary,actions,instructions"
        f"&apikey={HERE_API_KEY}"
    )
    resp = requests.get(url)
    if resp.status_code != 200:
        return {"error": "Failed to fetch traffic data."}

    data = resp.json()
    try:
        route = data["routes"][route_index]
        summary = route["sections"][0]["summary"]
        return {
            "duration": summary["duration"],  # seconds
            "length": summary["length"],      # meters
            "trafficDelay": summary.get("trafficDelay", 0),  # seconds
            "baseDuration": summary.get("baseDuration", summary["duration"]),
            "text": f"Traffic delay: {summary.get('trafficDelay', 0)} seconds"
        }
    except (KeyError, IndexError):
        return {"error": "Route data not found."}