import axios from "axios";
import express from "express";
import { createConsumerGroupIfNotExists, xAckBulk, xReadGroup } from "redisstream/client";
import { prismaClient } from "store/client";

const REGION_ID = process.env.REGION_ID!;
const WORKER_ID = process.env.WORKER_ID!;

if (!REGION_ID) throw new Error("Region ID not provided");
if (!WORKER_ID) throw new Error("Worker ID not provided");

async function consumerGroupExists() {
    // Ensure consumer group exists
    await createConsumerGroupIfNotExists(REGION_ID);
}
consumerGroupExists();

async function fetchWebsite(url: string, websiteId: string) {
  const start = Date.now();
  try {
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
    await prismaClient.website_tick.create({
      data: {
        response_time_ms: end - start,
        status: "Down",
        region_id: REGION_ID,
        website_id: websiteId,
      },
    });
  }
}

async function runOneCycle() {
  // Pull once from Redis
  const response = await xReadGroup(REGION_ID, WORKER_ID);
  if (!response || response.length === 0) {
    console.log("[Worker] No jobs in queue.");
    return { jobs: 0 };
  }

  // Process jobs
  await Promise.all(
    response.map(({ message }) => fetchWebsite(message.url, message.id))
  );

  // Acknowledge jobs
  await xAckBulk(REGION_ID, response.map(({ id }) => id));

  console.log(`[Worker] Processed ${response.length} jobs.`);
  return { jobs: response.length };
}

// Express server
const app = express();
const PORT = process.env.PORT_WORKER || 3002;

app.get("/", (req, res) => {
  res.status(200).send("Landing Page");
});

// Endpoint triggered by cron
app.get("/pull-cycle", async (_req, res) => {
  const result = await runOneCycle();
  res.json({ status: "ok", ...result });
});

// Healthcheck endpoint
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
