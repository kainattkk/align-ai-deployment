import express from "express";
import { GoogleGenerativeAI } from "@google/generative-ai";

const router = express.Router();

function internalApiUrl(path) {
  const origin =
    process.env.BACKEND_ORIGIN || `http://127.0.0.1:${process.env.PORT || 5000}`;
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${origin}${p}`;
}

let genAI;

const tools = [
  {
    functionDeclarations: [
      {
        name: "create_calendar_event",
        description: "Schedule a new event or meeting in the user's calendar.",
        parameters: {
          type: "OBJECT",
          properties: {
            title: { type: "STRING", description: "The title or summary of the event." },
            start_at: { type: "STRING", description: "The start time in ISO 8601 format (e.g., 2026-05-10T14:00:00Z)." },
            end_at: { type: "STRING", description: "The end time in ISO 8601 format (e.g., 2026-05-10T15:00:00Z)." },
            category: { type: "STRING", description: "The category of the event: meeting, assignment, or personal." },
            location: { type: "STRING", description: "The location of the event, if any." }
          },
          required: ["title", "start_at", "end_at"]
        }
      },
      {
        name: "create_task",
        description: "Create a new task, assignment, or to-do item for the user.",
        parameters: {
          type: "OBJECT",
          properties: {
            title: { type: "STRING", description: "The title of the task." },
            due_date: { type: "STRING", description: "The due date in ISO 8601 format." },
            description: { type: "STRING", description: "A brief description or notes for the task." }
          },
          required: ["title", "due_date"]
        }
      }
    ]
  }
];

router.post("/availability/chat", async (req, res) => {
  if (!genAI) {
    genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");
  }
  
  try {
    const message = String(req.body?.message || "");
    const historyData = req.body?.history || [];
    const userEmail = req.body?.email || req.headers["x-user-email"] || "";
    const currentDate = req.body?.currentDate || new Date().toLocaleString();
    const timeZone = req.body?.timeZone || "UTC";

    // Fetch user's upcoming events for context
    let scheduleContext = "No upcoming events found.";
    if (userEmail) {
      try {
        const now = new Date();
        const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
        const fromAt = now.toISOString();
        const toAt = nextWeek.toISOString();
        
        const eventsRes = await fetch(
          internalApiUrl(`/api/calendar/events?from_at=${fromAt}&to_at=${toAt}`),
          {
            headers: { "x-user-email": userEmail },
          }
        );
        
        if (eventsRes.ok) {
          const eventsData = await eventsRes.json();
          if (eventsData.events && eventsData.events.length > 0) {
            scheduleContext = eventsData.events.map(e => 
              `- ${e.title} (${e.category}) from ${new Date(e.start_at).toLocaleString()} to ${new Date(e.end_at).toLocaleString()}`
            ).join("\n");
          } else {
            scheduleContext = "No events scheduled for the next 7 days.";
          }
        }
      } catch (err) {
        console.error("Failed to fetch schedule context:", err);
        scheduleContext = "Unable to fetch schedule at this time.";
      }
    }

    const systemInstruction = `You are an AI Availability Assistant for Align AI. You help students manage their schedule, find free time slots, and optimize their calendar. 
Be concise, friendly, and helpful. Suggest times and give advice on maintaining a healthy work-life balance.
You have the ability to schedule calendar events and create tasks for the user. 
Important context:
- The current date and time is: ${currentDate}
- The user's timezone is: ${timeZone}
- User's schedule for the next 7 days:
${scheduleContext}
- When creating events/tasks, always compute the exact ISO 8601 dates/times based on the current date and time provided above. Do not use placeholder dates.
- If the user doesn't provide a specific duration for a meeting, assume 1 hour.
- Automatically use the tools available to fulfill user requests to add events or tasks.`;

    const model = genAI.getGenerativeModel({
      model: "gemini-flash-latest",
      systemInstruction: systemInstruction,
      tools: tools,
    });

    const formattedHistory = [];
    if (Array.isArray(historyData)) {
      for (const msg of historyData) {
        if (msg.text) {
          const role = msg.sender === 'user' ? 'user' : 'model';
          // Gemini requires history to start with user and strictly alternate
          if (formattedHistory.length === 0 && role === 'model') {
            continue; // Skip any initial messages from the model
          }
          if (formattedHistory.length > 0 && formattedHistory[formattedHistory.length - 1].role === role) {
            // Append to the previous message to maintain alternating roles
            formattedHistory[formattedHistory.length - 1].parts[0].text += "\n" + msg.text;
          } else {
            formattedHistory.push({
              role: role,
              parts: [{ text: msg.text }]
            });
          }
        }
      }
    }

    const chat = model.startChat({ history: formattedHistory });

    let result = await chat.sendMessage(message);
    const response = result.response;
    
    const functionCalls = response.functionCalls();

    if (functionCalls && functionCalls.length > 0) {
      const call = functionCalls[0];
      const functionName = call.name;
      const functionArgs = call.args;
      let functionResult = {};

      try {
        if (functionName === "create_calendar_event") {
          const internalRes = await fetch(internalApiUrl("/api/calendar/events"), {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-user-email": userEmail
            },
            body: JSON.stringify(functionArgs)
          });
          const data = await internalRes.json();
          if (internalRes.ok) {
            functionResult = { message: `Successfully scheduled event: ${data.schedule.title} from ${data.schedule.start_at} to ${data.schedule.end_at}.` };
          } else {
            functionResult = { error: `Failed to schedule event: ${data.detail}` };
          }
        } else if (functionName === "create_task") {
          const internalRes = await fetch(internalApiUrl("/api/tasks"), {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-user-email": userEmail
            },
            body: JSON.stringify(functionArgs)
          });
          const data = await internalRes.json();
          if (internalRes.ok) {
            functionResult = { message: `Successfully created task: ${data.title} due on ${data.due_date}.` };
          } else {
            functionResult = { error: `Failed to create task.` };
          }
        }
      } catch (err) {
        functionResult = { error: `Error executing tool: ${err.message}` };
      }

      // Send the tool response back to Gemini to get the final text response
      result = await chat.sendMessage([{
        functionResponse: {
          name: functionName,
          response: functionResult
        }
      }]);
    }

    const reply = result.response.text() || "Sorry, I couldn't generate a response.";
    return res.json({ reply });
  } catch (error) {
    console.error("Gemini Error:", error);
    if (error.message?.includes("API key not valid")) {
      return res.status(500).json({ reply: "Your Gemini API key is invalid. Please update it in the backend .env file." });
    }
    return res.status(500).json({ reply: `I'm experiencing some technical difficulties: ${error.message || String(error)}` });
  }
});

export default router;
