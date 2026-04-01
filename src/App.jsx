import {useEffect, useMemo, useState} from 'react';

const API_KEY = import.meta.env.VITE_OPENWEATHER_API_KEY;
const DEFAULT_CITY = 'London';

function formatDayLabel(timestamp) {
  return new Date(timestamp * 1000).toLocaleDateString('en-US', {weekday: 'short'});
}

function formatTimeLabel(timestamp) {
  return new Date(timestamp * 1000).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: false,
  });
}

function buildSeries(forecastList) {
  return forecastList.slice(0, 10).map((entry) => ({
    temp: Math.round(entry.main.temp),
    day: formatDayLabel(entry.dt),
    time: formatTimeLabel(entry.dt),
    chanceOfRain: Math.round((entry.pop || 0) * 100),
    condition: entry.weather[0]?.main ?? 'Clear',
  }));
}

function buildInsight(forecastList) {
  const byDay = new Map();

  forecastList.forEach((entry) => {
    const dayKey = new Date(entry.dt * 1000).toLocaleDateString('en-CA');
    const record = byDay.get(dayKey) ?? {
      label: formatDayLabel(entry.dt),
      temps: [],
      rain: [],
    };

    record.temps.push(entry.main.temp);
    record.rain.push(entry.pop || 0);
    byDay.set(dayKey, record);
  });

  const rankedDays = [...byDay.values()]
    .map((day) => {
      const averageTemp = day.temps.reduce((sum, value) => sum + value, 0) / day.temps.length;
      const rainChance = Math.max(...day.rain) * 100;
      const comfortScore = Math.abs(averageTemp - 18) + rainChance / 12;

      return {
        label: day.label,
        temp: Math.round(averageTemp),
        comfortScore,
      };
    })
    .sort((a, b) => a.comfortScore - b.comfortScore);

  const bestDay = rankedDays[0];

  if (!bestDay) {
    return 'Weather insight will appear after the first successful search.';
  }

  return `Best day to go out: ${bestDay.label} (${bestDay.temp}\u00B0C)`;
}

async function fetchJson(url) {
  const response = await fetch(url);

  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(payload?.message ?? 'Unable to load weather data');
  }

  return response.json();
}

