import dotenv from 'dotenv'
dotenv.config({ path: '../../.env' })

import axios from "axios";
import { createConsumerGroupIfNotExists, xAckBulk, xReadGroup } from "redisstream/client";
import { prismaClient } from "store/client";

const REGION_ID = process.env.REGION_ID!;
const WORKER_ID = process.env.WORKER_ID!;

if (!REGION_ID) {
    throw new Error("Region ID not provided");
}

if (!WORKER_ID) {
    throw new Error("Worker ID not provided");
}

async function workerInit() {
    await createConsumerGroupIfNotExists(REGION_ID);
    main(); // start worker loop
}
workerInit();

async function main() {
    while(1) {
        // Consumes entries from the Redis Stream.
        const response = await xReadGroup(REGION_ID, WORKER_ID);

        if (!response) {
            continue;
        }

        // fetches website status and stores it in the database
        let promises = response.map(({message}) => fetchWebsite(message.url, message.id))
        await Promise.all(promises);

        // acknowledges the messages
        xAckBulk(REGION_ID, response.map(({id}) => id));
    }
}

async function fetchWebsite(url: string, websiteId: string) {
    return new Promise<void>((resolve, reject) => {
        const startTime = Date.now();
        
        axios.get(url)
            .then(async () => { 
                const endTime = Date.now();
                await prismaClient.website_tick.create({
                    data: {
                        response_time_ms: endTime - startTime,
                        status: "Up",
                        region_id: REGION_ID,
                        website_id: websiteId
                    }
                })
                resolve()
            })
            .catch(async () => {
                const endTime = Date.now();
                await prismaClient.website_tick.create({
                    data: {
                        response_time_ms: endTime - startTime,
                        status: "Down",
                        region_id: REGION_ID,
                        website_id: websiteId
                    }
                })
                resolve()
            })
    })
}

main();