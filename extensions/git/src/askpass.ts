/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vscode-nls';
import { window, InputBoxOptions, Uri, Disposable, workspace, QuickPickOptions } from 'vscode';
import { IDisposable, EmptyDisposable, toDisposable } from './util';
import * as path from 'path';
import { IIPCHandler, IIPCServer } from './ipc/ipcServer';
import { CredentialsProvider, Credentials } from './api/git';
import { ITerminalEnvironmentProvider } from './terminal';

const localize = nls.loadMessageBundle();

export class Askpass implements IIPCHandler, ITerminalEnvironmentProvider {

	private env: { [key: string]: string };
	private disposable: IDisposable = EmptyDisposable;
	private cache = new Map<string, Credentials>();
	private credentialsProviders = new Set<CredentialsProvider>();

	constructor(private ipc?: IIPCServer) {
		if (ipc) {
			this.disposable = ipc.registerHandler('askpass', this);
		}

		this.env = {
			// GIT_ASKPASS
			GIT_ASKPASS: path.join(__dirname, this.ipc ? 'askpass.sh' : 'askpass-empty.sh'),
			// SSH_ASKPASS
			SSH_ASKPASS: path.join(__dirname, this.ipc ? 'ssh-askpass.sh' : 'ssh-askpass-empty.sh'),
			SSH_ASKPASS_REQUIRE: 'force',
			// VSCODE_GIT_ASKPASS
			VSCODE_GIT_ASKPASS_NODE: process.execPath,
			VSCODE_GIT_ASKPASS_EXTRA_ARGS: (process.versions['electron'] && process.versions['microsoft-build']) ? '--ms-enable-electron-run-as-node' : '',
			VSCODE_GIT_ASKPASS_MAIN: path.join(__dirname, 'askpass-main.js'),
		};
	}

	async handle(payload:
		{ askpassType: 'https'; request: string; host: string } |
		{ askpassType: 'ssh'; request: string; host?: string; file?: string; fingerprint?: string }
	): Promise<string> {
		const config = workspace.getConfiguration('git', null);
		const enabled = config.get<boolean>('enabled');

		if (!enabled) {
			return '';
		}

		// https
		if (payload.askpassType === 'https') {
			return await this.handleAskpass(payload.request, payload.host);
		}

		// ssh
		return await this.handleSSHAskpass(payload.request, payload.host, payload.file, payload.fingerprint);
	}

	async handleAskpass(request: string, host: string): Promise<string> {
		const uri = Uri.parse(host);
		const authority = uri.authority.replace(/^.*@/, '');
		const password = /password/i.test(request);
		const cached = this.cache.get(authority);

		if (cached && password) {
			this.cache.delete(authority);
			return cached.password;
		}

		if (!password) {
			for (const credentialsProvider of this.credentialsProviders) {
				try {
					const credentials = await credentialsProvider.getCredentials(uri);

					if (credentials) {
						this.cache.set(authority, credentials);
						setTimeout(() => this.cache.delete(authority), 60_000);
						return credentials.username;
					}
				} catch { }
			}
		}

		const options: InputBoxOptions = {
			password,
			placeHolder: request,
			prompt: `Git: ${host}`,
			ignoreFocusOut: true
		};

		return await window.showInputBox(options) || '';
	}

	async handleSSHAskpass(request: string, host?: string, file?: string, fingerprint?: string): Promise<string> {
		// passphrase
		if (/passphrase/i.test(request)) {
			const options: InputBoxOptions = {
				password: true,
				placeHolder: localize('ssh passphrase', "Passphrase"),
				prompt: `SSH Key: ${file}`,
				ignoreFocusOut: true
			};

			return await window.showInputBox(options) || '';
		}

		// authenticity
		const options: QuickPickOptions = {
			canPickMany: false,
			ignoreFocusOut: true,
			placeHolder: localize('ssh authenticity prompt', "Are you sure you want to continue connecting?"),
			title: localize('ssh authenticity title', "\"{0}\" has fingerprint \"{1}\"", host, fingerprint)
		};
		const items = [
			localize('ssh authenticity prompt yes', "yes"),
			localize('ssh authenticity prompt no', "no")
		];
		return await window.showQuickPick(items, options) ?? '';
	}

	getEnv(): { [key: string]: string } {
		const config = workspace.getConfiguration('git');
		return config.get<boolean>('useIntegratedAskPass') ? this.env : {};
	}

	getTerminalEnv(): { [key: string]: string } {
		const config = workspace.getConfiguration('git');
		return config.get<boolean>('useIntegratedAskPass') && config.get<boolean>('terminalAuthentication') ? this.env : {};
	}

	registerCredentialsProvider(provider: CredentialsProvider): Disposable {
		this.credentialsProviders.add(provider);
		return toDisposable(() => this.credentialsProviders.delete(provider));
	}

	dispose(): void {
		this.disposable.dispose();
	}
}
