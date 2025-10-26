import http from 'http';
import express from 'express';
import cookieParser from 'cookie-parser';
import session from 'express-session';
import passport from 'passport';
import cors from 'cors';
import dotenv from 'dotenv';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { authRouter } from './routes/auth';
import { healthRouter } from './routes/health';
import { workspacesRouter } from './routes/workspaces';
import { requireAuth } from './middleware/requireAuth';
import { setupPassport } from './auth/providers';

dotenv.config();

const app = express();
const openvscodeTarget = process.env.OPENVSCODE_URL || 'http://openvscode:3000';
const yjsTarget = process.env.YJS_WS_URL || 'http://yjs-ws:1234';

// Middleware
app.use(cors({
	origin: process.env.CORS_ORIGIN || 'http://localhost:8080',
	credentials: true
}));
app.use(express.json());
app.use(cookieParser());
app.use(session({
	secret: process.env.SESSION_SECRET || 'change_me',
	resave: false,
	saveUninitialized: false,
	cookie: {
		httpOnly: true,
		secure: process.env.NODE_ENV === 'production',
		sameSite: 'lax',
		maxAge: 24 * 60 * 60 * 1000, // 24 hours
		path: '/'
	},
	rolling: true // Reset expiry on every request
}));

// Passport setup
app.use(passport.initialize());
app.use(passport.session());
setupPassport();

// Routes
app.use('/health', healthRouter);
app.use('/auth', authRouter);
app.use('/api/workspaces', requireAuth, workspacesRouter);

// Root route - landing page
app.get('/', (req: any, res) => {
	if (req.isAuthenticated()) {
		// Already logged in, redirect to IDE
		return res.redirect('/ide');
	}

	// Show simple landing page with login options
	res.send(`
		<!DOCTYPE html>
		<html lang="en">
		<head>
			<meta charset="UTF-8">
			<meta name="viewport" content="width=device-width, initial-scale=1.0">
			<title>CoCode - Collaborative Code Editor</title>
			<style>
				* { margin: 0; padding: 0; box-sizing: border-box; }
				body {
					font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
					background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
					min-height: 100vh;
					display: flex;
					align-items: center;
					justify-content: center;
					color: #fff;
				}
				.container {
					text-align: center;
					max-width: 600px;
					padding: 3rem;
					background: rgba(255, 255, 255, 0.1);
					backdrop-filter: blur(10px);
					border-radius: 20px;
					box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
				}
				h1 {
					font-size: 3rem;
					margin-bottom: 1rem;
					font-weight: 700;
				}
				p {
					font-size: 1.2rem;
					margin-bottom: 2rem;
					opacity: 0.9;
				}
				.buttons {
					display: flex;
					gap: 1rem;
					justify-content: center;
					flex-wrap: wrap;
				}
				.btn {
					display: inline-block;
					padding: 1rem 2rem;
					background: #fff;
					color: #667eea;
					text-decoration: none;
					border-radius: 50px;
					font-weight: 600;
					transition: all 0.3s ease;
					box-shadow: 0 4px 15px rgba(0, 0, 0, 0.2);
				}
				.btn:hover {
					transform: translateY(-2px);
					box-shadow: 0 6px 20px rgba(0, 0, 0, 0.3);
				}
				.btn-github {
					background: #24292e;
					color: #fff;
				}
				.btn-google {
					background: #fff;
					color: #757575;
				}
			</style>
		</head>
		<body>
			<div class="container">
				<h1>CoCode</h1>
				<p>Collaborative code editor for C, C++, and Python</p>
				<div class="buttons">
					<a href="/auth/login/github" class="btn btn-github">Sign in with GitHub</a>
					<a href="/auth/login/google" class="btn btn-google">Sign in with Google</a>
				</div>
			</div>
		</body>
		</html>
	`);
});

