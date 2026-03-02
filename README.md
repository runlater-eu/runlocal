# runlocal

Expose your local development server to the internet. Get a public HTTPS URL that tunnels requests to `localhost` via [runlocal.eu](https://runlocal.eu).

No account needed. No configuration. Just run it.

## Install

```sh
npm install -g runlocal
```

## Usage

```sh
# Tunnel to localhost:3000 (default)
runlocal

# Tunnel to a specific port
runlocal 4000

# Use a custom tunnel server
runlocal 3000 --host wss://your-server.com
```

You'll get a public URL like `https://abc123.runlocal.eu` that forwards HTTP requests to your local server.

### Options

| Option | Description |
|---|---|
| `<port>` | Local port to forward to (default: `3000`) |
| `--host <url>` | Tunnel server URL (default: `wss://runlocal.eu`) |
| `--help`, `-h` | Show help |

### Environment variables

| Variable | Description |
|---|---|
| `RUNLOCAL_HOST` | Same as `--host`. The flag takes precedence. |

## How it works

`runlocal` opens a WebSocket connection to the tunnel server. When someone visits your public URL, the server forwards the HTTP request through the WebSocket. `runlocal` proxies it to your local server and sends the response back.

```
Browser → runlocal.eu → WebSocket → runlocal CLI → localhost:3000
```

## Contributing

### Setup

```sh
git clone git@github.com:runlater-eu/runlocal.git
cd runlocal
npm install
```

### Running tests

```sh
npm test
```

Tests use Node's built-in test runner (`node:test`) with no additional dependencies. The test suite covers:

- **Argument parsing** — defaults, custom port, `--host` flag, env var precedence
- **Header filtering** — strips `host` and `accept-encoding`, preserves others
- **HTTP proxying** — GET/POST, query strings, response headers, error handling
- **WebSocket lifecycle** — join, heartbeat, tunnel creation, reconnection
- **Integration** — full round-trip with real WebSocket and HTTP servers

### Project structure

```
index.js        CLI entry point
lib.js          Core logic (parseArgs, filterHeaders, handleRequest, createConnection)
test/           Test files
```

The core logic in `lib.js` uses dependency injection for the WebSocket constructor and logger, making it straightforward to test without mocking globals.

### Submitting changes

1. Create a branch for your change
2. Make sure `npm test` passes
3. Open a pull request

## License

MIT
