import net from "node:net";

const port = Number(process.argv[2] ?? "3000");
const host = process.argv[3] ?? "127.0.0.1";
const timeoutMs = Number(process.env.WAIT_FOR_PORT_TIMEOUT_MS ?? "30000");
const intervalMs = 250;
const startedAt = Date.now();

function canConnect() {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let settled = false;

    function finish(value) {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(value);
    }

    socket.setTimeout(1000);
    socket.once("connect", () => finish(true));
    socket.once("timeout", () => finish(false));
    socket.once("error", () => finish(false));
    socket.connect(port, host);
  });
}

async function waitForPort() {
  while (Date.now() - startedAt < timeoutMs) {
    const connected = await canConnect();
    if (connected) {
      process.stdout.write(`wait-for-port: ${host}:${port} is ready\n`);
      process.exit(0);
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  process.stderr.write(`wait-for-port: timed out after ${timeoutMs}ms waiting for ${host}:${port}\n`);
  process.exit(1);
}

void waitForPort();
