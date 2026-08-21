import { createServer } from 'node:http';

export function startHealthServer({
  port = process.env.PORT,
  isReady = () => true,
} = {}) {
  if (!port) return null;

  const parsedPort = Number.parseInt(port, 10);
  if (!Number.isInteger(parsedPort) || parsedPort < 1 || parsedPort > 65535) {
    throw new RangeError('PORT 必須是1～65535的整數');
  }

  const server = createServer((request, response) => {
    if (request.url === '/readyz') {
      const ready = isReady();
      response.writeHead(ready ? 200 : 503, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ ready }));
      return;
    }

    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ service: 'slotbattle-bot', alive: true }));
  });

  server.listen(parsedPort, '0.0.0.0', () => {
    console.log(`健康檢查服務已監聽 ${parsedPort}`);
  });

  return server;
}
