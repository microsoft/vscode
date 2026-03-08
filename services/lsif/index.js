// Son of Anton — LSIF/SCIP Generator (stub)
// Full implementation: Phase 0, instruction 03

const http = require('http');

const PORT = process.env.PORT || 8081;

const server = http.createServer((req, res) => {
	if (req.url === '/health') {
		res.writeHead(200, { 'Content-Type': 'application/json' });
		res.end(JSON.stringify({ status: 'ok', service: 'lsif' }));
		return;
	}
	res.writeHead(404);
	res.end('Not found');
});

server.listen(PORT, () => {
	console.log(`[lsif] Health endpoint listening on port ${PORT}`);
});
