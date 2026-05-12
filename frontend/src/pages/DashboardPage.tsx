import { useAuth } from '../app/context/AuthContext';
import { useEffect, useMemo, useState } from 'react';
import { Mail, BookOpen, Calendar, TrendingUp, Clock, CheckCircle, AlertCircle } from 'lucide-react';
import { Progress } from '../components/ui/progress';
import { apiUrl } from '../lib/api';

type Priority = 'high' | 'medium' | 'low';

interface DashboardData {
  metrics: {
    emailsToday: number;
    pendingAssignments: number;
    scheduledMeetings: number;
    productivityScore: number;
  };
  todayTasks: { title: string; time: string; priority: Priority }[];
  upcomingDeadlines: { title: string; due: string; subject: string; progress: number }[];
  aiSuggestions: string[];
}

export default function DashboardPage() {
  const { user } = useAuth();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const getCurrentGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good Morning';
    if (hour < 18) return 'Good Afternoon';
    return 'Good Evening';
  };

  useEffect(() => {
    const loadDashboard = async () => {
      try {
        const emailQuery = user?.email ? `?email=${encodeURIComponent(user.email)}` : '';
        const res = await fetch(`${apiUrl('/dashboard/summary')}${emailQuery}`);
        const responseData = await res.json();
        if (!res.ok) throw new Error(responseData.msg || 'Failed to load dashboard');
        setData(responseData);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load dashboard');
      } finally {
        setLoading(false);
      }
    };

    void loadDashboard();
  }, [user?.email]);

  const metrics = useMemo(() => {
    if (!data) return [];
    return [
      { label: 'Emails Today', value: String(data.metrics.emailsToday), icon: Mail, color: 'from-primary to-primary/80' },
      { label: 'Pending Assignments', value: String(data.metrics.pendingAssignments), icon: BookOpen, color: 'from-primary/80 to-primary' },
      { label: 'Scheduled Meetings', value: String(data.metrics.scheduledMeetings), icon: Calendar, color: 'from-primary to-primary' },
      { label: 'Productivity Score', value: `${data.metrics.productivityScore}%`, icon: TrendingUp, color: 'from-primary/80 to-primary' },
    ];
  }, [data]);

  const todayTasks = data?.todayTasks || [];
  const upcomingDeadlines = data?.upcomingDeadlines || [];
  const aiSuggestions = data?.aiSuggestions || [];
  const weekDays = useMemo(() => {
    const now = new Date();
    const day = now.getDay();
    const diffToMonday = day === 0 ? -6 : 1 - day;
    const monday = new Date(now);
    monday.setDate(now.getDate() + diffToMonday);
    return Array.from({ length: 7 }, (_, index) => {
      const date = new Date(monday);
      date.setDate(monday.getDate() + index);
      const isToday = date.toDateString() === now.toDateString();
      return {
        label: date.toLocaleDateString(undefined, { weekday: 'short' }),
        dateNumber: date.getDate(),
        isToday,
      };
    });
  }, []);

  return (
    <div className="space-y-8 max-w-7xl">
      {/* Welcome Header */}
      <div className="bg-gradient-to-r from-primary via-primary/90 to-primary rounded-2xl p-8 text-white shadow-2xl relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-primary/20 to-primary/80/20 backdrop-blur-sm"></div>
        <div className="relative z-10">
          <h1 className="text-4xl font-bold mb-2">
            {getCurrentGreeting()}, {user?.name || 'Student'}! 👋
          </h1>
          <p className="text-lg text-white/90">
            Here's your productivity overview for today
          </p>
        </div>
      </div>

      {/* Metrics Grid */}
      {loading && (
        <div className="text-muted-foreground">Loading dashboard...</div>
      )}

      {error && (
        <div className="text-destructive">{error}</div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {metrics.map((metric, index) => {
          const Icon = metric.icon;
          return (
            <div
              key={index}
              className="bg-card rounded-2xl p-6 shadow-lg hover:shadow-2xl hover:shadow-primary/10 transition-all hover:-translate-y-1 border border-border"
            >
              <div className="flex items-start justify-between mb-4">
                <div className={`p-3 rounded-xl bg-gradient-to-br ${metric.color}`}>
                  <Icon className="w-6 h-6 text-white" />
                </div>
              </div>
              <p className="text-3xl font-bold mb-1 text-foreground">{metric.value}</p>
              <p className="text-sm text-muted-foreground">{metric.label}</p>
            </div>
          );
        })}
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Today's Tasks */}
        <div className="bg-card rounded-2xl p-6 shadow-lg border border-border">
          <div className="flex items-center gap-2 mb-6">
            <Clock className="w-5 h-5 text-primary" />
            <h2 className="text-xl font-bold text-foreground">Today's Tasks</h2>
          </div>
          <ul role="list" className="space-y-3">
            {todayTasks.map((task, index) => {
              const bar =
                task.priority === 'high'
                  ? 'bg-destructive'
                  : task.priority === 'medium'
                    ? 'bg-secondary-warn'
                    : 'bg-primary';
              return (
                <li
                  key={`${task.title}-${index}`}
                  className="flex overflow-hidden rounded-xl border border-border bg-muted/15"
                >
                  <div className={`w-1 shrink-0 ${bar}`} aria-hidden />
                  <div className="flex flex-1 items-start gap-3 p-3 min-w-0">
                    <span
                      className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-bold text-primary ring-1 ring-primary/25"
                      aria-hidden
                    >
                      {index + 1}
                    </span>
                    <div className="flex-1 min-w-0 pt-0.5">
                      <p className="font-medium text-foreground leading-snug">{task.title}</p>
                      <p className="text-sm text-muted-foreground mt-0.5">{task.time}</p>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>

        {/* Upcoming Deadlines */}
        <div className="bg-card rounded-2xl p-6 shadow-lg border border-border">
          <div className="flex items-center gap-2 mb-6">
            <AlertCircle className="w-5 h-5 text-primary/80" />
            <h2 className="text-xl font-bold text-foreground">Upcoming Deadlines</h2>
          </div>
          <div className="space-y-5">
            {upcomingDeadlines.map((item, index) => (
              <div key={index} className="space-y-2">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-medium text-foreground">{item.title}</p>
                    <p className="text-sm text-muted-foreground">{item.subject}</p>
                  </div>
                  <span className="text-xs font-semibold text-primary bg-primary/10 px-2 py-1 rounded-lg">
                    {item.due}
                  </span>
                </div>
                <div className="space-y-1">
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Progress</span>
                    <span>{item.progress}%</span>
                  </div>
                  <Progress value={item.progress} className="h-2" />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* AI Suggestions */}
        <div className="bg-gradient-to-br from-primary/10 to-primary/80/10 rounded-2xl p-6 shadow-lg border border-primary/20">
          <div className="flex items-center gap-2 mb-6">
            <CheckCircle className="w-5 h-5 text-primary" />
            <h2 className="text-xl font-bold text-foreground">AI Suggestions</h2>
          </div>
          <div className="space-y-4">
            {aiSuggestions.map((suggestion, index) => (
              <div
                key={index}
                className="flex items-start gap-3 p-3 bg-card rounded-xl border border-border"
              >
                <div className="mt-1 w-2 h-2 rounded-full bg-primary"></div>
                <p className="text-sm text-foreground">{suggestion}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Calendar Preview Widget */}
      <div className="bg-card rounded-2xl p-6 shadow-lg border border-border">
        <h2 className="text-xl font-bold mb-4 text-foreground">This Week at a Glance</h2>
        <div className="grid grid-cols-7 gap-2">
          {weekDays.map((day) => (
            <div key={`${day.label}-${day.dateNumber}`} className="text-center">
              <p className="text-xs text-muted-foreground mb-2">{day.label}</p>
              <div className={`h-16 rounded-xl flex items-center justify-center ${
                day.isToday ? 'bg-gradient-to-br from-primary to-primary/80 text-white font-bold shadow-lg shadow-primary/30' : 'bg-muted text-muted-foreground'
              }`}>
                <span className="text-sm">{day.dateNumber}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
