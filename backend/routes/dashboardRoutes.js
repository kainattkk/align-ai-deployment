import express from "express";
import { getAccountAndAccessToken, getRequestedUserEmail } from "../services/googleService.js";
import EmailMessage from "../models/EmailMessage.js";
import Task from "../models/Task.js";
import Schedule from "../models/Schedule.js";
import CalendarEvent from "../models/CalendarEvent.js";

/** YYYY-MM-DD in local timezone */
const localDateKey = (d) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

/** Whether a Google Calendar list item starts or occurs on this local calendar day */
const googleEventOnLocalDay = (item, dayStart, dayEnd) => {
  if (item?.start?.dateTime) {
    const t = new Date(item.start.dateTime);
    return t.getTime() >= dayStart.getTime() && t.getTime() < dayEnd.getTime();
  }
  if (item?.start?.date) {
    return String(item.start.date) === localDateKey(dayStart);
  }
  return false;
};

const dedupeTodayTaskRows = (rows) => {
  const sorted = [...rows].sort((a, b) => a.sortMs - b.sortMs);
  const seen = new Set();
  const out = [];
  for (const row of sorted) {
    const key = `${String(row.title || "").toLowerCase().trim()}|${Math.floor(row.sortMs / 60000)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }
  return out;
};

const router = express.Router();

router.get("/summary", (req, res) => {
  const fallback = (overrides = {}) => {
    const today = new Date();
    const month = today.toLocaleDateString(undefined, { month: "short" });
    const day = today.getDate();
    const base = {
      metrics: {
        emailsToday: 0,
        pendingAssignments: 0,
        scheduledMeetings: 0, 
        productivityScore: 65,
      },
      todayTasks: [],
      upcomingDeadlines: [],
      aiSuggestions: [
        "Connect Google from Settings to enrich your dashboard with Gmail, Calendar and Classroom data.",
      ],
    };
    const hasTodayTasks = Array.isArray(overrides.todayTasks) && overrides.todayTasks.length > 0;
    const hasUpcomingDeadlines = Array.isArray(overrides.upcomingDeadlines) && overrides.upcomingDeadlines.length > 0;
    return {
      ...base,
      ...overrides,
      metrics: { ...base.metrics, ...(overrides.metrics || {}) },
      todayTasks: hasTodayTasks
        ? overrides.todayTasks
        : [{ title: "No tasks scheduled for today", time: "Anytime", priority: "low" }],
      upcomingDeadlines: hasUpcomingDeadlines
        ? overrides.upcomingDeadlines
        : [{ title: "No upcoming deadlines", due: `${month} ${day}`, subject: "Tasks", progress: 0 }],
    };
  };

  const handler = async () => {
    const userEmail = getRequestedUserEmail(req);
    const scopedEmail = userEmail || "anonymous@local";

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(startOfDay);
    endOfDay.setDate(endOfDay.getDate() + 1);
    const in7Days = new Date(startOfDay);
    in7Days.setDate(in7Days.getDate() + 7);

    const [emailsTodayCount, pendingAssignmentsCount, todaySchedules, todayCalendarEvents, upcomingTasks] = await Promise.all([
      EmailMessage.countDocuments({ userEmail: scopedEmail, receivedAt: { $gte: startOfDay, $lt: endOfDay } }),
      Task.countDocuments({ userEmail: scopedEmail, completed: false }),
      Schedule.find({ userEmail: scopedEmail, start_at: { $gte: startOfDay, $lt: endOfDay } }).sort({ start_at: 1 }).limit(5),
      CalendarEvent.find({ userEmail: scopedEmail, start_at: { $gte: startOfDay, $lt: endOfDay } }).sort({ start_at: 1 }).limit(5),
      Task.find({ userEmail: scopedEmail, due_date: { $gte: startOfDay, $lte: in7Days }, completed: false }).sort({ due_date: 1 }).limit(5),
    ]);

    const localTodayTaskRows = dedupeTodayTaskRows([
      ...todaySchedules.map((item) => ({
        title: String(item.title || "Scheduled event"),
        time: new Date(item.start_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        priority: "medium",
        sortMs: new Date(item.start_at).getTime(),
      })),
      ...todayCalendarEvents.map((item) => ({
        title: String(item.title || "Calendar event"),
        time: new Date(item.start_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        priority: "medium",
        sortMs: new Date(item.start_at).getTime(),
      })),
    ]);

    const localTodayTasks = localTodayTaskRows.map(({ sortMs, ...rest }) => rest);

    const localDeadlines = upcomingTasks.map((task) => {
      const dueDate = new Date(task.due_date);
      const daysLeft = Math.max(0, Math.ceil((dueDate.getTime() - startOfDay.getTime()) / (24 * 3600 * 1000)));
      return {
        title: String(task.title || "Task"),
        due: dueDate.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
        subject: "Tasks",
        progress: Number(task.progress || 0),
        daysLeft,
      };
    });

    const localProductivityScore = Math.min(
      100,
      40 + Math.round(emailsTodayCount * 1 + localTodayTasks.length * 5 + Math.max(0, 5 - pendingAssignmentsCount) * 5)
    );

    const localPayload = fallback({
      metrics: {
        emailsToday: emailsTodayCount,
        pendingAssignments: pendingAssignmentsCount,
        scheduledMeetings: localTodayTasks.length,
        productivityScore: localProductivityScore,
      },
      todayTasks: localTodayTasks,
      upcomingDeadlines: localDeadlines.map(({ daysLeft, ...rest }) => rest),
      aiSuggestions: [
        pendingAssignmentsCount > 0
          ? `You have ${pendingAssignmentsCount} pending tasks. Finish a high-priority one first.`
          : "No pending tasks. Great momentum today.",
        localTodayTasks.length > 0
          ? `${localTodayTasks.length} events are scheduled today. Block focused work between them.`
          : "No meetings today. This is a good day for deep work.",
        emailsTodayCount > 0
          ? `You received ${emailsTodayCount} emails today. Batch triage can save time.`
          : "No new fallback emails today. Keep your inbox clean.",
      ],
    });

    if (!userEmail) return res.json(localPayload);

    try {
      const { accessToken } = await getAccountAndAccessToken(userEmail);

      const [gmailRes, calendarRes, coursesRes] = await Promise.all([
        fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=50&q=newer_than:1d", {
          headers: { Authorization: `Bearer ${accessToken}` },
        }),
        fetch(
          `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${encodeURIComponent(
            startOfDay.toISOString()
          )}&timeMax=${encodeURIComponent(
            endOfDay.toISOString()
          )}&singleEvents=true&orderBy=startTime&maxResults=50`,
          {
            headers: { Authorization: `Bearer ${accessToken}` },
          }
        ),
        fetch("https://classroom.googleapis.com/v1/courses?courseStates=ACTIVE&pageSize=20", {
          headers: { Authorization: `Bearer ${accessToken}` },
        }),
      ]);

      const gmail = gmailRes.ok ? await gmailRes.json() : {};
      const calendar = calendarRes.ok ? await calendarRes.json() : {};
      const courses = coursesRes.ok ? await coursesRes.json() : {};

      const emailCount = Array.isArray(gmail.messages) ? gmail.messages.length : 0;
      const meetings = Array.isArray(calendar.items) ? calendar.items : [];
      const coursesList = Array.isArray(courses.courses) ? courses.courses : [];

      const meetingsToday = meetings.filter((item) => googleEventOnLocalDay(item, startOfDay, endOfDay));

      const linkedGoogleIds = new Set(
        todayCalendarEvents.map((c) => String(c.googleEventId || "").trim()).filter(Boolean)
      );

      const googleTodayTaskRows = meetingsToday
        .filter((item) => item.id && !linkedGoogleIds.has(String(item.id)))
        .map((item) => {
          const sortMs = item.start?.dateTime
            ? new Date(item.start.dateTime).getTime()
            : startOfDay.getTime();
          return {
            title: String(item.summary || "Scheduled event"),
            time: item.start?.dateTime
              ? new Date(item.start.dateTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
              : "All day",
            priority: "medium",
            sortMs,
          };
        });

      const mergedTodayTaskRows = dedupeTodayTaskRows([...localTodayTaskRows, ...googleTodayTaskRows]).slice(0, 12);

      const todayTasks = mergedTodayTaskRows.map(({ sortMs, ...t }) => t);

      const upcomingDeadlines = coursesList.slice(0, 3).map((course, index) => ({
        title: `Coursework check-in: ${String(course.name || "Classroom")}`,
        due: `+${index + 1} day`,
        subject: "Google Classroom",
        progress: Math.max(20, 80 - index * 20),
      }));

      const pendingAssignments = Math.max(coursesList.length, localPayload.metrics.pendingAssignments);
      const productivityScore = Math.min(
        100,
        40 + Math.round((emailCount * 0.5) + (todayTasks.length * 3) + (coursesList.length * 1) + (Math.max(0, 10 - pendingAssignments) * 2))
      );

      return res.json({
        metrics: {
          emailsToday: emailCount,
          pendingAssignments: Math.max(coursesList.length, localPayload.metrics.pendingAssignments),
          scheduledMeetings: Math.max(todayTasks.length, localPayload.metrics.scheduledMeetings),
          productivityScore,
        },
        todayTasks: todayTasks.length ? todayTasks : localPayload.todayTasks,
        upcomingDeadlines: upcomingDeadlines.length ? upcomingDeadlines : localPayload.upcomingDeadlines,
        aiSuggestions: [
          emailCount > 0 ? `You have ${emailCount} recent emails to triage.` : "No new emails today.",
          todayTasks.length > 0
            ? `You have ${todayTasks.length} calendar item${todayTasks.length === 1 ? "" : "s"} scheduled for today.`
            : "No calendar events scheduled for today.",
          coursesList.length > 0 ? `Classroom has ${coursesList.length} active courses.` : localPayload.aiSuggestions[0],
        ],
      });
    } catch (_err) {
      return res.json(localPayload);
    }
  };

  handler().catch(() => res.json(fallback()));
});

export default router;
