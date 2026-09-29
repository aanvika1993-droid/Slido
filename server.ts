import { createServer } from "node:http";
import next from "next";
import { Server } from "socket.io";
import { assertAuthSecret } from "./src/server/auth";
import { CLIENT_IP_HEADER, isAllowedOrigin, resolveClientIp } from "./src/server/network";
import { registerSocketHandlers } from "./src/server/socket";

const dev = process.env.NODE_ENV !== "production";
const port = Number(process.env.PORT ?? 3000);
if (!dev) assertAuthSecret();

const app = next({ dev });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const httpServer = createServer((req, res) => {
    // Overwrite any client-supplied value so route handlers can trust it.
    req.headers[CLIENT_IP_HEADER] = resolveClientIp(req.socket.remoteAddress, req.headers["x-forwarded-for"]);
    handle(req, res);
  });
  const io = new Server(httpServer, {
    allowRequest: (req, callback) => callback(null, isAllowedOrigin(req.headers.origin, req.headers.host)),
    maxHttpBufferSize: 256 * 1024,
  });
  registerSocketHandlers(io);
  httpServer.listen(port, () => {
    console.log(`> Ready on http://localhost:${port}`);
  });
});
