import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";

// Middleware to authenticate requests using JWT
export function authMiddleware(req: Request, res: Response, next: NextFunction) {
    const header = req.headers.authorization!; // Expect token in Authorization header

    try {
        // Verify token and attach user ID to request
        const data = jwt.verify(header, process.env.JWT_SECRET!);
        req.userId = data.sub as string;
        next();
    } catch (e) {
        console.log(e);
        // Respond with 403 if token is invalid
        res.status(403).send("Invalid token");
    }
}
