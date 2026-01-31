const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");

const authRoutes = require("./routes/auth.routes");
const submissionRoutes = require("./routes/submission.routes");
const experimentRoutes = require("./routes/experiment.routes");
const labRoutes = require("./routes/lab.routes");
const problemRoutes = require("./routes/problem.routes");

const app = express();

app.use(helmet());
app.use(cors({ origin: true, credentials: true }));

app.use(express.json());

app.use(morgan("dev"));

app.get("/", (req, res) => {
  res.json({ message: "LEAP Backend Running ✅" });
});

app.use("/api/auth", authRoutes);
app.use("/api/labs", labRoutes);
app.use("/api/problems", problemRoutes);
app.use("/api/submissions", submissionRoutes);
app.use("/api/experiments", experimentRoutes);


module.exports = app;


