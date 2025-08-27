import dotenv from 'dotenv'
dotenv.config({ path: '../../.env' })

import jwt from "jsonwebtoken";
import express from "express"
import { prismaClient } from "store/client";
import { AuthInput } from "./types";
import { authMiddleware } from "./middleware";
import cors from "cors";
import bcrypt from "bcrypt"

const app = express();
const PORT = process.env.PORT || 8000

app.use(express.json());

app.use(cors({
    origin: process.env.FRONTEND_URL!
}));

app.post("/user/signup", async (req, res) => {
    const data = AuthInput.safeParse(req.body);
    if (!data.success) {
        console.log(data.error.toString());
        res.status(403).send("Invalid data");
        return;
    }

    try {
        const hashedPassword = await bcrypt.hash(data.data.password, 10);
        let user = await prismaClient.user.create({
            data: {
                username: data.data.username,
                password: hashedPassword
            }
        })
        res.json({
            id: user.id
        })
    } catch (e) {
        console.log(e);
        res.status(403).send("User already exists");
    }
})

app.post("/user/signin", async (req, res) => {
    const data = AuthInput.safeParse(req.body);
    if (!data.success) {
        res.status(403).send("Invalid data");
        return;
    }

    let user = await prismaClient.user.findFirst({
        where: {
            username: data.data.username
        }
    })

    if(!user) {
        res.status(403).send("User not found");
        return;
    }

    if (!bcrypt.compareSync(data.data.password, user.password)) {
        res.status(403).send("Invalid credentials");
        return;
    }

    let token = jwt.sign({
        sub: user.id
    }, process.env.JWT_SECRET!)


    res.json({
        jwt: token
    })
})

app.post("/website", authMiddleware, async (req, res) => {
    if (!req.body.url) {
        res.status(411).json({
            message: "Missing url"
        });
        return
    }
    const website = await prismaClient.website.create({
        data: {
            url: req.body.url,
            time_added: new Date(),
            user_id: req.userId!
        }
    })

    res.json({
        id: website.id
    })
});

app.get("/status/:websiteId", authMiddleware, async (req, res) => {
    const website = await prismaClient.website.findFirst({
        where: {
            user_id: req.userId!,
            id: req.params.websiteId,
        },
        include: {
            ticks: {
                orderBy: [{
                    createdAt: 'desc',
                }],
                take: 10
            }
        }
    })

    if (!website) {
        res.status(409).json({
            message: "Website not found"
        })
        return;
    }

    res.json({
        url: website.url,
        id: website.id,
        user_id: website.user_id,
        ticks: website.ticks
    })

})

app.get("/websites", authMiddleware, async (req, res) => {
    const websites = await prismaClient.website.findMany({
        where: {
            user_id: req.userId
        },
        include: {
            ticks: {
                orderBy: [{
                    createdAt: 'desc',
                }],
                take: 1
            }
        }
    })
    res.json({
        websites
    })
})

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});