export default function App() {
  const [cityInput, setCityInput] = useState(DEFAULT_CITY);
  const [weather, setWeather] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const loadWeather = async (searchCity) => {
    const trimmedCity = searchCity.trim();

    if (!trimmedCity) {
      setError('Enter a city name.');
      return;
    }

    if (!API_KEY) {
      setError('OpenWeather API key is missing.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const encodedCity = encodeURIComponent(trimmedCity);
      const [currentData, forecastData] = await Promise.all([
        fetchJson(
          `https://api.openweathermap.org/data/2.5/weather?q=${encodedCity}&appid=${API_KEY}&units=metric`
        ),
        fetchJson(
          `https://api.openweathermap.org/data/2.5/forecast?q=${encodedCity}&appid=${API_KEY}&units=metric`
        ),
      ]);

      const series = buildSeries(forecastData.list);

      setWeather({
        city: currentData.name,
        current: {
          temp: Math.round(currentData.main.temp),
          condition: currentData.weather[0]?.main ?? 'Unknown',
        },
        series,
        insight: buildInsight(forecastData.list),
      });
    } catch (requestError) {
      setWeather(null);
      setError(requestError instanceof Error ? requestError.message : 'Failed to load weather data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadWeather(DEFAULT_CITY);
  }, []);

  const chart = useMemo(() => {
    if (!weather?.series?.length) {
      return null;
    }

    const temps = weather.series.map((point) => point.temp);
    const minTemp = Math.min(...temps) - 2;
    const maxTemp = Math.max(...temps) + 2;
    const width = 800;
    const height = 210;
    const paddingX = 18;
    const paddingY = 18;
    const range = Math.max(maxTemp - minTemp, 1);

    const points = weather.series
      .map((point, index) => {
        const x =
          weather.series.length === 1
            ? width / 2
            : paddingX + (index / (weather.series.length - 1)) * (width - paddingX * 2);
        const y = height - paddingY - ((point.temp - minTemp) / range) * (height - paddingY * 2);
        return `${x},${y}`;
      })
      .join(' ');

    const gridTicks = [0, 0.25, 0.5, 0.75, 1].map((step) => {
      const value = maxTemp - step * range;
      const y = paddingY + step * (height - paddingY * 2);
      return {value: Math.round(value), y};
    });

    return {width, height, points, gridTicks, minTemp, maxTemp, paddingX, paddingY, range};
  }, [weather]);

  return (
    <div className="app-shell">
      <div className="window-frame">
        <div className="window-chrome">
          <div className="window-dots" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
          <div className="window-bar" />
        </div>

        <div className="app-content">
          <form
            className="search-row"
            onSubmit={(event) => {
              event.preventDefault();
              loadWeather(cityInput);
            }}
          >
            <label htmlFor="city-input">Enter city:</label>
            <input
              id="city-input"
              type="text"
              value={cityInput}
              onChange={(event) => setCityInput(event.target.value)}
              spellCheck="false"
              autoComplete="off"
            />
            <button type="submit" disabled={loading}>
              {loading ? '...' : 'Search'}
            </button>
          </form>

          {error ? <div className="status-banner">{error}</div> : null}

          {weather ? (
            <div className="dashboard-stack">
              <section className="weather-card">
                <div className="weather-card__title">{weather.city}</div>
                <div className="weather-card__body">
                  <p>Current Temperature: {weather.current.temp}°C</p>
                  <p>Condition: {weather.current.condition}</p>
                </div>
              </section>

              <section className="trend-block">
                <h2 className="section-heading">Temperature Trend</h2>
                <div className="chart-caption">Temperature (°C)</div>
                <div className="chart-shell">
                  {chart ? (
                    <>
                      <div className="chart-y-axis" aria-hidden="true">
                        {chart.gridTicks.map((tick) => (
                          <span key={tick.y}>{tick.value}</span>
                        ))}
                      </div>
                      <svg
                        className="chart-svg"
                        viewBox={`0 0 ${chart.width} ${chart.height}`}
                        preserveAspectRatio="none"
                        aria-label="Weather temperature trend"
                        role="img"
                      >
                        {chart.gridTicks.map((tick) => (
                          <line
                            key={tick.y}
                            x1="0"
                            x2={chart.width}
                            y1={tick.y}
                            y2={tick.y}
                            className="chart-grid-line"
                          />
                        ))}

                        <line
                          x1="0"
                          x2={chart.width}
                          y1={chart.height - 18}
                          y2={chart.height - 18}
                          className="chart-axis-line"
                        />

                        <polyline className="chart-line" fill="none" points={chart.points} />

                        {weather.series.map((point, index) => {
                          const x =
                            weather.series.length === 1
                              ? chart.width / 2
                              : chart.paddingX +
                                (index / (weather.series.length - 1)) * (chart.width - chart.paddingX * 2);
                          const y =
                            chart.height -
                            chart.paddingY -
                            ((point.temp - chart.minTemp) / chart.range) * (chart.height - chart.paddingY * 2);

                          return <circle key={`${point.day}-${point.time}-${index}`} cx={x} cy={y} r="5.5" className="chart-dot" />;
                        })}
                      </svg>

                      <div className="chart-x-axis" aria-hidden="true">
                        {weather.series.map((point, index) => (
                          <span key={`${point.day}-${point.time}-${index}`}>{point.day}</span>
                        ))}
                      </div>
                    </>
                  ) : null}
                </div>
              </section>

              <section className="insight-card">
                <div className="insight-card__title">Insight:</div>
                <div className="insight-card__body">{weather.insight}</div>
              </section>
            </div>
          ) : loading ? (
            <div className="loading-card">Loading weather data...</div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
