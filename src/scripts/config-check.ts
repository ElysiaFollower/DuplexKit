import { getConfigStatus, loadConfig } from "../config.js";

console.log(JSON.stringify(getConfigStatus(loadConfig()), null, 2));
