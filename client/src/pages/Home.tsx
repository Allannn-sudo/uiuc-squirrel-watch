import { useState, useEffect, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Wind, Thermometer, MapPin, Clock, Sun, CloudRain, Squirrel, TrendingUp, Info } from "lucide-react";

/* ─── UIUC Campus Locations ─── */
const LOCATIONS = [
  { id: "quad",    name: "Main Quad",       lat: 40.1072, lng: -88.2272, emoji: "🌳", desc: "Oak & elm canopy, peak squirrel turf" },
  { id: "bardeen", name: "Bardeen Quad",    lat: 40.1146, lng: -88.2284, emoji: "🔬", desc: "Near ECEB, calmer population" },
  { id: "illini",  name: "Illini Union",    lat: 40.1095, lng: -88.2271, emoji: "🏛️", desc: "Food scraps = reliable sighting" },
  { id: "siebel",  name: "Siebel Center",   lat: 40.1138, lng: -88.2249, emoji: "💻", desc: "Squirrels compete with engineers" },
  { id: "lincoln", name: "Lincoln Hall",    lat: 40.1069, lng: -88.2295, emoji: "📚", desc: "Shaded lawn, consistent activity" },
];

const TIME_SLOTS = [
  { id: "dawn",      label: "黎明", range: "06:00–08:00", peak: true },
  { id: "morning",   label: "上午", range: "08:00–12:00", peak: true },
  { id: "midday",    label: "中午", range: "12:00–14:00", peak: false },
  { id: "afternoon", label: "下午", range: "14:00–17:00", peak: true },
  { id: "evening",   label: "傍晚", range: "17:00–20:00", peak: true },
  { id: "night",     label: "夜晚", range: "20:00–23:00", peak: false },
];

/* ─── Coordinates (center of UIUC) ─── */
const UIUC_LAT = 40.1092;
const UIUC_LNG = -88.2272;

/* ─── Types ─── */
interface WeatherData {
  temperature: number;
  windspeed: number;
  weathercode: number;
  apparent_temperature: number;
  precipitation: number;
}

interface SunData {
  sunrise: string;
  sunset: string;
  golden_hour_morning: string;
  golden_hour_evening: string;
}

interface HourlyForecast {
  hour: number;
  temp: number;
  wind: number;
  precip: number;
}

/* ─── Probability engine ─── */
function computeProbability(params: {
  temp: number;
  wind: number;
  timeSlotId: string;
  locationId: string;
  precipProb: number;
  sunriseHour: number;
  sunsetHour: number;
  iNatCount: number;
  currentHour: number;
}): { score: number; factors: { label: string; impact: number; positive: boolean }[] } {
  const factors: { label: string; impact: number; positive: boolean }[] = [];
  let base = 50;

  // Temperature factor (°C). Squirrels most active 5–20°C
  const tempC = (params.temp - 32) * 5/9;
  if (tempC >= 8 && tempC <= 22) {
    factors.push({ label: "温度适宜", impact: +18, positive: true });
    base += 18;
  } else if (tempC >= 2 && tempC < 8) {
    factors.push({ label: "偏凉", impact: +5, positive: true });
    base += 5;
  } else if (tempC < 2) {
    factors.push({ label: "气温过低", impact: -20, positive: false });
    base -= 20;
  } else if (tempC > 30) {
    factors.push({ label: "气温过高", impact: -12, positive: false });
    base -= 12;
  }

  // Wind factor (mph)
  if (params.wind < 8) {
    factors.push({ label: "风速适宜", impact: +12, positive: true });
    base += 12;
  } else if (params.wind < 15) {
    factors.push({ label: "微风", impact: +4, positive: true });
    base += 4;
  } else if (params.wind >= 20) {
    factors.push({ label: "大风", impact: -15, positive: false });
    base -= 15;
  }

  // Time of day — squirrels crepuscular/diurnal
  const slot = TIME_SLOTS.find(s => s.id === params.timeSlotId);
  if (slot?.peak) {
    factors.push({ label: "活动高峰时段", impact: +15, positive: true });
    base += 15;
  } else if (params.timeSlotId === "night") {
    factors.push({ label: "夜晚活动少", impact: -25, positive: false });
    base -= 25;
  }

  // Golden hours near sunrise/sunset
  const slotStartHour = parseInt(slot?.range.split("–")[0] || "12");
  const nearSunrise = Math.abs(slotStartHour - params.sunriseHour) <= 1.5;
  const nearSunset  = Math.abs(slotStartHour - params.sunsetHour)  <= 1.5;
  if (nearSunrise || nearSunset) {
    factors.push({ label: "黄金时段", impact: +10, positive: true });
    base += 10;
  }

  // Precipitation
  if (params.precipProb > 60) {
    factors.push({ label: "有雨", impact: -18, positive: false });
    base -= 18;
  } else if (params.precipProb > 30) {
    factors.push({ label: "少量降水", impact: -8, positive: false });
    base -= 8;
  }

  // Location-specific modifiers
  if (params.locationId === "quad") {
    factors.push({ label: "Quad植被茂盛", impact: +8, positive: true });
    base += 8;
  } else if (params.locationId === "illini") {
    factors.push({ label: "食物来源丰富", impact: +6, positive: true });
    base += 6;
  } else if (params.locationId === "siebel") {
    factors.push({ label: "建筑密集", impact: -4, positive: false });
    base -= 4;
  }

  // iNaturalist historical sightings
  if (params.iNatCount > 20) {
    factors.push({ label: `iNat ${params.iNatCount}次目击记录`, impact: +8, positive: true });
    base += 8;
  } else if (params.iNatCount > 5) {
    factors.push({ label: `iNat ${params.iNatCount}次记录`, impact: +4, positive: true });
    base += 4;
  }

  const score = Math.max(5, Math.min(97, base));
  return { score, factors };
}

