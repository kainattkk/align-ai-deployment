import express from "express";
import SavedJob from "../models/SavedJob.js";
import { getRequestedUserEmail } from "../services/googleService.js";

const router = express.Router();

const cache = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000;

const getCached = (key) => {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.ts > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  return hit.value;
};

const setCached = (key, value) => {
  cache.set(key, { ts: Date.now(), value });
};

const jobKey = (job) => {
  const id = String(job.job_id || "").trim();
  if (id) return id;
  return `idx-${job.id}`;
};

const FALLBACK_JOBS = [
  {
    id: 1,
    job_id: "fallback-1",
    title: "Software Engineering Intern",
    company: "TechCorp Inc.",
    location: "Remote",
    type: "Internship",
    salary: "$25 - $35/hr",
    description: "Join our product team and build full-stack features with React and Node.js.",
    url: "https://www.linkedin.com/jobs/",
  },
  {
    id: 2,
    job_id: "fallback-2",
    title: "Frontend Developer (React)",
    company: "Bright Labs",
    location: "New York, NY",
    type: "Full-time",
    salary: "$90,000 - $115,000",
    description: "Build accessible UI features and collaborate with product designers in a fast-paced team.",
    url: "https://www.indeed.com/",
  },
  {
    id: 3,
    job_id: "fallback-3",
    title: "Backend Engineer (Node.js)",
    company: "CloudNova",
    location: "San Francisco, CA",
    type: "Full-time",
    salary: "$110,000 - $145,000",
    description: "Design scalable APIs and improve performance for mission-critical services.",
    url: "https://www.linkedin.com/jobs/",
  },
  {
    id: 4,
    job_id: "fallback-4",
    title: "Data Analyst Intern",
    company: "InsightWorks",
    location: "Austin, TX",
    type: "Internship",
    salary: "$22 - $30/hr",
    description: "Support analytics initiatives using SQL dashboards and exploratory data analysis.",
    url: "https://www.glassdoor.com/",
  },
  {
    id: 5,
    job_id: "fallback-5",
    title: "Machine Learning Engineer",
    company: "Vector AI",
    location: "Remote",
    type: "Full-time",
    salary: "$125,000 - $165,000",
    description: "Deploy ML models to production and optimize inference pipelines.",
    url: "https://www.linkedin.com/jobs/",
  },
  {
    id: 6,
    job_id: "fallback-6",
    title: "Product Designer",
    company: "PixelFlow",
    location: "Seattle, WA",
    type: "Full-time",
    salary: "$85,000 - $120,000",
    description: "Lead UX discovery and prototyping for student productivity products.",
    url: "https://www.indeed.com/",
  },
  {
    id: 7,
    job_id: "fallback-7",
    title: "DevOps Engineer",
    company: "InfraStack",
    location: "Chicago, IL",
    type: "Full-time",
    salary: "$105,000 - $135,000",
    description: "Automate CI/CD workflows and maintain cloud infrastructure reliability.",
    url: "https://www.glassdoor.com/",
  },
  {
    id: 8,
    job_id: "fallback-8",
    title: "QA Automation Engineer",
    company: "QualityFirst",
    location: "Remote",
    type: "Contract",
    salary: "$45 - $60/hr",
    description: "Build and maintain end-to-end test suites for web applications.",
    url: "https://www.linkedin.com/jobs/",
  },
];

const attachSavedFlags = async (jobs, userEmail) => {
  const list = Array.isArray(jobs) ? jobs : [];
  if (!userEmail) {
    return list.map((j) => ({ ...j, saved: false }));
  }
  const rows = await SavedJob.find({ userEmail }).select("sourceJobId").lean();
  const savedSet = new Set(rows.map((r) => String(r.sourceJobId)));
  return list.map((j) => ({
    ...j,
    saved: savedSet.has(jobKey(j)),
  }));
};

const docToJobDto = (doc) => ({
  id: doc.sourceJobId,
  job_id: doc.sourceJobId,
  title: doc.title || "",
  company: doc.company || "",
  location: doc.location || "",
  type: doc.type || "",
  salary: doc.salary || "",
  description: doc.description || "",
  url: doc.url || "",
  saved: true,
});

