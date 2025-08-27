import { describe, it, expect, beforeAll } from "bun:test";
import axios from "axios";
import { createUser } from "./testUtils";
import { BACKEND_URL } from "./config";

describe("Website gets created", () => {
    let token: string;

    beforeAll(async () => {
        const data = await createUser();
        token = data.jwt;
    })

    it("Website is not created if url is not present", async () => {
        try {
            await axios.post(`${BACKEND_URL}/website`, {

            }, {
                headers: {
                    Authorization: token
                }
            });
            expect(false, "Website is created when it shouldnt");
        } catch (e) {
            console.log(e);
        }

    })

    it("Website is created if url is present", async () => {
        const response = await axios.post(`${BACKEND_URL}/website`, {
            url: "https://google.com"
        }, {
            headers: {
                Authorization: token
            }
        })
        expect(response.data.id).not.toBeNull();
    })


    it("Website is not created if the header is not present", async () => {
        try {
            const response = await axios.post(`${BACKEND_URL}/website`, {
                url: "https://google.com"
            });
            expect(false, "Website shouldnt be created if no auth header")
        } catch (e) {
            // console.log(e);
        }
    })
})

describe("Can fetch website", () => {
    let token1: string, userId1: string;
    let token2: string, userId2: string;

    beforeAll(async () => {
        const user1 = await createUser();
        const user2 = await createUser();
        token1 = user1.jwt;
        userId1 = user1.id;
        token2 = user2.jwt;
        userId2 = user2.id;
    });

    it("Is able to fetch a website that the user created", async () => {
        const websiteResponse = await axios.post(`${BACKEND_URL}/website`, {
            url: "https://netflix.com/"
        }, {
            headers: {
                Authorization: token1
            }
        })

        const getWebsiteResponse = await axios.get(`${BACKEND_URL}/status/${websiteResponse.data.id}`, {
            headers: {
                Authorization: token1
            }
        })

        expect(getWebsiteResponse.data.id).toBe(websiteResponse.data.id)
        expect(getWebsiteResponse.data.user_id).toBe(userId1)
    })

    it("Cant access website created by other user", async () => {
        const websiteResponse = await axios.post(`${BACKEND_URL}/website`, {
            url: "https://csgoscarpatternrare.com/"
        }, {
            headers: {
                Authorization: token1
            }
        })

        try {
            await axios.get(`${BACKEND_URL}/status/${websiteResponse.data.id}`, {
                headers: {
                    Authorization: token2
                }
            })
            expect(false, "Should not be able to access website of a diff user")
        } catch (e) {
            console.log(e);
        }
    })
})

describe("Should be able to fetch all websites", () => {
    let token: string, userId: string;

    beforeAll(async () => {
        const user = await createUser();
        token = user.jwt;
        userId = user.id;
    });
    it("Can fetch its own set of websites", async () => { 
        await axios.post(`${BACKEND_URL}/website`, {
            url: "https://google.com/"
        }, {
            headers: {
                Authorization: token
            }
        })

        await axios.post(`${BACKEND_URL}/website`, {
            url: "https://facebook.com/"
        }, {
            headers: {
                Authorization: token
            }
        })

        const response = await axios.get(`${BACKEND_URL}/websites`, {
            headers: {
                Authorization: token
            }
        })
        expect(response.data.websites.length == 2, "Incorrect number of websites created")
    })
})