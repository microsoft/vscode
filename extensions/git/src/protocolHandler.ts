/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vscode-nls';
const localize = nls.loadMessageBundle();

import { UriHandler, Uri, window, Disposable, commands, LogOutputChannel } from 'vscode';
import { dispose } from './util';
import * as querystring from 'querystring';

const schemes = new Set(['file', 'git', 'http', 'https', 'ssh']);
const refRegEx = /^$|[~\^:\\\*\s\[\]]|^-|^\.|\/\.|\.\.|\.lock\/|\.lock$|\/$|\.$/;

export class GitProtocolHandler implements UriHandler {

	private disposables: Disposable[] = [];

	constructor(private readonly logger: LogOutputChannel) {
		this.disposables.push(window.registerUriHandler(this));
	}

	handleUri(uri: Uri): void {
		this.logger.info(`GitProtocolHandler.handleUri(${uri.toString()})`);

		switch (uri.path) {
			case '/clone': this.clone(uri);
		}
	}

	private async clone(uri: Uri): Promise<void> {
		const data = querystring.parse(uri.query);
		const ref = data.ref;

		if (!data.url) {
			this.logger.warn('Failed to open URI:' + uri.toString());
			return;
		}

		if (Array.isArray(data.url) && data.url.length === 0) {
			this.logger.warn('Failed to open URI:' + uri.toString());
			return;
		}

		if (ref !== undefined && typeof ref !== 'string') {
			this.logger.warn('Failed to open URI due to multiple references:' + uri.toString());
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

			// Validate the reference
			if (typeof ref === 'string' && refRegEx.test(ref)) {
				throw new Error('Invalid reference.');
			}
		}
		catch (ex) {
			this.logger.warn('Invalid URI:' + uri.toString());
			return;
		}

		if (!(await commands.getCommands(true)).includes('git.clone')) {
			this.logger.error('Could not complete git clone operation as git installation was not found.');

			const errorMessage = localize('no git', 'Could not clone your repository as Git is not installed.');
			const downloadGit = localize('download git', 'Download Git');

			if (await window.showErrorMessage(errorMessage, { modal: true }, downloadGit) === downloadGit) {
				commands.executeCommand('vscode.open', Uri.parse('https://aka.ms/vscode-download-git'));
			}

			return;
		} else {
			const cloneTarget = cloneUri.toString(true);
			this.logger.info(`Executing git.clone for ${cloneTarget}`);
			commands.executeCommand('git.clone', cloneTarget, undefined, { ref: ref });
		}
	}

	dispose(): void {
		this.disposables = dispose(this.disposables);
	}
}
