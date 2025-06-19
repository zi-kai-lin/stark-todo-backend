import express, { Request, Response } from "express";
import cors from 'cors';
import helmet from 'helmet';
import morgan from "morgan";
import bodyParser from "body-parser";



const corsSettings = {
    origin: [
        "http://localhost:3000",
        "http://localhost:3005"
    ],
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
    maxAge: 86400
};

const app = express();

app.use(cors(corsSettings));
app.use(helmet());
app.use(morgan('tiny'));  // HTTP request logger
app.use(bodyParser.json()); // Parse JSON request bodies


app.get('/', (req: Request, res: Response) => {


    res.status(200).json({ message: 'Hello from Todo API!' });




})

export default app;

