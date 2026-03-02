#!/usr/bin/env node

const WebSocket = require("ws");
const { parseArgs, createConnection } = require("./lib");

const BOLD = "\x1b[1m";
const RESET = "\x1b[0m";

const { port, host, apiKey } = parseArgs(process.argv.slice(2));

console.log(`${BOLD}runlocal${RESET} — expose localhost:${port} to the internet`);
createConnection({ host, port, apiKey, WebSocket });
