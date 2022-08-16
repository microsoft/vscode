/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { UriHandler, Uri, window, Disposable, commands } from 'vscode';
import { dispose } from './util';
import * as querystring from 'querystring';

const schemes = new Set(['file', 'git', 'http', 'https', 'ssh']);

export class GitProtocolHandler implements UriHandler {

	private disposables: Disposable[] = [];

	constructor() {
		this.disposables.push(window.registerUriHandler(this));
	}

	handleUri(uri: Uri): void {
		switch (uri.path) {
			case '/clone': this.clone(uri);
		}
	}

	private clone(uri: Uri): void {
		const data = querystring.parse(uri.query);
		const ref = data.ref;

		if (!data.url) {
			console.warn('Failed to open URI:', uri);
			return;
		}

		if (Array.isArray(data.url) && data.url.length === 0) {
			console.warn('Failed to open URI:', uri);
			return;
		}

		if (ref !== undefined && typeof ref !== 'string') {
			console.warn('Failed to open URI:', uri);
			return;
		}

		let cloneUri: Uri;
		try {
			let rawUri = Array.isArray(data.url) ? data.url[0] : data.url;

			// Handle SSH Uri
			// Ex: git@github.com:microsoft/vscode.git
			rawUri = rawUri.replace(/^(git@[^\/:]+)(:)/i, 'ssh://$1/');

			cloneUri = Uri.parse(rawUri, true);

			// Validate against supported schemes
			if (!schemes.has(cloneUri.scheme.toLowerCase())) {
				throw new Error('Unsupported scheme.');
			}
		}
		catch (ex) {
			console.warn('Invalid URI:', uri);
			return;
		}

		commands.executeCommand('git.clone', cloneUri.toString(true), undefined, { ref: ref });
	}

	dispose(): void {
		this.disposables = dispose(this.disposables);
	}
}
