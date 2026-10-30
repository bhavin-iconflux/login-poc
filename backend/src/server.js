import { loadConfig } from "./config.js";
import { createUserStore } from "./users.js";
import { createApp } from "./app.js";

const config = loadConfig();
const userStore = await createUserStore();
const app = createApp({ config, userStore });

app.listen(config.port, () => {
  console.log(`Backend listening on port ${config.port}`);
});
