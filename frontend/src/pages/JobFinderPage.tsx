import { useCallback, useEffect, useMemo, useState } from 'react';
import { Search, MapPin, DollarSign, Briefcase, Bookmark, Send, Trash2, Filter } from 'lucide-react';
import { Input } from '../components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { apiUrl } from '../lib/api';
import { useAuth } from '../app/context/AuthContext';

interface Job {
  id: number | string;
  job_id?: string;
  title: string;
  company: string;
  location: string;
  type: string;
  salary: string;
  description: string;
  url?: string;
  saved: boolean;
}

const stableKey = (job: Job) => String(job.job_id || '').trim() || `idx-${job.id}`;

const emailHeaders = (email: string) => ({ 'x-user-email': email });

export default function JobFinderPage() {
  const { user } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [locationFilter, setLocationFilter] = useState('all');
  const [jobTypeFilter, setJobTypeFilter] = useState('all');
  const [jobs, setJobs] = useState<Job[]>([]);
  const [savedJobs, setSavedJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(false);
  const [savedLoading, setSavedLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshSavedJobs = useCallback(async () => {
    if (!user?.email) {
      setSavedJobs([]);
      return;
    }
    setSavedLoading(true);
    try {
      const res = await fetch(apiUrl('/jobs/saved'), { headers: emailHeaders(user.email) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.msg || 'Failed to load saved jobs');
      setSavedJobs(Array.isArray(data) ? data : []);
    } catch {
      setSavedJobs([]);
    } finally {
      setSavedLoading(false);
    }
  }, [user?.email]);

  useEffect(() => {
    void refreshSavedJobs();
  }, [refreshSavedJobs]);

  useEffect(() => {
    const loadJobs = async () => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        if (searchQuery.trim()) params.set('q', searchQuery.trim());
        if (locationFilter !== 'all') params.set('location', locationFilter);
        if (jobTypeFilter !== 'all') params.set('type', jobTypeFilter);

        const headers: Record<string, string> = {};
        if (user?.email) Object.assign(headers, emailHeaders(user.email));

        const res = await fetch(apiUrl(`/jobs?${params.toString()}`), { headers });
        const data = await res.json();
        if (!res.ok) throw new Error(data.msg || 'Failed to fetch jobs');
        setJobs(Array.isArray(data) ? data : []);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch jobs');
        setJobs([]);
      } finally {
        setLoading(false);
      }
    };

    const timer = setTimeout(() => {
      void loadJobs();
    }, 250);
    return () => clearTimeout(timer);
  }, [searchQuery, locationFilter, jobTypeFilter, user?.email]);

  const toggleSave = async (job: Job) => {
    if (!user?.email) {
      setError('Sign in to save jobs.');
      return;
    }
    const key = stableKey(job);
    const nextSaved = !job.saved;
    setError(null);
    try {
      if (nextSaved) {
        const res = await fetch(apiUrl('/jobs/saved'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...emailHeaders(user.email) },
          body: JSON.stringify({
            job_id: key,
            title: job.title,
            company: job.company,
            location: job.location,
            type: job.type,
            salary: job.salary,
            description: job.description,
            url: job.url || '',
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.msg || 'Could not save job');
        setJobs((prev) =>
          prev.map((j) => (stableKey(j) === key ? { ...j, saved: true } : j))
        );
      } else {
        const res = await fetch(apiUrl(`/jobs/saved?job_id=${encodeURIComponent(key)}`), {
          method: 'DELETE',
          headers: emailHeaders(user.email),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.msg || 'Could not remove save');
        setJobs((prev) =>
          prev.map((j) => (stableKey(j) === key ? { ...j, saved: false } : j))
        );
      }
      await refreshSavedJobs();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    }
  };

  const deleteJob = async (job: Job) => {
    if (user?.email && job.saved) {
      try {
        const res = await fetch(
          apiUrl(`/jobs/saved?job_id=${encodeURIComponent(stableKey(job))}`),
          { method: 'DELETE', headers: emailHeaders(user.email) }
        );
        if (res.ok) await refreshSavedJobs();
      } catch {
        /* still remove from list */
      }
    }
    setJobs((prev) => prev.filter((j) => stableKey(j) !== stableKey(job)));
  };

  const savedKeySet = useMemo(() => new Set(savedJobs.map(stableKey)), [savedJobs]);

  const mainListJobs = useMemo(
    () => jobs.filter((j) => !(savedKeySet.has(stableKey(j)) && j.saved)),
    [jobs, savedKeySet]
  );

  const renderJobCard = (job: Job, list: 'search' | 'saved') => (
    <div
      key={`${list}-${stableKey(job)}`}
      className="bg-card backdrop-blur-sm rounded-2xl p-6 shadow-lg hover:shadow-2xl hover:shadow-primary/10 transition-all border border-border group"
    >
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1">
          <h3 className="text-xl font-bold text-foreground mb-1 group-hover:text-primary transition-colors">
            {job.title}
          </h3>
          <p className="text-lg text-muted-foreground mb-3">{job.company}</p>

          <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
            <div className="flex items-center gap-1">
              <MapPin className="w-4 h-4" />
              <span>{job.location}</span>
            </div>
            <div className="flex items-center gap-1">
              <Briefcase className="w-4 h-4" />
              <span className="px-2 py-1 bg-primary/20 text-primary/80 rounded-lg">{job.type}</span>
            </div>
            <div className="flex items-center gap-1">
              <DollarSign className="w-4 h-4" />
              <span className="font-semibold text-primary/80">{job.salary}</span>
            </div>
          </div>
        </div>
      </div>

      <p className="text-muted-foreground mb-4">{job.description}</p>

      <div className="flex gap-3">
        <button
          type="button"
          onClick={() => void toggleSave(job)}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl transition-all ${
            job.saved || list === 'saved'
              ? 'bg-secondary-warn/20 text-secondary-warn border border-secondary-warn/30'
              : 'bg-background text-muted-foreground border border-border hover:bg-card'
          }`}
        >
          <Bookmark className={`w-4 h-4 ${job.saved || list === 'saved' ? 'fill-current' : ''}`} />
          <span className="text-sm">{job.saved || list === 'saved' ? 'Saved' : 'Save'}</span>
        </button>

        <button
          type="button"
          onClick={() => {
            if (job.url) window.open(job.url, '_blank', 'noopener,noreferrer');
          }}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-primary to-primary/80 text-white hover:shadow-lg hover:shadow-primary/30 transition-all"
        >
          <Send className="w-4 h-4" />
          <span className="text-sm">Apply</span>
        </button>

        {list === 'search' && (
          <button
            type="button"
            onClick={() => void deleteJob(job)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-destructive/20 text-destructive border border-destructive/30 hover:bg-destructive/30 transition-all"
          >
            <Trash2 className="w-4 h-4" />
            <span className="text-sm">Delete</span>
          </button>
        )}
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-primary to-primary/80 rounded-3xl p-8 text-white shadow-xl">
        <h1 className="text-4xl font-bold mb-2">Job Finder</h1>
        <p className="text-lg text-white/90">Discover opportunities tailored to your skills and schedule</p>
      </div>

      {!user?.email && (
        <p className="text-sm text-muted-foreground bg-card border border-border rounded-xl px-4 py-3">
          Sign in to save jobs — your saved list is stored with your account.
        </p>
      )}

      <div className="bg-card backdrop-blur-sm rounded-2xl p-6 shadow-lg border border-border">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-foreground">Saved jobs</h2>
          {savedLoading && <span className="text-sm text-muted-foreground">Loading…</span>}
        </div>
        {savedJobs.length === 0 && !savedLoading ? (
          <p className="text-muted-foreground text-sm">No saved jobs yet. Use Save on a listing below.</p>
        ) : (
          <div className="space-y-4">{savedJobs.map((job) => renderJobCard(job, 'saved'))}</div>
        )}
      </div>

      <div className="bg-card backdrop-blur-sm rounded-2xl p-6 shadow-lg border border-border space-y-4">
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Search for jobs or companies..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-12 h-12 bg-background border-border text-foreground rounded-xl"
          />
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm font-medium text-foreground">Filters:</span>
          </div>

          <Select value={locationFilter} onValueChange={setLocationFilter}>
            <SelectTrigger className="w-48 rounded-xl bg-background border-border text-foreground">
              <MapPin className="w-4 h-4 mr-2" />
              <SelectValue placeholder="Location" />
            </SelectTrigger>
            <SelectContent className="bg-card border-border">
              <SelectItem value="all">All Locations</SelectItem>
              <SelectItem value="Remote">Remote</SelectItem>
              <SelectItem value="San Francisco">San Francisco</SelectItem>
              <SelectItem value="New York">New York</SelectItem>
              <SelectItem value="Austin">Austin</SelectItem>
              <SelectItem value="Boston">Boston</SelectItem>
            </SelectContent>
          </Select>

          <Select value={jobTypeFilter} onValueChange={setJobTypeFilter}>
            <SelectTrigger className="w-48 rounded-xl bg-background border-border text-foreground">
              <Briefcase className="w-4 h-4 mr-2" />
              <SelectValue placeholder="Job Type" />
            </SelectTrigger>
            <SelectContent className="bg-card border-border">
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="Internship">Internship</SelectItem>
              <SelectItem value="Part-time">Part-time</SelectItem>
              <SelectItem value="Full-time">Full-time</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <h2 className="text-lg font-semibold text-foreground px-1">Search results</h2>
      {loading && <p className="text-muted-foreground">Loading jobs...</p>}
      {error && <p className="text-destructive">{error}</p>}
      <div className="space-y-4">
        {mainListJobs.map((job) => renderJobCard(job, 'search'))}
      </div>

      {mainListJobs.length === 0 && !loading && (
        <div className="bg-card backdrop-blur-sm rounded-2xl p-12 text-center shadow-lg border border-border">
          <Briefcase className="w-16 h-16 text-border mx-auto mb-4" />
          <p className="text-xl text-muted-foreground">No jobs found matching your criteria</p>
        </div>
      )}
    </div>
  );
}
