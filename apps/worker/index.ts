import dotenv from 'dotenv';
dotenv.config({ path: '../../.env' });

import axios from "axios";
import express from "express";
import { createConsumerGroupIfNotExists, xAckBulk, xReadGroup } from "redisstream/client";
import { prismaClient } from "store/client";

const REGION_ID = process.env.REGION_ID!;
const WORKER_ID = process.env.WORKER_ID!;

if (!REGION_ID) throw new Error("Region ID not provided");
if (!WORKER_ID) throw new Error("Worker ID not provided");

const IDLE_WHEN_EMPTY = 10 * 60 * 1000; // 10 minutes

async function workerInit() {
    await createConsumerGroupIfNotExists(REGION_ID);
    main(); // start worker loop
}
workerInit();

async function main() {
    while (true) {
        // Check if DB has websites
        const websites = await prismaClient.website.findMany({
            select: { id: true },
            take: 1
        });

        if (websites.length === 0) {
            console.log("[Worker] No websites in DB. Sleeping 10 minutes...");
            await new Promise(r => setTimeout(r, IDLE_WHEN_EMPTY));
            continue; // skip redis completely
        }

        // Poll Redis only if DB has websites
        const response = await xReadGroup(REGION_ID, WORKER_ID);

        if (!response) {
            console.log("[Worker] Redis queue empty. Sleeping 10 minutes...");
            await new Promise(r => setTimeout(r, IDLE_WHEN_EMPTY));
            continue;
        }

        // Process jobs
        const promises = response.map(({ message }) =>
            fetchWebsite(message.url, message.id)
        );
        await Promise.all(promises);

        // Acknowledge jobs
        await xAckBulk(REGION_ID, response.map(({ id }) => id));
    }
}

async function fetchWebsite(url: string, websiteId: string) {
    const startTime = Date.now();
    try {
        await axios.get(url);
        const endTime = Date.now();
        await prismaClient.website_tick.create({
            data: {
                response_time_ms: endTime - startTime,
                status: "Up",
                region_id: REGION_ID,
                website_id: websiteId
            }
        });
    } catch {
        const endTime = Date.now();
        await prismaClient.website_tick.create({
            data: {
                response_time_ms: endTime - startTime,
                status: "Down",
                region_id: REGION_ID,
                website_id: websiteId
            }
        });
    }
}

const app = express();
const PORT = process.env.PORT || 3000;

app.get("/healthcheck", (req, res) => {
    res.status(200).json({
        status: "ok",
        service: "worker",
        region: REGION_ID,
        worker: WORKER_ID,
        time: new Date().toLocaleString()
    });
});

app.listen(PORT, () => {
    console.log(`[Worker] Web server listening on port ${PORT}`);
});
