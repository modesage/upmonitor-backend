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

async function workerInit() {
    await createConsumerGroupIfNotExists(REGION_ID);
    main(); // start worker loop
}
workerInit();

const IDLE_WHEN_EMPTY = 15 * 60 * 1000; // 15 minutes

async function main() {
    while (true) {
        const response = await xReadGroup(REGION_ID, WORKER_ID);

        if (!response) {
            // Queue is empty → wait 15 minutes
            console.log(`[Worker] Queue empty, sleeping for 15 min`);
            await new Promise(r => setTimeout(r, IDLE_WHEN_EMPTY));
            continue;
        }

        // Fetch website status and store in DB
        const promises = response.map(({ message }) => fetchWebsite(message.url, message.id));
        await Promise.all(promises);

        // Acknowledge messages
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
