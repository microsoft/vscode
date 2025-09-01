/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2022-2025 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import fs = require('fs');
import path = require('path');
import express from 'express';
import { Server } from 'net';
import { log, ProxyServerStyles } from './extension';
import { Disposable, ExtensionContext } from 'vscode';
import { createProxyMiddleware, responseInterceptor } from 'http-proxy-middleware';
import { HtmlProxyServer } from './htmlProxy';
import { helpContentRewriter, htmlContentRewriter } from './util';
import { ContentRewriter, isAddressInfo, MaybeAddressInfo, PendingProxyServer, ProxyServerHtml, ProxyServerHtmlConfig, ProxyServerType } from './types';

const HOST = 'localhost';

const getStyleElement = (script: string, id: string) =>
	script.match(new RegExp(`<style id="${id}">.*?<\/style>`, 'gs'))?.[0];

const getScriptElement = (script: string, id: string) =>
	script.match(new RegExp(`<script id="${id}" type="module">.*?<\/script>`, 'gs'))?.[0];

export class ProxyServer implements Disposable {
	constructor(
		readonly serverOrigin: string,
		readonly targetOrigin: string,
		private readonly server: Server,
		readonly serverType: ProxyServerType,
	) {
	}

	dispose(): void {
		this.server.close();
	}
}

export class ErdosProxy implements Disposable {
	//#region Private Properties

	private _proxyServerHtmlConfigs: ProxyServerHtmlConfig;
	private _proxyServers = new Map<string, ProxyServer>();
	private _htmlProxyServer?: HtmlProxyServer;

	//#endregion Private Properties

	//#region Constructor & Dispose

	constructor(private readonly context: ExtensionContext) {
		this._proxyServerHtmlConfigs = {
			help: this.loadHelpResources(),
			preview: this.loadPreviewResources(),
		};
	}

	dispose(): void {
		this._proxyServers.forEach(proxyServer => {
			proxyServer.dispose();
		});
		if (this._htmlProxyServer) {
			this._htmlProxyServer.dispose();
		}
	}

	//#endregion Constructor & Dispose

	//#region Public Methods

	startHelpProxyServer(targetOrigin: string): Promise<string> {
		log.debug(`Starting a help proxy server for target: ${targetOrigin}...`);
		return this.startProxyServer(targetOrigin, helpContentRewriter, ProxyServerType.Help);
	}

	stopProxyServer(targetOrigin: string): boolean {
		log.debug(`Stopping proxy server for target: ${targetOrigin}...`);

		const proxyServer = this._proxyServers.get(targetOrigin);
		if (proxyServer) {
			this._proxyServers.delete(targetOrigin);
			proxyServer.dispose();
			return true;
		}

		return false;
	}

	async startHtmlProxyServer(targetPath: string): Promise<string> {
		log.debug(`Starting an HTML proxy server for target: ${targetPath}...`);

		if (!this._htmlProxyServer) {
			this._htmlProxyServer = new HtmlProxyServer();
		}

		return this._htmlProxyServer.createHtmlProxy(
			targetPath,
			this._proxyServerHtmlConfigs.preview
		);
	}

	setHelpProxyServerStyles(styles: ProxyServerStyles) {
		this._proxyServerHtmlConfigs.help.styles = styles;
	}

	startHttpProxyServer(targetOrigin: string): Promise<string> {
		log.debug(`Starting an HTTP proxy server for target: ${targetOrigin}...`);
		return this.startProxyServer(targetOrigin, htmlContentRewriter, ProxyServerType.Preview);
	}

	startPendingHttpProxyServer(): Promise<PendingProxyServer> {
		log.debug('Starting a pending HTTP proxy server...');
		return this.startNewProxyServer(htmlContentRewriter, ProxyServerType.Preview);
	}

	//#endregion Public Methods

	//#region Private Methods

	private loadHelpResources(): ProxyServerHtml {
		try {
			const scriptsPath = path.join(this.context.extensionPath, 'resources', 'scripts_help.html');
			const scripts = fs.readFileSync(scriptsPath).toString('utf8');

			const helpHtmlConfig = new ProxyServerHtml(
				getStyleElement(scripts, 'help-style-defaults'),
				getStyleElement(scripts, 'help-style-overrides'),
				getScriptElement(scripts, 'help-script')
			);

			return helpHtmlConfig;
		} catch (error) {
			log.error(`Failed to load the resources/scripts_help.html file: ${JSON.stringify(error)}`);
		}

		return new ProxyServerHtml();
	}

	private loadPreviewResources(): ProxyServerHtml {
		if (vscode.env.uiKind === vscode.UIKind.Web) {
			try {
				const scriptsPath = path.join(this.context.extensionPath, 'resources', 'scripts_preview.html');
				const scripts = fs.readFileSync(scriptsPath).toString('utf8');

				const scriptEl = getScriptElement(scripts, 'preview-script');
				let previewScript;
				if (scriptEl) {
					const webviewEventsScriptPath = path.join(this.context.extensionPath, 'resources', 'webview-events.js');
					const webviewEventsScript = fs.readFileSync(webviewEventsScriptPath).toString('utf8');
					previewScript = scriptEl.replace('// webviewEventsScript placeholder', webviewEventsScript);
				}

				const previewHtmlConfig = new ProxyServerHtml(
					getStyleElement(scripts, 'preview-style-defaults'),
					getStyleElement(scripts, 'preview-style-overrides'),
					previewScript,
				);

				return previewHtmlConfig;
			} catch (error) {
				log.error(`Failed to load the resources/scripts_preview.html file: ${JSON.stringify(error)}`);
			}
		}

		return new ProxyServerHtml();
	}