// Proxy to OpenVSCode (per-user workspace)
const openvscodeProxy = createProxyMiddleware({
	target: openvscodeTarget,
	changeOrigin: true,
	ws: true,
	pathRewrite: { '^/ide': '' },
	logLevel: 'debug',
	onProxyReq: (proxyReq, req: any) => {
		const workspacePath = req.user?.workspacePath || '/workspaces/default';
		proxyReq.setHeader('X-Workspace-Path', workspacePath);
		proxyReq.setHeader('X-User-Id', req.user?.id || 'anonymous');
		console.log(`[Gateway] Proxying HTTP to OpenVSCode: ${req.url}`);
	},
	onProxyReqWs: (proxyReq, req, socket) => {
		console.log(`[Gateway] Proxying WebSocket to OpenVSCode: ${req.url}`);
	},
	onError: (err, req, res) => {
		console.error('[Gateway] Proxy error:', err);
		// Check if this is a WebSocket upgrade (res won't have status method)
		if (typeof (res as any).status === 'function') {
			(res as express.Response).status(502).json({ error: 'Bad Gateway' });
		} else {
			// WebSocket error - just destroy the connection
			(res as any).destroy();
		}
	}
});
app.use('/ide', requireAuth, openvscodeProxy);

// For /stable-* routes, proxy everything to OpenVSCode root WITHOUT any proxying
// Just serve OpenVSCode directly at /vscode instead
app.use('/vscode', requireAuth, (req, res) => {
	// Redirect to OpenVSCode with workspace
	const workspacePath = (req as any).user?.workspacePath || '/workspaces/examples';
	res.redirect(`http://localhost:3000/?folder=${workspacePath}`);
});

// Temporary: Direct proxy without path rewriting (for testing)
const vscodeStaticProxy = createProxyMiddleware({
	target: process.env.OPENVSCODE_URL || 'http://openvscode:3000',
	changeOrigin: true,
	ws: true,
	logLevel: 'debug',
	// NO path rewriting - pass through as-is
	onProxyReq: (proxyReq, req) => {
		console.log(`[Gateway] Proxying static HTTP to OpenVSCode: ${req.url}`);
	},
	onProxyReqWs: (proxyReq, req, socket) => {
		console.log(`[Gateway] Proxying static WebSocket to OpenVSCode: ${req.url}`);
	},
	onError: (err, req, res) => {
		console.error('[Gateway] Static asset proxy error:', err);
		if (typeof (res as any).status === 'function') {
			(res as express.Response).status(502).json({ error: 'Bad Gateway' });
		} else {
			(res as any).destroy();
		}
	}
});
app.use('/stable-*', vscodeStaticProxy);

// Proxy Yjs WebSocket server for collaboration
const yjsProxy = createProxyMiddleware({
	target: yjsTarget,
	changeOrigin: true,
	ws: true,
	pathRewrite: { '^/yjs': '/' },
	onError: (err, req, res) => {
		console.error('[Gateway] Yjs WebSocket proxy error:', err);
		if (typeof (res as any).status === 'function') {
			(res as express.Response).status(502).json({ error: 'Bad Gateway' });
		} else {
			(res as any).destroy();
		}
	}
});
app.use('/yjs', yjsProxy);

// Error handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
	console.error('[Gateway] Error:', err);
	res.status(500).json({ error: 'Internal Server Error' });
});

const server = http.createServer(app);

server.on('upgrade', (req, socket, head) => {
	if (!req.url) {
		console.log('[Gateway] WebSocket upgrade request with no URL, destroying socket');
		socket.destroy();
		return;
	}

	console.log(`[Gateway] WebSocket upgrade request: ${req.url}`);

	if (req.url.startsWith('/yjs')) {
		console.log('[Gateway] Routing WebSocket to Yjs');
		yjsProxy.upgrade?.(req as any, socket as any, head);
		return;
	}

	if (req.url.startsWith('/ide') || req.url.startsWith('/stable-')) {
		// Both /ide and /stable-* paths need to go to OpenVSCode
		const proxy = req.url.startsWith('/ide') ? openvscodeProxy : vscodeStaticProxy;
		console.log(`[Gateway] Routing WebSocket to OpenVSCode (via ${req.url.startsWith('/ide') ? 'openvscodeProxy' : 'vscodeStaticProxy'})`);
		proxy.upgrade?.(req as any, socket as any, head);
		return;
	}

	console.log(`[Gateway] Unknown WebSocket path: ${req.url}, destroying socket`);
	socket.destroy();
});

const port = Number(process.env.PORT) || 8080;
server.listen(port, () => {
	console.log(`[Gateway] Running on port ${port}`);
	console.log(`[Gateway] OpenVSCode target: ${openvscodeTarget}`);
	console.log(`[Gateway] Yjs target: ${yjsTarget}`);
});
