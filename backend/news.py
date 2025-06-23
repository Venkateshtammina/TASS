import os
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List
import requests
from dotenv import load_dotenv
from news import router as news_router
from traffic_db import get_traffic_last_24h

# Load environment variables
load_dotenv()
api_key = os.environ.get('google_cloud')
NEWS_API_KEY = os.environ.get('news_api_key')

app = FastAPI()

# Configure CORS to allow requests from any origin
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include the news router
app.include_router(news_router, prefix="/api")

class RouteRequest(BaseModel):
    origin: str
    destination: str
    avoid_tolls: bool = False
    avoid_highways: bool = False

class RouteData(BaseModel):
    polyline: str
    distance: str
    duration: str
    duration_in_traffic: str
    is_optimal: bool = False
    start_location: str = ""
    end_location: str = ""
    steps: list = []
    avoid_tolls: bool = False
    avoid_highways: bool = False

class TrafficData(BaseModel):
    time: str
    trafficLevel: float
    duration: int

@app.post("/api/routes", response_model=List[RouteData])
def get_routes(request: RouteRequest):
    url = "https://maps.googleapis.com/maps/api/directions/json"
    params = {
        "origin": request.origin,
        "destination": request.destination,
        "departure_time": "now",
        "traffic_model": "best_guess",
        "alternatives": "true",
        "avoid": ",".join(
            [k for k, v in {
                "tolls": request.avoid_tolls,
                "highways": request.avoid_highways
            }.items() if v]
        ) if (request.avoid_tolls or request.avoid_highways) else None,
        "key": api_key
    }
    params = {k: v for k, v in params.items() if v is not None}

    try:
        response = requests.get(url, params=params, timeout=5)
        response.raise_for_status()
        result = response.json()
        routes_data = []

        # Find the optimal route (minimum duration_in_traffic)
        min_duration = None
        for route in result.get("routes", []):
            duration_in_traffic = route["legs"][0].get("duration_in_traffic", {}).get("value", None)
            if duration_in_traffic is not None:
                if min_duration is None or duration_in_traffic < min_duration:
                    min_duration = duration_in_traffic

        for route in result.get("routes", []):
            leg = route["legs"][0]
            distance_km = round(leg.get("distance", {}).get("value", 0) / 1000, 1)
            duration_seconds = leg.get("duration", {}).get("value", 0)
            duration_minutes = round(duration_seconds / 60)
            duration_in_traffic_seconds = leg.get("duration_in_traffic", {}).get("value", duration_seconds)
            duration_in_traffic_minutes = round(duration_in_traffic_seconds / 60)
            is_optimal = (duration_in_traffic_seconds == min_duration)
            # Extract step summaries
            steps = [
                step.get("html_instructions", "")
                for step in leg.get("steps", [])
            ]
            routes_data.append(
                RouteData(
                    polyline=route.get("overview_polyline", {}).get("points", ""),
                    distance=f"{distance_km} km",
                    duration=f"{duration_minutes} mins",
                    duration_in_traffic=f"{duration_in_traffic_minutes} mins",
                    is_optimal=is_optimal,
                    start_location=leg.get("start_address", ""),
                    end_location=leg.get("end_address", ""),
                    steps=steps,
                    avoid_tolls=request.avoid_tolls,
                    avoid_highways=request.avoid_highways
                )
            )
        return routes_data

    except requests.exceptions.Timeout:
        raise HTTPException(status_code=504, detail="Google Directions API timed out. Please try again.")
    except requests.exceptions.RequestException as e:
        raise HTTPException(status_code=500, detail=f"Error fetching routes: {str(e)}")

@app.get("/api/traffic", response_model=List[TrafficData])
def get_traffic_data(label: str = "Bangalore_Center"):
    try:
        rows = get_traffic_last_24h(label)
        traffic_data = []
        for timestamp, duration in rows:
            traffic_data.append({
                "time": timestamp[11:16],
                "trafficLevel": 0,
                "duration": int(duration)
            })
        return traffic_data
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching historical traffic data: {str(e)}")

@app.get("/api/traffic-news")
def get_traffic_news():
    try:
        url = "https://newsapi.org/v2/everything"
        params = {
            "q": "bangalore traffic OR bangalore road OR bangalore accident",
            "sortBy": "publishedAt",
            "language": "en",
            "apiKey": NEWS_API_KEY,
            "pageSize": 10
        }
        resp = requests.get(url, params=params, timeout=5)
        resp.raise_for_status()
        data = resp.json()
        articles = [
            {
                "title": article["title"],
                "description": article["description"],
                "url": article["url"],
                "publishedAt": article["publishedAt"]
            }
            for article in data.get("articles", [])
        ]
        return articles
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching traffic news: {str(e)}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)