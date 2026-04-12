import { createServer } from 'http-server';

const server = createServer({
	root: '.',
	cache: -1,
	cors: true,
	headers: {
		'Cross-Origin-Opener-Policy': 'same-origin',
		'Cross-Origin-Embedder-Policy': 'credentialless',
		'Access-Control-Allow-Origin': '*',
	},
});

server.listen(8081, 'localhost', () => {
	console.log('Serving on http://localhost:8081');
});
