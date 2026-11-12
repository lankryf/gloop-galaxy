import crypto from "node:crypto";
import net from "node:net";

const key = crypto.randomBytes(16).toString("base64");
const sock = net.connect(Number(process.env.PORT ?? 8080), "127.0.0.1", () => {
  sock.write(
    `GET /ws HTTP/1.1\r\nHost: localhost\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: ${key}\r\nSec-WebSocket-Version: 13\r\n\r\n`,
  );
});
sock.once("data", () => {
  sock.write(Buffer.from([0xc1, 0x80, 1, 2, 3, 4]));
  setTimeout(() => sock.destroy(), 300);
});
sock.on("error", () => {});
