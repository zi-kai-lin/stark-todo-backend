// src/server.ts
import dotenv from 'dotenv';
import app from './app';
import { loadEnvPath } from './utils/envVar';
// Load environment variables

const envPath = loadEnvPath()
dotenv.config(envPath);


const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log("Changes");
    console.log("backend server listening on port", PORT);
});