function getScoreColor(score: number): string {
  if (score >= 75) return "text-green-600 dark:text-green-400";
  if (score >= 50) return "text-amber-600 dark:text-amber-400";
  return "text-red-500 dark:text-red-400";
}

function getScoreLabel(score: number): string {
  if (score >= 80) return "非常可能看到 🐿️";
  if (score >= 65) return "比较可能看到";
  if (score >= 45) return "有一定概率";
  if (score >= 25) return "可能性较低";
  return "今天别指望了";
}

function getWeatherEmoji(code: number): string {
  if (code === 0) return "☀️";
  if (code <= 2) return "🌤️";
  if (code <= 49) return "🌥️";
  if (code <= 69) return "🌧️";
  if (code <= 79) return "🌨️";
  if (code <= 99) return "⛈️";
  return "🌈";
}

/* ─── Theme toggle ─── */
function ThemeToggle() {
  const [dark, setDark] = useState(() =>
    window.matchMedia("(prefers-color-scheme: dark)").matches
  );
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
  }, [dark]);
  return (
    <button
      onClick={() => setDark(d => !d)}
      className="p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
      aria-label="切换暗色模式"
      data-testid="button-theme-toggle"
    >
      {dark ? (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>
        </svg>
      ) : (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
        </svg>
      )}
    </button>
  );
}

/* ─── SVG Logo ─── */
function SquirrelLogo({ size = 32 }: { size?: number }) {
  return (
    <svg
      aria-label="UIUC Squirrel Watch"
      viewBox="0 0 40 40"
      width={size}
      height={size}
      fill="none"
    >
      {/* Body */}
      <ellipse cx="20" cy="25" rx="10" ry="9" fill="hsl(28 65% 38%)" />
      {/* Head */}
      <circle cx="20" cy="15" r="7" fill="hsl(28 65% 38%)" />
      {/* Ear left */}
      <ellipse cx="14.5" cy="10" rx="2.5" ry="3.5" fill="hsl(28 65% 38%)" />
      {/* Ear right */}
      <ellipse cx="25.5" cy="10" rx="2.5" ry="3.5" fill="hsl(28 65% 38%)" />
      {/* Fluffy tail */}
      <ellipse cx="32" cy="22" rx="5" ry="9" fill="hsl(32 60% 55%)" transform="rotate(-20 32 22)" />
      {/* Eye */}
      <circle cx="17.5" cy="14.5" r="1.2" fill="white" />
      <circle cx="17.7" cy="14.6" r="0.6" fill="hsl(30 20% 14%)" />
      {/* Nose */}
      <circle cx="19" cy="17.5" r="0.7" fill="hsl(10 60% 55%)" />
      {/* Acorn */}
      <ellipse cx="25" cy="28" rx="3" ry="3.5" fill="hsl(42 85% 48%)" />
      <rect x="23.5" y="24.5" width="3" height="1.5" rx="0.5" fill="hsl(28 50% 30%)" />
      <line x1="25" y1="24.5" x2="25" y2="22" stroke="hsl(28 50% 30%)" strokeWidth="0.8" />
    </svg>
  );
}

