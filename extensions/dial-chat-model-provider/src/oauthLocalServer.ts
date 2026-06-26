import http from 'http';
import { dialLog } from './logger';

export const OAUTH_CALLBACK_PATH = '/oauth-callback';
export const DEFAULT_OAUTH_CALLBACK_PORT = 47821;

export function getLoopbackRedirectUri(port: number): string {
	return `http://127.0.0.1:${port}${OAUTH_CALLBACK_PATH}`;
}

export interface OAuthLoopbackSession {
	readonly redirectUri: string;
	waitForAuthorizationCode(): Promise<string>;
	dispose(): void;
}

export function startOAuthLoopbackSession(options: {
	port: number;
	expectedState: string;
	timeoutMs?: number;
	signal?: AbortSignal;
}): Promise<OAuthLoopbackSession> {
	const { port, expectedState, timeoutMs = 300_000, signal } = options;
	const redirectUri = getLoopbackRedirectUri(port);

	return new Promise((resolve, reject) => {
		let settled = false;
		let codeResolve: (code: string) => void;
		let codeReject: (error: Error) => void;

		const codePromise = new Promise<string>((res, rej) => {
			codeResolve = res;
			codeReject = rej;
		});

		const finish = (error?: Error, code?: string): void => {
			if (settled) {
				return;
			}
			settled = true;
			clearTimeout(timer);
			signal?.removeEventListener('abort', onAbort);
			server.close();

			if (error) {
				codeReject(error);
			} else if (code) {
				codeResolve(code);
			}
		};

		const fail = (error: Error): void => {
			finish(error);
		};

		const onAbort = (): void => {
			fail(new Error('OAuth login cancelled'));
		};

		signal?.addEventListener('abort', onAbort);

		const timer = setTimeout(() => {
			fail(new Error('OAuth login timed out — complete sign-in within 5 minutes'));
		}, timeoutMs);

		const server = http.createServer((req, res) => {
			const requestUrl = new URL(req.url ?? '/', `http://127.0.0.1:${port}`);

			if (requestUrl.pathname !== OAUTH_CALLBACK_PATH) {
				res.writeHead(404);
				res.end();
				return;
			}

			const params = requestUrl.searchParams;
			const oauthError = params.get('error');
			if (oauthError) {
				const description =
					params.get('error_description')?.replace(/\+/g, ' ') ?? oauthError;
				res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
				res.end(buildCallbackHtml(`Sign-in failed: ${escapeHtml(description)}`, true));
				fail(new Error(`Keycloak authorization failed: ${description}`));
				return;
			}

			const state = params.get('state');
			if (state !== expectedState) {
				res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
				res.end(buildCallbackHtml('Sign-in failed: state mismatch.', true));
				fail(new Error('OAuth state mismatch — possible CSRF attempt'));
				return;
			}

			const code = params.get('code');
			if (!code) {
				res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
				res.end(buildCallbackHtml('Sign-in failed: authorization code missing.', true));
				fail(new Error('Authorization code missing in redirect'));
				return;
			}

			res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
			res.end(buildCallbackHtml('Sign-in complete.', false));
			dialLog.info('Authorization code received via loopback callback');
			finish(undefined, code);
		});

		server.on('error', (error) => {
			const detail = error instanceof Error ? error.message : String(error);
			reject(
				new Error(
					`OAuth callback server failed on port ${port}: ${detail}. Change dial.oauthCallbackPort or free the port.`,
				),
			);
		});

		server.listen(port, '127.0.0.1', () => {
			dialLog.info('OAuth loopback callback listening', redirectUri);
			resolve({
				redirectUri,
				waitForAuthorizationCode: () => codePromise,
				dispose: () => {
					if (!settled) {
						fail(new Error('OAuth login cancelled'));
					} else {
						server.close();
					}
				},
			});
		});
	});
}

function buildCallbackHtml(message: string, isError: boolean): string {
	return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>DIAL Sign-in</title>
<style>
body { font-family: system-ui, sans-serif; margin: 2rem; color: ${isError ? '#b00020' : '#1a1a1a'}; }
</style>
</head>
<body><p>${message}</p></body>
</html>`;
}

function escapeHtml(value: string): string {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}
