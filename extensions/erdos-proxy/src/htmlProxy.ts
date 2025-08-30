/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2024 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import express from 'express';
import path = require('path');
import fs = require('fs');

import { Disposable, Uri } from 'vscode';
import { injectPreviewResources, PromiseHandles } from './util';
import { isAddressInfo, ProxyServerHtml } from './types';

export class HtmlProxyServer implements Disposable {
	private readonly _app = express();
	private readonly _server;

	private readonly _paths = new Map<string, string>();
	private readonly _ready: PromiseHandles<void> = new PromiseHandles();

	constructor() {
		this._server = this._app.listen(0, 'localhost', () => {
			this._ready.resolve();
		});
	}

	public async createHtmlProxy(
		targetPath: string,
		htmlConfig?: ProxyServerHtml
	): Promise<string> {
		await this._ready.promise;

		const targetUri = Uri.parse(targetPath);
		let filepath: string;
		let fileToServe: string;

		if (targetUri.scheme === 'file') {
			filepath = targetUri.fsPath;
		} else {
			filepath = targetPath;
		}

		const stats = fs.statSync(filepath);
		let parentDir: string;
		if (stats.isDirectory()) {
			parentDir = filepath;
			fileToServe = '';
		} else {
			parentDir = path.dirname(filepath);
			fileToServe = path.basename(filepath);
		}

		let proxyPath = this._paths.get(parentDir);
		if (!proxyPath) {
			const proxyId = Math.random().toString(36).substring(2, 15);
			proxyPath = `/html-proxy/${proxyId}`;
			this._paths.set(parentDir, proxyPath);

			this._app.use(proxyPath, express.static(parentDir));

			if (htmlConfig) {
				this._app.get(`${proxyPath}/*.html`, (req: any, res: any, next: any) => {
					const requestedFile = path.join(parentDir, req.path.substring(proxyPath!.length));
					if (fs.existsSync(requestedFile)) {
						let content = fs.readFileSync(requestedFile, 'utf8');
						content = injectPreviewResources(content, htmlConfig);
						res.send(content);
					} else {
						next();
					}
				});
			}
		}

		const address = this._server.address();
		if (!isAddressInfo(address)) {
			throw new Error('Failed to get server address');
		}

		const baseUrl = `http://localhost:${address.port}${proxyPath}`;
		return fileToServe ? `${baseUrl}/${fileToServe}` : baseUrl;
	}

	dispose(): void {
		this._server.close();
	}
}