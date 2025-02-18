const express = require("express");
const axios = require("axios");
const cors = require("cors");
require("dotenv").config(); // Use environment variables

const app = express();
const PORT = 3000;

// **Secure CORS Configuration**
const allowedOrigins = ["https://sstalent.us/job.html"]; // Replace with your frontend domains

app.use(cors({
    origin: function (origin, callback) {
        if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            callback(new Error("Not allowed by CORS"));
        }
    }
}));

app.use(express.json());

// **Ceipal API Details**
const CEIPAL_AUTH_URL = "https://api.ceipal.com/v1/createAuthtoken/";
const CEIPAL_JOB_URL = "https://api.ceipal.com/getCustomJobPostingDetails/Z3RkUkt2OXZJVld2MjFpOVRSTXoxZz09/b8a3f0d4a99e444dc4752c7bdc986766";

const CEIPAL_CREDENTIALS = {
    email: process.env.CEIPAL_EMAIL || "your_email",
    password: process.env.CEIPAL_PASSWORD || "your_password",
    api_key: process.env.CEIPAL_API_KEY || "your_api_key"
};

let authToken = "";
let tokenExpiryTime = 0; // Track token validity
let cachedJobs = [];  // Store jobs in memory
let lastFetchedTime = 0;  // Timestamp of last API call

const CACHE_EXPIRY = 30 * 60 * 1000; // Cache expiry time (30 minutes)

/** **Step 1: Authenticate & Get Token** */
async function authenticate() {
    try {
        if (Date.now() < tokenExpiryTime) {
            console.log("Using cached token");
            return authToken;
        }

        const response = await axios.post(CEIPAL_AUTH_URL, CEIPAL_CREDENTIALS, {
            headers: { "Content-Type": "application/json" }
        });

        authToken = response.data.access_token;
        tokenExpiryTime = Date.now() + 60 * 60 * 1000; // Token expires in 1 hour
        console.log("Authenticated successfully!");

        return authToken;
    } catch (error) {
        console.error("Authentication Error:", error.response?.data || error.message);
        return null;
    }
}

/** **Step 2: Fetch Jobs from All Pages (With Cache Check)** */
async function fetchAllJobs() {
    try {
        if (Date.now() - lastFetchedTime < CACHE_EXPIRY && cachedJobs.length > 0) {
            console.log("Serving jobs from cache...");
            return cachedJobs;
        }

        const token = await authenticate();
        if (!token) return [];

        let allJobs = [];
        let page = 1;
        let hasNextPage = true;

        while (hasNextPage) {
            console.log(`Fetching page ${page}...`);

            const response = await axios.get(`${CEIPAL_JOB_URL}?page=${page}`, {
                headers: { Authorization: `Bearer ${token}` }
            });

            const jobs = response.data.results || [];
            allJobs = [...allJobs, ...jobs];

            // Check if there is another page
            hasNextPage = response.data.next !== null;
            page++;
        }

        console.log(`Total Jobs Fetched: ${allJobs.length}`);

        // Store jobs in cache
        cachedJobs = allJobs;
        lastFetchedTime = Date.now();

        return allJobs;
    } catch (error) {
        console.error("Job Fetching Error:", error.response?.data || error.message);
        return [];
    }
}

/** **Step 3: API Route to Serve Jobs (Domain Restriction)** */
app.get("/getJobs", async (req, res) => {
    const origin = req.get("origin");

    if (!allowedOrigins.includes(origin)) {
        return res.status(403).json({ error: "Access denied" });
    }

    const jobs = await fetchAllJobs();
    res.json(jobs);
});

/** **Step 4: Automatic Job Refresh Every 30 Minutes** */
setInterval(async () => {
    console.log("Refreshing job cache...");
    await fetchAllJobs();
}, CACHE_EXPIRY);

/** **Step 5: Start Server** */
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