router.get("/saved", async (req, res) => {
  try {
    const userEmail = getRequestedUserEmail(req);
    if (!userEmail) return res.json([]);
    const docs = await SavedJob.find({ userEmail }).sort({ updatedAt: -1 }).lean();
    return res.json(docs.map(docToJobDto));
  } catch (_err) {
    return res.status(500).json({ msg: "Failed to load saved jobs" });
  }
});

router.post("/saved", async (req, res) => {
  try {
    const userEmail = getRequestedUserEmail(req);
    if (!userEmail) {
      return res.status(401).json({ msg: "Sign in to save jobs (email required)" });
    }
    const body = req.body || {};
    const sourceJobId = String(body.job_id || body.sourceJobId || "").trim();
    if (!sourceJobId) {
      return res.status(400).json({ msg: "Missing job_id" });
    }
    await SavedJob.findOneAndUpdate(
      { userEmail, sourceJobId },
      {
        $set: {
          userEmail,
          sourceJobId,
          title: String(body.title || ""),
          company: String(body.company || ""),
          location: String(body.location || ""),
          type: String(body.type || ""),
          salary: String(body.salary || ""),
          description: String(body.description || ""),
          url: String(body.url || ""),
        },
      },
      { upsert: true, new: true }
    );
    return res.json({ ok: true });
  } catch (_err) {
    return res.status(500).json({ msg: "Failed to save job" });
  }
});

router.delete("/saved", async (req, res) => {
  try {
    const userEmail = getRequestedUserEmail(req);
    const sourceJobId = String(req.query.job_id || "").trim();
    if (!userEmail || !sourceJobId) {
      return res.status(400).json({ msg: "Missing user email or job_id" });
    }
    await SavedJob.deleteOne({ userEmail, sourceJobId });
    return res.json({ ok: true });
  } catch (_err) {
    return res.status(500).json({ msg: "Failed to remove saved job" });
  }
});

router.get("/", async (req, res) => {
  const userEmail = getRequestedUserEmail(req);

  try {
    const q = String(req.query.q || "");
    const location = String(req.query.location || "");
    const type = String(req.query.type || "");
    const rawCountry = String(process.env.ADZUNA_COUNTRY || "us").toLowerCase();
    const country = rawCountry.includes("-") ? rawCountry.split("-")[0] : rawCountry;

    if (!process.env.JOBS_API_ID || !process.env.JOBS_API_KEY) {
      const withSaved = await attachSavedFlags(FALLBACK_JOBS, userEmail);
      return res.json(withSaved);
    }

    const cacheKey = `jobs:${q}:${location}:${type}:${country}`;
    const cached = getCached(cacheKey);
    if (cached) {
      const withSaved = await attachSavedFlags(cached, userEmail);
      return res.json(withSaved);
    }

    const params = new URLSearchParams({
      app_id: process.env.JOBS_API_ID,
      app_key: process.env.JOBS_API_KEY,
      results_per_page: "25",
      what: q || "software",
    });
    if (location) params.set("where", location);

    const adzunaUrl = `https://api.adzuna.com/v1/api/jobs/${country}/search/1?${params.toString()}`;
    const response = await fetch(adzunaUrl);
    const data = await response.json();
    if (!response.ok) {
      const withSaved = await attachSavedFlags(FALLBACK_JOBS, userEmail);
      return res.json(withSaved);
    }

    const jobs = Array.isArray(data.results)
      ? data.results.map((item, index) => ({
          id: index + 1,
          job_id: String(item.id || ""),
          title: String(item.title || ""),
          company: String(item.company?.display_name || ""),
          location: String(item.location?.display_name || ""),
          type: type || "Full-time",
          salary:
            item.salary_min && item.salary_max
              ? `$${Math.round(item.salary_min)} - $${Math.round(item.salary_max)}`
              : "",
          description: String(item.description || "").slice(0, 260),
          url: String(item.redirect_url || ""),
        }))
      : [];

    const output = jobs.length ? jobs : FALLBACK_JOBS;
    setCached(cacheKey, output);
    const withSaved = await attachSavedFlags(output, userEmail);
    return res.json(withSaved);
  } catch (_error) {
    const withSaved = await attachSavedFlags(FALLBACK_JOBS, userEmail);
    return res.json(withSaved);
  }
});

export default router;
