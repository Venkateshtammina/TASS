import json
import pandas as pd

# Load your weather.json file (replace with your actual file path)
with open('weather.json', 'r') as f:
    data = json.load(f)

# Extract hourly data
hourly = data['hourly']
df_weather = pd.DataFrame({
    'timestamp': hourly['time'],
    'temperature_2m': hourly['temperature_2m'],
    'precipitation': hourly['precipitation']
})

# Convert timestamp to datetime and sort
df_weather['timestamp'] = pd.to_datetime(df_weather['timestamp'])
df_weather = df_weather.sort_values('timestamp')

# Save as CSV for easy merging later
df_weather.to_csv('weather.csv', index=False)

print(df_weather.head())