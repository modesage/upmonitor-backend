import dotenv from 'dotenv'
dotenv.config({ path: '../../.env' })

import axios from "axios";
import express from "express";
import { createConsumerGroupIfNotExists, xAckBulk, xReadGroup } from "redisstream/client";
import { prismaClient } from "store/client";

const REGION_ID = process.env.REGION_ID!;
const WORKER_ID = process.env.WORKER_ID!;

if (!REGION_ID) throw new Error("Region ID not provided");
if (!WORKER_ID) throw new Error("Worker ID not provided");

// Ensure the Redis consumer group exists for this region
async function consumerGroupExists() {
    await createConsumerGroupIfNotExists(REGION_ID).catch(console.error);
}
consumerGroupExists();

async function fetchWebsite(url: string, websiteId: string) {
  const start = Date.now();

  // Verify website exists before recording a tick
  const website = await prismaClient.website.findUnique({
    where: { id: websiteId },
    select: { id: true },
  });

  if (!website) {
    console.warn(`[Worker] Skipping job — Website ${websiteId} not found.`);
    return;
  }

  try {
    // Measure response time with HEAD request
    await axios.head(url, { timeout: 10_000, maxRedirects: 5, validateStatus: () => true });
    const end = Date.now();

    await prismaClient.website_tick.create({
      data: {
        response_time_ms: end - start,
        status: "Up",
        region_id: REGION_ID,
        website_id: websiteId,
      },
    });
  } catch {
    const end = Date.now();
    try {
      await prismaClient.website_tick.create({
        data: {
          response_time_ms: end - start,
          status: "Down",
          region_id: REGION_ID,
          website_id: websiteId,
        },
      });
    } catch (err: any) {
      // Handle case where website was deleted after existence check but before tick insert
      if (err.code === "P2003") {
        console.warn(`[Worker] Skipped saving tick — Website ${websiteId} deleted during request.`);
      } else {
        throw err;
      }
    }
  }
}

async function runOneCycle() {
  // Pull jobs from Redis consumer group
  const response = await xReadGroup(REGION_ID, WORKER_ID);
  if (!response || response.length === 0) {
    console.log("[Worker] No jobs in queue.");
    return { jobs: 0 };
  }

  // Process all jobs in parallel
  await Promise.all(
    response.map(({ message }) => fetchWebsite(message.url, message.id))
  );

  // Acknowledge completed jobs so Redis doesn't retry them
  await xAckBulk(REGION_ID, response.map(({ id }) => id));

  console.log(`[Worker] Processed ${response.length} jobs.`);
  return { jobs: response.length };
}

const app = express();
const PORT = process.env.PORT || 3002;

// Triggered by cron to run a single worker cycle
app.get("/pull-cycle", async (_req, res) => {
  const result = await runOneCycle();
  res.json({ status: "ok", ...result });
});

// Basic healthcheck endpoint
app.get("/healthcheck", (_req, res) => {
  res.status(200).json({
    status: "ok",
    service: "worker",
    region: REGION_ID,
    worker: WORKER_ID,
    time: new Date().toLocaleString(),
  });
});

app.listen(PORT, () => {
  console.log(`[Worker] Web server listening on port ${PORT}`);
});
