// Son of Anton — MCP Gateway (stub)
// Full implementation: Phase 0, instruction 04

const http = require('http');

const PORT = 3100;

const server = http.createServer((req, res) => {
	if (req.url === '/health') {
		res.writeHead(200, { 'Content-Type': 'application/json' });
		res.end(JSON.stringify({ status: 'ok', service: 'mcp-gateway' }));
		return;
	}
	res.writeHead(404);
	res.end('Not found');
});

server.listen(PORT, () => {
	console.log(`[mcp-gateway] Health endpoint listening on port ${PORT}`);
});
