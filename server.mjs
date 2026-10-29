import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url));
const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png"
};

const server = createServer(async (req, res) => {
  const requested = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
  const relative = requested === "/" ? "index.html" : requested.replace(/^\/+/, "");
  const file = normalize(join(root, relative));

  if (!file.startsWith(root)) {
    res.writeHead(403);
    return res.end("Forbidden");
  }

  try {
    const target = (await stat(file)).isDirectory() ? join(file, "index.html") : file;
    res.writeHead(200, {
      "Content-Type": mime[extname(target)] || "application/octet-stream",
      "Cache-Control": "no-store"
    });
    res.end(await readFile(target));
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Not found");
  }
});

const requestedPort = Number(process.env.PORT || 4173);
function start(port) {
  server.once("error", (error) => {
    if (error.code === "EADDRINUSE" && port < requestedPort + 10) {
      const nextPort = port + 1;
      console.log("Port " + port + " is busy. Trying http://localhost:" + nextPort);
      start(nextPort);
      return;
    }
    throw error;
  });

  server.listen(port, () => {
    console.log("AI Factory Manager ready at http://localhost:" + port);
  });
}

start(requestedPort);