/* ─── Probability Gauge ─── */
function ProbGauge({ score, label }: { score: number; label: string }) {
  const r = 52;
  const circ = 2 * Math.PI * r;
  const offset = circ - (score / 100) * circ;
  const color = score >= 75 ? "hsl(148 45% 30%)" : score >= 50 ? "hsl(28 65% 38%)" : "hsl(0 60% 50%)";

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative w-36 h-36">
        <svg viewBox="0 0 120 120" className="w-full h-full -rotate-90">
          <circle cx="60" cy="60" r={r} stroke="hsl(var(--muted))" strokeWidth="10" fill="none" />
          <circle
            cx="60" cy="60" r={r}
            stroke={color}
            strokeWidth="10"
            fill="none"
            strokeLinecap="round"
            strokeDasharray={circ}
            strokeDashoffset={offset}
            className="gauge-ring"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={`text-3xl font-black ${getScoreColor(score)}`} style={{ fontFamily: 'var(--font-display)' }}>
            {score}%
          </span>
          <span className="text-xs text-muted-foreground mt-0.5">概率</span>
        </div>
      </div>
      <p className={`text-sm font-semibold text-center ${getScoreColor(score)}`}>{label}</p>
    </div>
  );
}

/* ─── Hourly Activity Chart ─── */
function HourlyChart({ hourly, sunriseHour, sunsetHour }: {
  hourly: HourlyForecast[];
  sunriseHour: number;
  sunsetHour: number;
}) {
  const maxTemp = Math.max(...hourly.map(h => h.temp));
  const minTemp = Math.min(...hourly.map(h => h.temp));
  const range = maxTemp - minTemp || 1;

  return (
    <div className="space-y-2">
      <div className="flex items-end gap-0.5 h-28">
        {hourly.map((h) => {
          const isDay = h.hour >= sunriseHour && h.hour <= sunsetHour;
          const tempNorm = (h.temp - minTemp) / range;
          const heightPct = 30 + tempNorm * 65;
          const isPeak = (h.hour >= 7 && h.hour <= 9) || (h.hour >= 16 && h.hour <= 18);
          return (
            <div
              key={h.hour}
              className="flex-1 relative group self-end"
              style={{ height: `${heightPct}%` }}
              data-testid={`bar-hour-${h.hour}`}
            >
              {/* Tooltip */}
              <div className="absolute -top-10 left-1/2 -translate-x-1/2 bg-popover border border-border text-popover-foreground text-xs px-2 py-1 rounded-md opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-10 shadow-md">
                {h.hour}:00 · {Math.round(h.temp)}°F · {Math.round(h.wind)} mph
              </div>
              <div
                className={`w-full h-full rounded-t-sm activity-bar ${
                  !isDay ? "bg-slate-300 dark:bg-slate-600" :
                  isPeak ? "bg-primary" : "bg-amber-400/80 dark:bg-amber-500/60"
                } ${h.precip > 0.2 ? "opacity-50" : ""}`}
              />
            </div>
          );
        })}
      </div>
      {/* Hour labels every 3h */}
      <div className="flex gap-1">
        {hourly.map((h) => (
          <div key={h.hour} className="flex-1 text-center">
            {h.hour % 3 === 0 && (
              <span className="text-[9px] text-muted-foreground">{h.hour}h</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── Main page ─── */
export default function Home() {
  const [locationId, setLocationId] = useState("quad");
  const [timeSlotId, setTimeSlotId] = useState(() => {
    const h = new Date().getHours();
    if (h < 8) return "dawn";
    if (h < 12) return "morning";
    if (h < 14) return "midday";
    if (h < 17) return "afternoon";
    if (h < 20) return "evening";
    return "night";
  });
  const [manualTemp, setManualTemp] = useState<number | null>(null);
  const [manualWind, setManualWind] = useState<number | null>(null);

  const loc = LOCATIONS.find(l => l.id === locationId)!;

  /* ─── Fetch weather from Open-Meteo ─── */
  const { data: weatherData, isLoading: weatherLoading } = useQuery<WeatherData>({
    queryKey: ["/api/weather"],
    queryFn: async () => {
      const res = await fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${UIUC_LAT}&longitude=${UIUC_LNG}` +
        `&current=temperature_2m,apparent_temperature,precipitation,wind_speed_10m,weather_code` +
        `&temperature_unit=fahrenheit&wind_speed_unit=mph&precipitation_unit=inch&timezone=America/Chicago`
      );
      const d = await res.json();
      const c = d.current;
      return {
        temperature: c.temperature_2m,
        windspeed: c.wind_speed_10m,
        weathercode: c.weather_code,
        apparent_temperature: c.apparent_temperature,
        precipitation: c.precipitation,
      };
    },
    staleTime: 10 * 60 * 1000,
  });

  /* ─── Fetch hourly forecast ─── */
  const { data: hourlyData } = useQuery<HourlyForecast[]>({
    queryKey: ["/api/hourly"],
    queryFn: async () => {
      const res = await fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${UIUC_LAT}&longitude=${UIUC_LNG}` +
        `&hourly=temperature_2m,wind_speed_10m,precipitation_probability` +
        `&temperature_unit=fahrenheit&wind_speed_unit=mph&forecast_days=1&timezone=America/Chicago`
      );
      const d = await res.json();
      return d.hourly.time.slice(0, 24).map((t: string, i: number) => ({
        hour: new Date(t).getHours(),
        temp: d.hourly.temperature_2m[i],
        wind: d.hourly.wind_speed_10m[i],
        precip: d.hourly.precipitation_probability[i] / 100,
      }));
    },
    staleTime: 15 * 60 * 1000,
  });

  /* ─── Fetch sunrise/sunset ─── */
  const { data: sunData } = useQuery<SunData>({
    queryKey: ["/api/sun"],
    queryFn: async () => {
      const today = new Date().toISOString().split("T")[0];
      const res = await fetch(
        `https://api.sunrisesunset.io/json?lat=${UIUC_LAT}&lng=${UIUC_LNG}&date=${today}&timezone=America/Chicago`
      );
      const d = await res.json();
      return {
        sunrise: d.results.sunrise,
        sunset: d.results.sunset,
        golden_hour_morning: d.results.golden_hour,
        golden_hour_evening: "",
      };
    },
    staleTime: 60 * 60 * 1000,
  });

  /* ─── Fetch iNaturalist squirrel obs near UIUC ─── */
  const { data: iNatData } = useQuery<{ count: number; recent: string[] }>({
    queryKey: ["/api/inat", locationId],
    queryFn: async () => {
      const locCoords = LOCATIONS.find(l => l.id === locationId)!;
      const res = await fetch(
        `https://api.inaturalist.org/v1/observations?` +
        `taxon_name=Sciurus+carolinensis&` +
        `lat=${locCoords.lat}&lng=${locCoords.lng}&radius=0.3&` +
        `quality_grade=research&per_page=10&order_by=observed_on&` +
        `d1=${new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]}`
      );
      const d = await res.json();
      const recent = (d.results || []).slice(0, 3).map((obs: Record<string, unknown>) => {
        const dateStr = obs.observed_on as string || "";
        return dateStr;
      });
      return { count: d.total_results ?? 0, recent };
    },
    staleTime: 60 * 60 * 1000,
  });

  /* ─── Compute current probability ─── */
  const parseHour = (timeStr: string): number => {
    if (!timeStr) return 6;
    const [time, ampm] = timeStr.split(" ");
    let [h] = time.split(":").map(Number);
    if (ampm === "PM" && h !== 12) h += 12;
    if (ampm === "AM" && h === 12) h = 0;
    return h;
  };

  const sunriseHour = sunData ? parseHour(sunData.sunrise) : 6;
  const sunsetHour  = sunData ? parseHour(sunData.sunset)  : 20;

  const slotHour = parseInt(TIME_SLOTS.find(s => s.id === timeSlotId)?.range.split("–")[0] || "12");

  const currentHourData = hourlyData?.find(h => h.hour === slotHour);
  const precipProb = currentHourData?.precip ?? 0;

  const effectiveTemp = manualTemp ?? weatherData?.temperature ?? 65;
  const effectiveWind = manualWind ?? weatherData?.windspeed ?? 8;

  const { score, factors } = computeProbability({
    temp: effectiveTemp,
    wind: effectiveWind,
    timeSlotId,
    locationId,
    precipProb,
    sunriseHour,
    sunsetHour,
    iNatCount: iNatData?.count ?? 0,
    currentHour: new Date().getHours(),
  });

  const today = new Date().toLocaleDateString("zh-CN", {
    month: "long", day: "numeric", weekday: "long"
  });

  return (
    <div className="min-h-screen bg-background">
      {/* ─── Header ─── */}
      <header className="sticky top-0 z-50 border-b border-border bg-background/90 backdrop-blur-md">
        <div className="max-w-4xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <SquirrelLogo size={30} />
            <div>
              <h1 className="text-base font-bold leading-tight" style={{ fontFamily: 'var(--font-display)' }}>
                UIUC Squirrel Watch
              </h1>
              <p className="text-[10px] text-muted-foreground leading-tight">校园松鼠活动预测</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs hidden sm:flex items-center gap-1">
              <MapPin size={10} /> Champaign, IL
            </Badge>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-6 space-y-5">

        {/* ─── Hero row: date + weather ─── */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-muted-foreground text-sm">{today}</p>
            <h2 className="text-xl font-bold mt-0.5" style={{ fontFamily: 'var(--font-display)' }}>
              今天去找松鼠？
              <span className="squirrel-bounce ml-2 text-2xl">🐿️</span>
            </h2>
          </div>
          {weatherLoading ? (
            <Skeleton className="h-10 w-28 rounded-xl" />
          ) : weatherData && (
            <div className="flex items-center gap-3 bg-card border border-border rounded-xl px-4 py-2">
              <span className="text-2xl">{getWeatherEmoji(weatherData.weathercode)}</span>
              <div className="text-right">
                <p className="text-lg font-bold leading-tight">{Math.round(weatherData.temperature)}°F</p>
                <p className="text-xs text-muted-foreground flex items-center gap-1 justify-end">
                  <Wind size={10} /> {Math.round(weatherData.windspeed)} mph
                </p>
              </div>
            </div>
          )}
        </div>

        {/* ─── Main content grid ─── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

          {/* ─── Left: Filters column ─── */}
          <div className="lg:col-span-1 space-y-4">

            {/* Location picker */}
            <Card>
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <MapPin size={14} className="text-primary" /> 地点
                </CardTitle>
              </CardHeader>
              <CardContent className="px-3 pb-4 space-y-1">
                {LOCATIONS.map(l => (
                  <button
                    key={l.id}
                    onClick={() => setLocationId(l.id)}
                    data-testid={`button-location-${l.id}`}
                    className={`w-full text-left px-3 py-2.5 rounded-lg transition-all text-sm ${
                      locationId === l.id
                        ? "bg-primary text-primary-foreground font-semibold"
                        : "hover:bg-muted text-foreground"
                    }`}
                  >
                    <span className="mr-2">{l.emoji}</span>
                    <span>{l.name}</span>
                  </button>
                ))}
                <p className="text-xs text-muted-foreground pt-1 px-1">{loc.desc}</p>
              </CardContent>
            </Card>

            {/* Time slot */}
            <Card>
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Clock size={14} className="text-primary" /> 时间段
                </CardTitle>
              </CardHeader>
              <CardContent className="px-3 pb-4">
                <div className="grid grid-cols-2 gap-1.5">
                  {TIME_SLOTS.map(s => (
                    <button
                      key={s.id}
                      onClick={() => setTimeSlotId(s.id)}
                      data-testid={`button-timeslot-${s.id}`}
                      className={`px-2 py-2 rounded-lg text-xs font-medium transition-all ${
                        timeSlotId === s.id
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted hover:bg-muted/70 text-foreground"
                      }`}
                    >
                      <div className="font-semibold">{s.label}</div>
                      <div className="opacity-70 text-[10px]">{s.range}</div>
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Manual weather override */}
            <Card>
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Thermometer size={14} className="text-primary" /> 手动调参
                  <span className="text-xs font-normal text-muted-foreground">(覆盖实况)</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4 space-y-5">
                <div className="space-y-2">
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">温度</span>
                    <span className="font-medium">{manualTemp ?? Math.round(weatherData?.temperature ?? 65)}°F</span>
                  </div>
                  <Slider
                    min={10} max={100} step={1}
                    value={[manualTemp ?? Math.round(weatherData?.temperature ?? 65)]}
                    onValueChange={([v]) => setManualTemp(v)}
                    data-testid="slider-temperature"
                  />
                  <div className="flex justify-between text-[10px] text-muted-foreground">
                    <span>10°F (很冷)</span><span>100°F (很热)</span>
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">风速</span>
                    <span className="font-medium">{manualWind ?? Math.round(weatherData?.windspeed ?? 8)} mph</span>
                  </div>
                  <Slider
                    min={0} max={40} step={1}
                    value={[manualWind ?? Math.round(weatherData?.windspeed ?? 8)]}
                    onValueChange={([v]) => setManualWind(v)}
                    data-testid="slider-wind"
                  />
                  <div className="flex justify-between text-[10px] text-muted-foreground">
                    <span>0 (无风)</span><span>40+ mph</span>
                  </div>
                </div>
                {(manualTemp !== null || manualWind !== null) && (
                  <button
                    onClick={() => { setManualTemp(null); setManualWind(null); }}
                    className="text-xs text-primary underline-offset-2 hover:underline"
                    data-testid="button-reset-manual"
                  >
                    恢复实况数据
                  </button>
                )}
              </CardContent>
            </Card>
          </div>

          {/* ─── Right: Results column ─── */}
          <div className="lg:col-span-2 space-y-4">

            {/* Probability card */}
            <Card className="overflow-hidden">
              <div className="bg-gradient-to-br from-card to-muted/30 p-5">
                <div className="flex flex-col sm:flex-row items-center gap-6">
                  <ProbGauge score={score} label={getScoreLabel(score)} />
                  <div className="flex-1 space-y-2">
                    <h3 className="font-bold text-base" style={{ fontFamily: 'var(--font-display)' }}>
                      {loc.emoji} {loc.name} · {TIME_SLOTS.find(s => s.id === timeSlotId)?.label}
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      {score >= 70
                        ? "现在是出门的好时机。带点坚果更容易吸引它们靠近。"
                        : score >= 45
                        ? "有一定概率，选个树多的角落守株待兔。"
                        : "今天可能不太顺，建议换个时间段或地点。"}
                    </p>
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {factors.map((f, i) => (
                        <span
                          key={i}
                          className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border ${
                            f.positive
                              ? "bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800 text-green-700 dark:text-green-300"
                              : "bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800 text-red-600 dark:text-red-300"
                          }`}
                        >
                          {f.positive ? "+" : ""}{f.impact} {f.label}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </Card>

            {/* Compare all locations */}
            <Card>
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <TrendingUp size={14} className="text-primary" /> 各地点今日对比
                  <span className="text-xs font-normal text-muted-foreground">· {TIME_SLOTS.find(s => s.id === timeSlotId)?.label}</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4 space-y-2">
                {LOCATIONS.map(l => {
                  const { score: s } = computeProbability({
                    temp: effectiveTemp,
                    wind: effectiveWind,
                    timeSlotId,
                    locationId: l.id,
                    precipProb,
                    sunriseHour,
                    sunsetHour,
                    iNatCount: l.id === locationId ? (iNatData?.count ?? 0) : 5,
                    currentHour: new Date().getHours(),
                  });
                  return (
                    <div key={l.id} className="flex items-center gap-3" data-testid={`compare-${l.id}`}>
                      <span className="w-5 text-center text-sm">{l.emoji}</span>
                      <span className="text-xs w-28 shrink-0 truncate">{l.name}</span>
                      <div className="flex-1 bg-muted rounded-full h-2 overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-700 ${
                            s >= 70 ? "bg-green-500" : s >= 45 ? "bg-amber-500" : "bg-red-400"
                          }`}
                          style={{ width: `${s}%` }}
                        />
                      </div>
                      <span className={`text-xs font-bold w-9 text-right ${getScoreColor(s)}`}>{s}%</span>
                    </div>
                  );
                })}
              </CardContent>
            </Card>

            {/* Today's activity forecast */}
            <Card>
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Sun size={14} className="text-primary" /> 今日活动趋势
                  <span className="text-xs font-normal text-muted-foreground">· 按小时</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                {hourlyData ? (
                  <HourlyChart hourly={hourlyData} sunriseHour={sunriseHour} sunsetHour={sunsetHour} />
                ) : (
                  <Skeleton className="h-24 w-full rounded-lg" />
                )}
                <div className="flex gap-4 mt-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <span className="w-3 h-2 rounded-sm bg-primary inline-block" /> 高峰时段
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-3 h-2 rounded-sm bg-primary/50 inline-block" /> 日间
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-3 h-2 rounded-sm bg-slate-400/40 inline-block" /> 夜晚
                  </span>
                  {sunData && (
                    <span className="ml-auto">
                      🌅 {sunData.sunrise} — {sunData.sunset} 🌇
                    </span>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* iNaturalist + sun data row */}
            <div className="grid grid-cols-2 gap-4">
              <Card>
                <CardHeader className="pb-2 pt-4 px-4">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <span className="text-base">🗺️</span> iNaturalist 记录
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4">
                  {iNatData ? (
                    <div className="space-y-1">
                      <p className="text-2xl font-black" style={{ fontFamily: 'var(--font-display)' }}>
                        {iNatData.count}
                      </p>
                      <p className="text-xs text-muted-foreground">过去一年，{loc.name} 300m 范围内的研究级目击记录</p>
                      {iNatData.count > 0 && (
                        <a
                          href={`https://www.inaturalist.org/observations?taxon_name=Sciurus+carolinensis&lat=${loc.lat}&lng=${loc.lng}&radius=0.3&quality_grade=research`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-primary underline-offset-2 hover:underline mt-1 inline-block"
                          data-testid="link-inat"
                        >
                          在 iNaturalist 查看 →
                        </a>
                      )}
                    </div>
                  ) : (
                    <Skeleton className="h-16 w-full rounded-lg" />
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2 pt-4 px-4">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <Sun size={14} className="text-amber-500" /> 日出日落
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4">
                  {sunData ? (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="text-base">🌅</span>
                        <div>
                          <p className="text-xs text-muted-foreground">日出</p>
                          <p className="font-semibold text-sm">{sunData.sunrise}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-base">🌇</span>
                        <div>
                          <p className="text-xs text-muted-foreground">日落</p>
                          <p className="font-semibold text-sm">{sunData.sunset}</p>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <Skeleton className="h-16 w-full rounded-lg" />
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Methodology note */}
            <Card className="bg-muted/30 border-dashed">
              <CardContent className="px-4 py-3">
                <p className="text-xs text-muted-foreground flex gap-2">
                  <Info size={12} className="mt-0.5 shrink-0 text-primary" />
                  <span>概率由温度、风速、时段、历史目击数据（iNaturalist）和日出日落计算，参考东部灰松鼠（Sciurus carolinensis）行为研究。天气数据来自 <a href="https://open-meteo.com" className="underline hover:text-primary" target="_blank" rel="noopener noreferrer">Open-Meteo</a>，日出日落来自 <a href="https://sunrisesunset.io" className="underline hover:text-primary" target="_blank" rel="noopener noreferrer">SunriseSunset.io</a>。</span>
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>

      {/* ─── Footer ─── */}
      <footer className="border-t border-border mt-8 py-4 text-center text-xs text-muted-foreground">
        UIUC Squirrel Watch · Data: Open-Meteo, SunriseSunset.io, iNaturalist · for fun only 🐿️
      </footer>
    </div>
  );
}
