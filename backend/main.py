import os
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
import requests
from dotenv import load_dotenv
from datetime import datetime, timedelta

# Load environment variables
load_dotenv()
google_cloud_api_key = os.environ.get('google_cloud') # Renamed for clarity with new variable
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

# New Pydantic model for Geocode response
class GeocodeResponse(BaseModel):
    latitude: float
    longitude: float
    address: str

# New Pydantic models for Weather request and response
class WeatherRequest(BaseModel):
    latitude: float
    longitude: float

class WeatherData(BaseModel):
    temperature: float
    humidity: int
    wind_speed: float
    weather_description: str
    precipitation_probability: Optional[int] = None
    time: str

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
        "key": google_cloud_api_key # Use the renamed API key variable
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

# New endpoint to geocode an address
@app.get("/api/geocode", response_model=GeocodeResponse)
def geocode_address(address: str):
    geocode_url = "https://maps.googleapis.com/maps/api/geocode/json"
    params = {
        "address": address,
        "key": google_cloud_api_key #
    }
    try:
        response = requests.get(geocode_url, params=params, timeout=5)
        response.raise_for_status()
        result = response.json()

        if result["status"] == "OK" and result["results"]:
            location = result["results"][0]["geometry"]["location"]
            formatted_address = result["results"][0]["formatted_address"]
            return GeocodeResponse(
                latitude=location["lat"],
                longitude=location["lng"],
                address=formatted_address
            )
        else:
            raise HTTPException(status_code=404, detail="Address not found or geocoding error.")
    except requests.exceptions.Timeout:
        raise HTTPException(status_code=504, detail="Geocoding API timed out. Please try again.")
    except requests.exceptions.RequestException as e:
        raise HTTPException(status_code=500, detail=f"Error geocoding address: {str(e)}")

@app.get("/api/weather", response_model=WeatherData)
def get_current_weather(latitude: float, longitude: float): # Changed to query parameters for simplicity in GET
    url = "https://api.open-meteo.com/v1/forecast"
    params = {
        "latitude": latitude,
        "longitude": longitude,
        "current": "temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code,precipitation_probability",
        "timezone": "auto",
    }
    try:
        response = requests.get(url, params=params, timeout=5)
        response.raise_for_status()
        result = response.json()

        current_data = result.get("current", {})
        temperature = current_data.get("temperature_2m")
        humidity = current_data.get("relative_humidity_2m")
        wind_speed = current_data.get("wind_speed_10m")
        weather_code = current_data.get("weather_code")
        precipitation_probability = current_data.get("precipitation_probability")
        time = current_data.get("time")

        # Basic mapping of weather codes to descriptions (simplified for demo)
        weather_descriptions = {
            0: "Clear sky",
            1: "Mainly clear",
            2: "Partly cloudy",
            3: "Overcast",
            45: "Fog",
            48: "Depositing rime fog",
            51: "Drizzle: Light",
            53: "Drizzle: Moderate",
            55: "Drizzle: Dense intensity",
            56: "Freezing Drizzle: Light",
            57: "Freezing Drizzle: Dense intensity",
            61: "Rain: Slight",
            63: "Rain: Moderate",
            65: "Rain: Heavy intensity",
            66: "Freezing Rain: Light",
            67: "Freezing Rain: Heavy intensity",
            71: "Snow fall: Slight",
            73: "Snow fall: Moderate",
            75: "Snow fall: Heavy intensity",
            77: "Snow grains",
            80: "Rain showers: Slight",
            81: "Rain showers: Moderate",
            82: "Rain showers: Violent",
            85: "Snow showers: Slight",
            86: "Snow showers: Heavy",
            95: "Thunderstorm: Slight or moderate",
            96: "Thunderstorm with slight hail",
            99: "Thunderstorm with heavy hail",
        }
        description = weather_descriptions.get(weather_code, "Unknown")

        return WeatherData(
            temperature=temperature,
            humidity=humidity,
            wind_speed=wind_speed,
            weather_description=description,
            precipitation_probability=precipitation_probability,
            time=time
        )
    except requests.exceptions.Timeout:
        raise HTTPException(status_code=504, detail="Weather API timed out. Please try again.")
    except requests.exceptions.RequestException as e:
        raise HTTPException(status_code=500, detail=f"Error fetching traffic news: {str(e)}")

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)