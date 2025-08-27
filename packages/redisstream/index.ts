import dotenv from 'dotenv'
dotenv.config({ path: '../../.env' })

import { createClient } from "redis";

type WebsiteEvent = { url: string; id: string };
type MessageType = {
  id: string;
  message: {
    url: string;
    id: string;
  };
};

const STREAM_NAME = "betteruptime:website";
const STREAM_MAXLEN = 10000;

//docker setup
//redis://localhost:6379

//To connect to a different host or port, use a connection string in the format:
//redis[s]://[[username][:password]@][host][:port][/db-number]:
//redis://alice:foobared@awesome.redis.server:6380

const client = createClient({
  url: process.env.REDIS_URL
});

client.on("error", (err) => console.error("Redis Client Error", err));
await client.connect();

export async function createConsumerGroupIfNotExists(groupName: string) {
    try {
      // Try creating group at stream start (0 means read all from start)
      await client.xGroupCreate(STREAM_NAME, groupName, "0", { MKSTREAM: true });
      console.log(`Consumer group "${groupName}" created.`);
    } catch (err: any) {
      // Ignore if group exists (BUSYGROUP error)
      if (!err.message.includes("BUSYGROUP")) {
        throw err;
      } else {
        console.log(`Consumer group "${groupName}" already exists.`);
      }
    }
  }

export async function xAddBulk(websites: WebsiteEvent[]) {
  if (websites.length === 0) return;

  const pipeline = client.multi();

  for (const website of websites) {
    pipeline.xAdd(
      STREAM_NAME,
      "*",
      { url: website.url, id: website.id },
      {
        TRIM: {
          strategy: "MAXLEN",
          strategyModifier: "~",
          threshold: STREAM_MAXLEN,
        },
      }
    );
  }

  await pipeline.exec();
}

export async function xReadGroup(
  consumerGroup: string,
  consumerName: string
): Promise<MessageType[] | undefined> {
  const response = await client.xReadGroup(
    consumerGroup, consumerName,{
        key: STREAM_NAME,
        id: '>'
    },{
        COUNT: 5
    }
  );

  if (!response) return undefined;
  // @ts-ignore
  return response[0].messages.map((msg: any) => ({
    id: msg.id,
    message: {
      url: msg.message.url,
      id: msg.message.id,
    },
  }));
}

export async function xAckBulk(consumerGroup: string, eventIds: string[]) {
    const pipeline = client.multi();
    for (const eventId of eventIds) {
        pipeline.xAck(STREAM_NAME, consumerGroup, eventId);
    }
    await pipeline.exec();
}