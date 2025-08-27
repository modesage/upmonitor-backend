import { PrismaClient, website_status } from "./generated/prisma";

export const prismaClient = new PrismaClient();
export { website_status };
