/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Lotas Inc. All rights reserved.
 *  Licensed under the AGPL v3 License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { shell } from 'electron';
import { createServer } from 'http';
import { Disposable } from '../../../base/common/lifecycle.js';
import { Event, Emitter } from '../../../base/common/event.js';
import { IOAuthMainService, IOAuthResult } from '../common/oauth.js';
import { ILogService } from '../../log/common/log.js';

export class OAuthMainService extends Disposable implements IOAuthMainService {
	declare readonly _serviceBrand: undefined;

	private readonly _onDidCompleteOAuth = this._register(new Emitter<IOAuthResult>());
	readonly onDidCompleteOAuth: Event<IOAuthResult> = this._onDidCompleteOAuth.event;

	private _server: any = null;

	constructor(
		@ILogService private readonly logService: ILogService
	) {
		super();
	}

	async startOAuthFlow(authUrl: string): Promise<void> {
		// Ignore authUrl parameter - we build our own URL for OAuth flow
		if (this._server) {
			this.logService.warn('OAuth flow already in progress, stopping previous server');
			await this.stopOAuthServer();
		}

		try {
			// Create HTTP server for OAuth callback
			const loopbackInfo = await this.startAuthLoopbackServer();
			const loopbackUrl = `http://${loopbackInfo.address}:${loopbackInfo.port}/auth_callback`;
			
			// Determine backend environment for OAuth redirect
			const backendEnv = await this.detectBackendEnvironment();
			let finalAuthUrl: string;
			
			if (backendEnv === "local") {
				finalAuthUrl = `http://localhost:3000/rao-callback?redirect_uri=${encodeURIComponent(loopbackUrl)}`;
			} else {
				finalAuthUrl = `https://www.lotas.ai/rao-callback?redirect_uri=${encodeURIComponent(loopbackUrl)}`;
			}
			
			this.logService.info('OAuth callback server started on:', loopbackUrl);
			this.logService.info('Opening OAuth URL in external browser:', finalAuthUrl);

			// Open OAuth URL in external browser to leverage existing authentication cookies
			await shell.openExternal(finalAuthUrl);

		} catch (error) {
			this.logService.error('Failed to start OAuth flow:', error);
			this._onDidCompleteOAuth.fire({
				error: 'oauth_error',
				error_description: error instanceof Error ? error.message : 'Unknown OAuth error'
			});
		}
	}

	// Start authentication loopback server
	private async startAuthLoopbackServer(): Promise<{ address: string; port: number }> {
		// Try both IPv4 and IPv6 loopback as recommended by RFC 8252
		const loopbackAddresses = ['127.0.0.1', '::1'];

		for (const address of loopbackAddresses) {
			// Try ephemeral port range (49152-65535 as recommended by IANA)
			const startPort = Math.floor(Math.random() * (65535 - 49152 + 1)) + 49152;

							for (let i = 0; i < 100; i++) { // Try up to 100 ports
				let port = startPort + i;
				if (port > 65535) port = 49152 + (port - 65536); // Wrap around to beginning of range

				try {
					await this.tryStartServer(address, port);
					return { address, port };
				} catch (error: any) {
					if (error.code === 'EADDRINUSE') {
						continue; // Try next port
					}
					throw error;
				}
			}
		}

		throw new Error('Unable to start OAuth callback server: no available ports');
	}

	// Start HTTP server with OAuth callback handling
	private async tryStartServer(address: string, port: number): Promise<void> {
		return new Promise((resolve, reject) => {
			const server = createServer((req: any, res: any) => {
				this.logService.info('OAuth HTTP request received:', req.url);
				
				if (req.url && req.url.includes('/auth_callback')) {
					this.logService.info('OAuth callback detected, parsing URL:', req.url);
					const url = new URL(req.url, `http://${req.headers.host}`);
					const apiKey = url.searchParams.get('api_key');
					const error = url.searchParams.get('error');

					this.logService.info('OAuth callback params - api_key:', apiKey ? `${apiKey.substring(0, 10)}...` : 'null', 'error:', error || 'null');

					if (apiKey && apiKey !== "") {
						// Save the API key and notify UI
						this._onDidCompleteOAuth.fire({ api_key: apiKey });

						// Schedule server cleanup after 3 seconds
						setTimeout(() => {
							this.stopOAuthServer();
						}, 3000);

						// Return success page
						const successHtml = `<!DOCTYPE html>
<html><head>
<meta charset="UTF-8">
<title>Authentication Successful</title></head>
<body style="font-family: Arial, sans-serif; text-align: center; margin-top: 50px;">
<div style="color: green; font-size: 48px; margin-bottom: 16px;">&#x2713;</div>
<h2 style="color: #333; margin-bottom: 8px;">Authentication Successful</h2>
<p style="color: #666;">You can now close this window and return to Erdos.</p>
<script>setTimeout(function(){ window.close(); }, 3000);</script>
</body></html>`;

						res.writeHead(200, { 'Content-Type': 'text/html' });
						res.end(successHtml);
						return;
					} else {
						// Handle error case
						const errorHtml = `<!DOCTYPE html>
<html><head><title>Authentication Failed</title></head>
<body style="font-family: Arial, sans-serif; text-align: center; margin-top: 50px;">
<div style="color: red; font-size: 48px; margin-bottom: 16px;">✗</div>
<h2 style="color: #333; margin-bottom: 8px;">Authentication Failed</h2>
<p style="color: #666;">No API key received. Please try again.</p>
</body></html>`;

						res.writeHead(400, { 'Content-Type': 'text/html' });
						res.end(errorHtml);
						return;
					}
				}

				// Default 404 response
				res.writeHead(404, { 'Content-Type': 'text/plain' });
				res.end('Not Found');
			});

			server.listen(port, address, () => {
				this._server = server;
				this.logService.info('OAuth HTTP server started on:', `${address}:${port}`);
				resolve();
			});

			server.on('error', (error: any) => {
				reject(error);
			});
		});
	}

	   // Detect backend environment for OAuth redirect
	private async detectBackendEnvironment(): Promise<string> {
		// Check if localhost:8080 backend is available
		try {
			const response = await fetch('http://localhost:8080/actuator/health', {
				method: 'GET',
				signal: AbortSignal.timeout(3000) // 3 second timeout
			});
			
			if (response.status === 200) {
				this.logService.info('Local RAO backend detected at localhost:8080');
				return 'local';
			}
		} catch (error) {
			// Local backend not available, use production
			this.logService.debug('Local RAO backend not available, using production');
		}
		
		// Default to production environment
		return 'production';
	}

	private stopOAuthServer(): void {
		if (this._server) {
			try {
				this._server.close();
				this.logService.info('OAuth HTTP server stopped');
			} catch (error) {
				this.logService.error('Error stopping OAuth server:', error);
			}
			this._server = null;
		}
	}

	async stopOAuthFlow(): Promise<void> {
		this.logService.info('Stopping OAuth flow');
		this.stopOAuthServer();
	}

	override dispose(): void {
		this.stopOAuthFlow();
		super.dispose();
	}
}
