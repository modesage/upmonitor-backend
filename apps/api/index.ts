import dotenv from 'dotenv'
dotenv.config({ path: '../../.env' })

import { prismaClient } from "store/client";
import { tryEnqueueOnce } from "redisstream/client";
import { AuthInput } from "./types";
import { authMiddleware } from "./middleware";
import jwt from "jsonwebtoken";
import express from "express";
import cors from "cors";
import bcrypt from "bcrypt";

const app = express();
const PORT = process.env.PORT || 8000;

app.use(express.json());

app.use(cors({
    origin: process.env.FRONTEND_URL!
}));

// Basic healthcheck endpoint
app.get("/healthcheck", (_req, res) => {
    res.status(200).json({
        status: "ok",
        service: "backend api",
        uptime: process.uptime(),
        timestamp: new Date().toLocaleString()
    });
});

// User registration
app.post("/user/signup", async (req, res) => {
    const data = AuthInput.safeParse(req.body);
    if (!data.success) {
        res.status(403).send("Invalid data");
        return;
    }

    try {
        const hashedPassword = await bcrypt.hash(data.data.password, 10);
        const user = await prismaClient.user.create({
            data: {
                username: data.data.username,
                password: hashedPassword
            }
        });
        res.json({ id: user.id });
    } catch {
        res.status(403).send("User already exists");
    }
});

// User login
app.post("/user/signin", async (req, res) => {
    const data = AuthInput.safeParse(req.body);
    if (!data.success) {
        res.status(403).send("Invalid data");
        return;
    }

    const user = await prismaClient.user.findFirst({
        where: { username: data.data.username }
    });

    if (!user || !bcrypt.compareSync(data.data.password, user.password)) {
        res.status(403).send("Invalid credentials");
        return;
    }

    const token = jwt.sign({ sub: user.id }, process.env.JWT_SECRET!);
    res.json({ jwt: token });
});

// Add new website
app.post("/website", authMiddleware, async (req, res) => {
    if (!req.body.url) {
        res.status(411).json({ message: "Missing url" });
        return;
    }

    const website = await prismaClient.website.create({
        data: {
            url: req.body.url,
            time_added: new Date(),
            user_id: req.userId!
        }
    });

    // Immediately enqueue for first status check
    await tryEnqueueOnce({ id: website.id, url: website.url }, 30 * 1000);

    res.json({ id: website.id });
});

// Get website details and last 10 ticks
app.get("/status/:websiteId", authMiddleware, async (req, res) => {
    const website = await prismaClient.website.findFirst({
        where: { user_id: req.userId!, id: req.params.websiteId },
        include: { ticks: { orderBy: [{ createdAt: 'desc' }], take: 10 } }
    });

    if (!website) {
        res.status(409).json({ message: "Website not found" });
        return;
    }

    res.json({
        url: website.url,
        id: website.id,
        user_id: website.user_id,
        ticks: website.ticks
    });
});

// Get all websites for the logged-in user
app.get("/websites", authMiddleware, async (req, res) => {
    const websites = await prismaClient.website.findMany({
        where: { user_id: req.userId },
        include: { ticks: { orderBy: [{ createdAt: 'desc' }], take: 1 } }
    });
    res.json({ websites });
});

// Delete user account
app.delete("/user/delete", authMiddleware, async (req, res) => {
    try {
        await prismaClient.user.delete({ where: { id: req.userId! } });
        res.json({ message: "Account deleted successfully" });
    } catch {
        res.status(500).json({ message: "Failed to delete account" });
    }
});

// Delete a specific website
app.delete("/website/:websiteId", authMiddleware, async (req, res) => {
    const website = await prismaClient.website.findFirst({
        where: { id: req.params.websiteId, user_id: req.userId! }
    });

    if (!website) {
        return res.status(404).json({ message: "Website not found" });
    }

    try {
        await prismaClient.website.delete({ where: { id: website.id } });
        res.json({ message: "Website deleted successfully" });
    } catch {
        res.status(500).json({ message: "Failed to delete website" });
    }
});

// Start backend server
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