	private async startProxyServer(targetOrigin: string, contentRewriter: ContentRewriter, serverType: ProxyServerType): Promise<string> {
		const proxyServer = this._proxyServers.get(targetOrigin);
		if (proxyServer) {
			log.debug(`Existing proxy server ${proxyServer.serverOrigin} found for target: ${targetOrigin}.`);
			return proxyServer.serverOrigin;
		}

		let pendingProxy: PendingProxyServer;
		try {
			pendingProxy = await this.startNewProxyServer(contentRewriter, serverType);
		} catch (error) {
			log.error(`Failed to start a proxy server for ${targetOrigin}: ${JSON.stringify(error)}`);
			throw error;
		}

		const externalUri = pendingProxy.externalUri.toString(true);
		try {
			await pendingProxy.finishProxySetup(targetOrigin);
		} catch (error) {
			log.error(`Failed to finish setting up the proxy server at ${externalUri} for target ${targetOrigin}: ${JSON.stringify(error)}`);
			throw error;
		}

		return externalUri;
	}

	private async startNewProxyServer(contentRewriter: ContentRewriter, serverType: ProxyServerType): Promise<PendingProxyServer> {
		const app = express();
		let address: MaybeAddressInfo;
		const server = await new Promise<Server>((resolve, reject) => {
			const srv = app.listen(0, HOST, () => {
				address = srv.address();
				resolve(srv);
			});
			srv.on('error', reject);
		});

		if (!isAddressInfo(address)) {
			const error = `Failed to get the address info ${JSON.stringify(address)} for the server.`;
			log.error(error);
			server.close();
			throw new Error(error);
		}

		const serverOrigin = `http://${address.address}:${address.port}`;
		const originUri = vscode.Uri.parse(serverOrigin);
		const externalUri = await vscode.env.asExternalUri(originUri);

		log.debug(`Started proxy server at ${serverOrigin} for external URI ${externalUri.toString(true)}.`);

		return {
			externalUri: externalUri,
			proxyPath: externalUri.path,
			finishProxySetup: (targetOrigin: string) => {
				return this.finishProxySetup(
					targetOrigin,
					serverOrigin,
					externalUri,
					server,
					serverType,
					app,
					contentRewriter
				);
			}
		} satisfies PendingProxyServer;
	}

	private async finishProxySetup(
		targetOrigin: string,
		serverOrigin: string,
		externalUri: vscode.Uri,
		server: Server,
		serverType: ProxyServerType,
		app: express.Express,
		contentRewriter: ContentRewriter
	) {
		log.debug(`Finishing proxy server setup for target ${targetOrigin}\n` +
			`\tserverOrigin: ${serverOrigin}\n` +
			`\texternalUri: ${externalUri.toString(true)}`
		);

		this._proxyServers.set(targetOrigin, new ProxyServer(
			serverOrigin,
			targetOrigin,
			server,
			serverType
		));

		app.use('*', createProxyMiddleware({
			target: targetOrigin,
			changeOrigin: true,
			selfHandleResponse: true,
			ws: true,
			on: {
				proxyReq: (proxyReq: any, req: any, res: any, _options: any) => {
					log.trace(`onProxyReq - proxy request ${serverOrigin}${req.url} -> ${targetOrigin}${req.url}` +
						`\n\tmethod: ${proxyReq.method}` +
						`\n\tprotocol: ${proxyReq.protocol}` +
						`\n\thost: ${proxyReq.host}` +
						`\n\turl: ${proxyReq.path}` +
						`\n\theaders: ${JSON.stringify(proxyReq.getHeaders())}` +
						`\n\texternal uri: ${externalUri.toString(true)}`
					);
				},
				proxyRes: responseInterceptor(async (responseBuffer: any, proxyRes: any, req: any, _res: any) => {
					log.trace(`onProxyRes - proxy response ${targetOrigin}${req.url} -> ${serverOrigin}${req.url}` +
						`\n\tstatus: ${proxyRes.statusCode}` +
						`\n\tstatusMessage: ${proxyRes.statusMessage}` +
						`\n\theaders: ${JSON.stringify(proxyRes.headers)}` +
						`\n\texternal uri: ${externalUri.toString(true)}`
					);

					const url = req.url;
					const contentType = proxyRes.headers['content-type'];
					const serverType = this._proxyServers.get(targetOrigin)?.serverType;
					const scriptsLoaded = this.resourcesLoadedForServerType(serverType);
					if (!url || !contentType || !scriptsLoaded) {
						log.trace(`onProxyRes - skipping response processing for ${serverOrigin}${url}`);
						return responseBuffer;
					}

					const htmlConfig = serverType === ProxyServerType.Help
						? this._proxyServerHtmlConfigs.help
						: this._proxyServerHtmlConfigs.preview;

					return contentRewriter(
						serverOrigin,
						externalUri.path,
						url,
						contentType,
						responseBuffer,
						htmlConfig
					);
				}),
			},
		}));
	}

	private resourcesLoadedForServerType(serverType: ProxyServerType | undefined): boolean {
		switch (serverType) {
			case ProxyServerType.Help:
				return this._proxyServerHtmlConfigs.help.resourcesLoaded();
			case ProxyServerType.Preview:
				if (vscode.env.uiKind === vscode.UIKind.Web) {
					return this._proxyServerHtmlConfigs.preview.resourcesLoaded();
				}
				return true;
			default:
				console.log(`Can't check if resources are loaded for unknown server type: ${serverType}`);
				return false;
		}
	}

	//#endregion Private Methods
}