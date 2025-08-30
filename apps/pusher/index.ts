import { prismaClient } from "store/client";
import { xAddBulk, setEnqueueLock } from "redisstream/client"; // new helper
import express from "express";

const CHECK_INTERVAL_MS = 10 * 60 * 1000;

async function runOneCycle() {
  console.log("[Pusher] Checking websites...");
  const tenMinutesAgo = new Date(Date.now() - CHECK_INTERVAL_MS);

  // only consider latest tick
  const websites = await prismaClient.website.findMany({
    where: {
      OR: [
        { ticks: { none: {} } }, // never checked before
        {
          ticks: {
            some: {
              createdAt: { lt: tenMinutesAgo },
            },
          },
        },
      ],
    },
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

  // Filter on latest tick manually (because Prisma "some" can still match old ticks)
  const dueWebsites = websites.filter(
    (w) =>
      w.ticks.length === 0 || // never checked before
      w.ticks[0]!.createdAt < tenMinutesAgo // latest check too old
  );

  if (dueWebsites.length === 0) {
    console.log("[Pusher] No due websites.");
    return;
  }

  // Lock per website to avoid duplicate XADDs within the interval
  const toEnqueue: { id: string; url: string }[] = [];
  for (const w of dueWebsites) {
    const locked = await setEnqueueLock(w.id, CHECK_INTERVAL_MS);
    if (locked) toEnqueue.push({ id: w.id, url: w.url });
  }

  if (toEnqueue.length === 0) {
    console.log("[Pusher] All candidates already locked; nothing to push.");
    return;
  }

  console.log(`[Pusher] Found ${toEnqueue.length} due websites. Pushing...`);
  await xAddBulk(toEnqueue);
  console.log("[Pusher] Pushed jobs.");
}

// Option A: stateless endpoint called by Render Cron every minute
const app = express();
const PORT = process.env.PORT_PUSHER || 3001;

app.get("/", (req, res) => {
  res.status(200).send("Landing Page");
});

app.get("/push-cycle", async (_req, res) => {
  await runOneCycle();
  res.json({ status: "ok" });
});

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
