import express from "express";
import mongoose from "mongoose";
import { getAccountAndAccessToken, getRequestedUserEmail } from "../services/googleService.js";
import CalendarEvent from "../models/CalendarEvent.js";

const router = express.Router();

const isoOrNull = (value) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

router.get("/events", (req, res) => {
  const handler = async () => {
  const fromAt = isoOrNull(req.query.from_at);
  const toAt = isoOrNull(req.query.to_at);

  if (!fromAt || !toAt) {
    return res.status(400).json({ detail: "from_at and to_at are required ISO datetimes" });
  }

  const userEmail = getRequestedUserEmail(req);
  const localFilter = {
    ...(userEmail ? { userEmail } : {}),
    start_at: { $gte: new Date(fromAt), $lte: new Date(toAt) },
  };
  const localEvents = (await CalendarEvent.find(localFilter).sort({ start_at: 1 })).map((item) => ({
      id: String(item._id),
      googleEventId: String(item.googleEventId || ""),
      title: item.title,
      category: item.category,
      start_at: item.start_at.toISOString(),
      end_at: item.end_at.toISOString(),
      location: item.location || "",
      source: "local",
    }));
  let events = localEvents;

    if (userEmail) {
      try {
        const { accessToken } = await getAccountAndAccessToken(userEmail);
        const params = new URLSearchParams({
          timeMin: fromAt,
          timeMax: toAt,
          singleEvents: "true",
          orderBy: "startTime",
          maxResults: "250",
          // Ensure category metadata is returned (extendedProperties can be omitted otherwise).
          fields: "items(id,summary,location,start,end,extendedProperties)",
        });
        const response = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?${params.toString()}`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        const data = await response.json();
        if (response.ok) {
          const googleItems = Array.isArray(data.items) ? data.items : [];
          const googleEvents = googleItems.map((item) => {
            const startAt = item?.start?.dateTime || item?.start?.date || null;
            const endAt = item?.end?.dateTime || item?.end?.date || null;
            const rawCategory = String(item?.extendedProperties?.private?.alignai_category || "").toLowerCase();
            const category = ["meeting", "assignment", "personal"].includes(rawCategory) ? rawCategory : "meeting";
            return {
              id: String(item?.id || ""),
              googleEventId: String(item?.id || ""),
              title: String(item?.summary || "Event"),
              category,
              start_at: startAt ? new Date(startAt).toISOString() : null,
              end_at: endAt ? new Date(endAt).toISOString() : null,
              location: String(item?.location || ""),
              source: "google",
            };
          }).filter((e) => e.googleEventId && e.start_at && e.end_at);

          const merged = [];
          const seenGoogleIds = new Set();

          // Prefer local representation if it already references a Google event id.
          for (const ev of localEvents) {
            if (ev.googleEventId) seenGoogleIds.add(ev.googleEventId);
            merged.push(ev);
          }
          for (const ge of googleEvents) {
            if (seenGoogleIds.has(ge.googleEventId)) continue;
            merged.push(ge);
          }

          merged.sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime());
          events = merged;
        }
      } catch (_err) {
        // Fall back to local MongoDB-stored events for non-connected users.
      }
    }

    return res.json({ events });
  };
  handler().catch((err) => res.status(400).json({ detail: String(err.message || err) }));
});

router.post("/sync", (req, res) => {
  const fromAt = isoOrNull(req.query.from_at);
  const toAt = isoOrNull(req.query.to_at);
  if (!fromAt || !toAt) {
    return res.status(400).json({ detail: "from_at and to_at are required ISO datetimes" });
  }
  return res.json({ synced: 0 });
});

router.post("/events", (req, res) => {
  const handler = async () => {
  const title = String(req.body?.title || "").trim();
  const category = String(req.body?.category || "meeting").trim().toLowerCase();
  const startAt = isoOrNull(req.body?.start_at);
  const endAt = isoOrNull(req.body?.end_at);
  const location = String(req.body?.location || "");
  const alsoCreateGoogle = req.body?.also_create_google !== false;

  if (!title || !startAt || !endAt) {
    return res.status(400).json({ detail: "title, start_at and end_at are required" });
  }
  if (!["meeting", "assignment", "personal"].includes(category)) {
    return res.status(400).json({ detail: "category must be one of meeting, assignment, personal" });
  }

  const userEmail = getRequestedUserEmail(req);
  const schedule = await CalendarEvent.create({
    userEmail,
    title,
    category,
    start_at: new Date(startAt),
    end_at: new Date(endAt),
    location,
  });

  let googleEvent = null;
  if (alsoCreateGoogle) {
    if (userEmail) {
      try {
        const { accessToken } = await getAccountAndAccessToken(userEmail);
        const response = await fetch("https://www.googleapis.com/calendar/v3/calendars/primary/events", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            summary: title,
            location,
            start: { dateTime: startAt, timeZone: "UTC" },
            end: { dateTime: endAt, timeZone: "UTC" },
            extendedProperties: {
              private: {
                alignai_category: category,
              },
            },
          }),
        });
        const data = await response.json();
        if (response.ok) {
          googleEvent = data;
          if (googleEvent?.id) {
            schedule.googleEventId = String(googleEvent.id);
            await schedule.save();
          }
        }
      } catch (_err) {
        googleEvent = null;
      }
    } else {
      googleEvent = {
        id: `g-${String(schedule._id)}`,
        summary: title,
        location,
        start: { dateTime: startAt },
        end: { dateTime: endAt },
      };
    }
  }

    return res.json({
      schedule: {
        id: String(schedule._id),
        googleEventId: String(schedule.googleEventId || ""),
        title: schedule.title,
        category: schedule.category,
        start_at: schedule.start_at.toISOString(),
        end_at: schedule.end_at.toISOString(),
        location: schedule.location || "",
      },
      google_event: googleEvent,
    });
  };
  handler().catch((err) => res.status(400).json({ detail: String(err.message || err) }));
});

router.delete("/events/:eventId", (req, res) => {
  const run = async () => {
    const userEmail = getRequestedUserEmail(req);
    if (!userEmail) {
      return res.status(401).json({ detail: "Sign in required" });
    }
    const eventId = decodeURIComponent(String(req.params.eventId || "")).trim();
    if (!eventId) {
      return res.status(400).json({ detail: "Missing event id" });
    }

    const deleteGoogleEvent = async (googleEventId) => {
      const gid = String(googleEventId || "").trim();
      if (!gid) return;
      try {
        const { accessToken } = await getAccountAndAccessToken(userEmail);
        const r = await fetch(
          `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(gid)}`,
          { method: "DELETE", headers: { Authorization: `Bearer ${accessToken}` } }
        );
        if (!r.ok && r.status !== 404) {
          const text = await r.text();
          throw new Error(text || `Google Calendar delete failed (${r.status})`);
        }
      } catch (e) {
        throw new Error(String(e.message || e));
      }
    };

    let doc = null;
    if (mongoose.Types.ObjectId.isValid(eventId)) {
      doc = await CalendarEvent.findOne({ userEmail, _id: eventId });
    }
    if (!doc) {
      doc = await CalendarEvent.findOne({ userEmail, googleEventId: eventId });
    }

    if (doc) {
      try {
        await deleteGoogleEvent(doc.googleEventId);
      } catch (e) {
        return res.status(400).json({ detail: String(e.message || e) });
      }
      await CalendarEvent.deleteOne({ _id: doc._id });
      return res.json({ ok: true });
    }

    try {
      await deleteGoogleEvent(eventId);
    } catch (e) {
      return res.status(400).json({ detail: String(e.message || e) });
    }
    return res.json({ ok: true });
  };
  run().catch((err) => res.status(400).json({ detail: String(err.message || err) }));
});

export default router;
