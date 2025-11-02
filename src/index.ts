import express, { type Application, type Request, type Response } from "express";



const app: Application = express();
const PORT = process.env.PORT || 5000;

app.use(express.json());



// Root route
app.get("/", (req: Request, res: Response) => {
  res.send("💱 Money Exchange API is running!");
});


// Optional: 404 handler
app.use((req, res) => {
  res.status(404).json({ message: "Page not found" });
});



app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
