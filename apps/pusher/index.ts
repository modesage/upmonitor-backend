import { prismaClient } from "store/client";
import { xAddBulk } from "redisstream/client";
import express from "express";

// The interval at which we expect a website to be checked.
const CHECK_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes

async function main() {
  console.log("[Pusher] Checking websites...");
  // Find websites whose most recent tick is older than our check interval,
  // OR websites that have never been ticked at all.
  const tenMinutesAgo = new Date(Date.now() - CHECK_INTERVAL_MS);
  const websitesToQueue = await prismaClient.website.findMany({
    where: {
      OR: [
        { ticks: { every: { createdAt: { lt: tenMinutesAgo } } } },
        { ticks: { none: {} } },
      ],
    },
    select: { id: true, url: true },
  });

  if (websitesToQueue.length === 0) {
    console.log("[Pusher] No websites. Sleeping 10 minutes...");
    return setTimeout(main, 10 * 60 * 1000); // wait 10m if DB empty
  }

  console.log(`[Pusher] Found ${websitesToQueue.length} websites. Pushing...`);
  await xAddBulk(websitesToQueue);
  console.log("[Pusher] Pushed jobs.");

  // When active, check more often (e.g., 30s)
  setTimeout(main, 30 * 1000);
}

// Kick it off
main();

const app = express();
const PORT = process.env.PORT || 3000;

app.get("/healthcheck", (req, res) => {
  res.status(200).json({ status: "ok", service: "pusher", time: new Date().toLocaleString() });
});

app.listen(PORT, () => {
  console.log(`[Pusher] Web server listening on port ${PORT}`);
});
