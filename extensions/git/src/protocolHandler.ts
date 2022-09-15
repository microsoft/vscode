/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vscode-nls';
const localize = nls.loadMessageBundle();

import { UriHandler, Uri, window, Disposable, commands } from 'vscode';
import { dispose } from './util';
import * as querystring from 'querystring';
import { OutputChannelLogger } from './log';

const schemes = new Set(['file', 'git', 'http', 'https', 'ssh']);

export class GitProtocolHandler implements UriHandler {

	private disposables: Disposable[] = [];

	constructor(private readonly outputChannelLogger: OutputChannelLogger) {
		this.disposables.push(window.registerUriHandler(this));
	}

	handleUri(uri: Uri): void {
		this.outputChannelLogger.logInfo(`GitProtocolHandler.handleUri(${uri.toString()})`);

		switch (uri.path) {
			case '/clone': this.clone(uri);
		}
	}

	private async clone(uri: Uri): Promise<void> {
		const data = querystring.parse(uri.query);
		const ref = data.ref;

		if (!data.url) {
			this.outputChannelLogger.logWarning('Failed to open URI:' + uri.toString());
			return;
		}

		if (Array.isArray(data.url) && data.url.length === 0) {
			this.outputChannelLogger.logWarning('Failed to open URI:' + uri.toString());
			return;
		}

		if (ref !== undefined && typeof ref !== 'string') {
			this.outputChannelLogger.logWarning('Failed to open URI:' + uri.toString());
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
			this.outputChannelLogger.logWarning('Invalid URI:' + uri.toString());
			return;
		}

		if (!(await commands.getCommands(true)).includes('git.clone')) {
			this.outputChannelLogger.logError('Could not complete git clone operation as git installation was not found.');

			const errorMessage = localize('no git', 'Could not clone your repository as Git is not installed.');
			const downloadGit = localize('download git', 'Download Git');

			if (await window.showErrorMessage(errorMessage, { modal: true }, downloadGit) === downloadGit) {
				commands.executeCommand('vscode.open', Uri.parse('https://aka.ms/vscode-download-git'));
			}

			return;
		} else {
			const cloneTarget = cloneUri.toString(true);
			this.outputChannelLogger.logInfo(`Executing git.clone for ${cloneTarget}`);
			commands.executeCommand('git.clone', cloneTarget, undefined, { ref: ref });
		}
	}

	dispose(): void {
		this.disposables = dispose(this.disposables);
	}
}
