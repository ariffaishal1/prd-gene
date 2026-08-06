import { createApp } from "./app.js";
import { loadConfig } from "./config.js";

const config = loadConfig();
const { app, uploadStore } = createApp({ config });

const server = app.listen(config.port, () => {
  console.log(`PRD Studio API berjalan di http://localhost:${config.port}`);
});

function shutdown() {
  uploadStore.close();
  server.close(() => process.exit(0));
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
