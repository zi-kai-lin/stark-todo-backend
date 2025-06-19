// src/server.ts
import dotenv from 'dotenv';
import app from './app';

// Load environment variables
dotenv.config();

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log("Changes");
    console.log("backend server listening on port", PORT);
});