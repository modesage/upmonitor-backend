import dotenv from 'dotenv'
dotenv.config({ path: '../../.env' })

import { prismaClient } from "store/client";
import { xAddBulk, setEnqueueLock } from "redisstream/client"; // Redis helpers for queue
import express from "express";

const CHECK_INTERVAL_MS = 30 * 1000; // Minimum interval between checks for each website

async function runOneCycle() {
  console.log("[Pusher] Checking websites...");

  const thirtySecondsAgo = new Date(Date.now() - CHECK_INTERVAL_MS);

  // Fetch all websites and their latest tick
  const websites = await prismaClient.website.findMany({
    select: {
      id: true,
      url: true,
      ticks: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { createdAt: true },
      },
    },
  });

  // Filter websites that are due for a check
  const dueWebsites = websites.filter((w) => {
    if (w.ticks.length === 0) return true; // never checked
    return w.ticks[0]!.createdAt <= thirtySecondsAgo; // latest check too old
  });

  if (dueWebsites.length === 0) {
    console.log("[Pusher] No due websites.");
    return;
  }

  // Lock each website to prevent duplicate enqueueing within the interval
  const toEnqueue: { id: string; url: string }[] = [];
  for (const w of dueWebsites) {
    const locked = await setEnqueueLock(w.id, CHECK_INTERVAL_MS);
    if (locked) toEnqueue.push({ id: w.id, url: w.url });
  }

  if (toEnqueue.length === 0) {
    console.log("[Pusher] All candidates already locked; nothing to push.");
    return;
  }

  // Push jobs to Redis stream for workers to process
  console.log(`[Pusher] Found ${toEnqueue.length} due websites. Pushing...`);
  await xAddBulk(toEnqueue);
  console.log("[Pusher] Pushed jobs.");
}

const app = express();
const PORT = process.env.PORT || 3001;

// Triggered by cron to enqueue due websites
app.get("/push-cycle", async (_req, res) => {
  await runOneCycle();
  res.json({ status: "ok" });
});

// Healthcheck endpoint
app.get("/healthcheck", (_req, res) => {
  res.status(200).json({
    status: "ok",
    service: "pusher",
    time: new Date().toLocaleString(),
  });
});

app.listen(PORT, () =>
  console.log(`[Pusher] Web server listening on ${PORT}`)
);
