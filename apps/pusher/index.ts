import { prismaClient } from "store/client";
import { xAddBulk } from "redisstream/client";

// The interval at which we expect a website to be checked.
const CHECK_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes

// How often the pusher service runs to find jobs.
const PUSHER_RUN_INTERVAL_MS = 60 * 1000; // 1 minute

async function main() {
  console.log("[Pusher] Searching for websites that need a health check...");

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
    console.log(
      "[Pusher] No websites currently need to be queued. All are up-to-date."
    );
    return;
  }

  console.log(
    `[Pusher] Found ${websitesToQueue.length} websites to queue. Pushing to Redis...`
  );
  await xAddBulk(websitesToQueue);
  console.log("[Pusher] Successfully pushed jobs to the stream.");
}

// Run the main function periodically.
setInterval(main, PUSHER_RUN_INTERVAL_MS);

// Run it once on startup.
main();
