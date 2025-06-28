import os
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List
import requests
from dotenv import load_dotenv
from datetime import datetime, timedelta

# Load environment variables
load_dotenv()
api_key = os.environ.get('google_cloud')
NEWS_API_KEY = os.environ.get('news_api_key')

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class RouteRequest(BaseModel):
    origin: str
    destination: str
    avoid_tolls: bool = False
    avoid_highways: bool = False
    departure_time: str = "now"  # "now" or UNIX timestamp as string

class StepData(BaseModel):
    html_instructions: str
    polyline: str

class RouteData(BaseModel):
    polyline: str
    distance: str
    duration: str
    duration_in_traffic: str
    is_optimal: bool = False
    start_location: str = ""
    end_location: str = ""
    steps: list = []
    step_polylines: list = []
    avoid_tolls: bool = False
    avoid_highways: bool = False
    eta: str = ""

@app.post("/api/routes", response_model=List[RouteData])
def get_routes(request: RouteRequest):
    url = "https://maps.googleapis.com/maps/api/directions/json"
    params = {
        "origin": request.origin,
        "destination": request.destination,
        "departure_time": request.departure_time,
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
            steps = [
                step.get("html_instructions", "")
                for step in leg.get("steps", [])
            ]
            # Collect step polylines
            step_polylines = [
                step.get("polyline", {}).get("points", "")
                for step in leg.get("steps", [])
            ]
            # Calculate ETA
            if request.departure_time == "now":
                dep_time = datetime.now()
            else:
                try:
                    dep_time = datetime.fromtimestamp(int(request.departure_time))
                except Exception:
                    dep_time = datetime.now()
            eta_time = dep_time + timedelta(seconds=duration_in_traffic_seconds)
            eta_str = eta_time.strftime("%H:%M")
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
                    step_polylines=step_polylines,
                    avoid_tolls=request.avoid_tolls,
                    avoid_highways=request.avoid_highways,
                    eta=eta_str
                )
            )
        return routes_data

    except requests.exceptions.Timeout:
        raise HTTPException(status_code=504, detail="Google Directions API timed out. Please try again.")
    except requests.exceptions.RequestException as e:
        raise HTTPException(status_code=500, detail=f"Error fetching routes: {str(e)}")

# Real-time alerts endpoint (mocked)
@app.get("/api/alerts")
def get_alerts():
    # In production, fetch from a real traffic/incident API
    return [
        {
            "type": "Road Closure",
            "description": "Kanakapura Main Rd closed near Dmart due to construction.",
            "location": {"lat": 12.891, "lng": 77.579}
        },
        {
            "type": "Accident",
            "description": "Accident at Banashankari Temple junction. Expect delays.",
            "location": {"lat": 12.925, "lng": 77.573}
        }
    ]

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
    import os
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)