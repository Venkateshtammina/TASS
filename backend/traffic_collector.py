import time
import requests
from traffic_db import save_traffic
import os
from dotenv import load_dotenv

load_dotenv()
api_key = os.environ.get('google_cloud')

def get_route_key(label):
    return label

def fetch_and_store_central(lat, lng, label):
    url = "https://maps.googleapis.com/maps/api/directions/json"
    # Use a short dummy route within a 10km radius
    params = {
        "origin": f"{lat},{lng}",
        "destination": f"{lat + 0.05},{lng + 0.05}",  # ~5-7km diagonal
        "departure_time": "now",
        "traffic_model": "best_guess",
        "key": api_key
    }
    resp = requests.get(url, params=params)
    data = resp.json()
    if data["routes"]:
        duration_in_traffic = data["routes"][0]["legs"][0]["duration_in_traffic"]["value"]
        save_traffic(get_route_key(label), duration_in_traffic)

if __name__ == "__main__":
    # Set your central point(s) for the 10km radius area
    CENTRAL_POINTS = [
        {"lat": 12.9716, "lng": 77.5946, "label": "Bangalore_Center"},
        # Add more points if needed
    ]
    while True:
        for point in CENTRAL_POINTS:
            fetch_and_store_central(point["lat"], point["lng"], point["label"])
        time.sleep(1800)  # 30 minutes