/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { window, InputBoxOptions, Uri, Disposable, workspace, QuickPickOptions, l10n, LogOutputChannel } from 'vscode';
import { IDisposable, EmptyDisposable, toDisposable, extractFilePathFromArgs } from './util';
import * as path from 'path';
import { IIPCHandler, IIPCServer } from './ipc/ipcServer';
import { CredentialsProvider, Credentials } from './api/git';
import { ITerminalEnvironmentProvider } from './terminal';

export class Askpass implements IIPCHandler, ITerminalEnvironmentProvider {

	private env: { [key: string]: string };
	private sshEnv: { [key: string]: string };
	private disposable: IDisposable = EmptyDisposable;
	private cache = new Map<string, Credentials>();
	private credentialsProviders = new Set<CredentialsProvider>();

	readonly featureDescription = 'git auth provider';

	constructor(private ipc: IIPCServer | undefined, private readonly logger: LogOutputChannel) {
		if (ipc) {
			this.disposable = ipc.registerHandler('askpass', this);
		}

		this.env = {
			// GIT_ASKPASS
			GIT_ASKPASS: path.join(__dirname, this.ipc ? 'askpass.sh' : 'askpass-empty.sh'),
			// VSCODE_GIT_ASKPASS
			VSCODE_GIT_ASKPASS_NODE: process.execPath,
			VSCODE_GIT_ASKPASS_EXTRA_ARGS: '',
			VSCODE_GIT_ASKPASS_MAIN: path.join(__dirname, 'askpass-main.js')
		};

		this.sshEnv = {
			// SSH_ASKPASS
			SSH_ASKPASS: path.join(__dirname, this.ipc ? 'ssh-askpass.sh' : 'ssh-askpass-empty.sh'),
			SSH_ASKPASS_REQUIRE: 'force'
		};
	}

	async handle(payload: { askpassType: 'https' | 'ssh'; argv: string[] }): Promise<string> {
		this.logger.trace(`[Askpass][handle] ${JSON.stringify(payload)}`);

		const config = workspace.getConfiguration('git', null);
		const enabled = config.get<boolean>('enabled');

		if (!enabled) {
			this.logger.trace(`[Askpass][handle] Git is disabled`);
			return '';
		}

		return payload.askpassType === 'https'
			? await this.handleAskpass(payload.argv)
			: await this.handleSSHAskpass(payload.argv);
	}

	async handleAskpass(argv: string[]): Promise<string> {
		// HTTPS (username | password)
		// Username for 'https://github.com':
		// Password for 'https://github.com':
		const request = argv[2];
		const host = argv[4].replace(/^["']+|["':]+$/g, '');

		this.logger.trace(`[Askpass][handleAskpass] request: ${request}, host: ${host}`);

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

	async handleSSHAskpass(argv: string[]): Promise<string> {
		// SSH (passphrase | authenticity)
		const request = argv[3];

		// passphrase
		if (/passphrase/i.test(request)) {
			// Commit signing - Enter passphrase:
			// Commit signing - Enter passphrase for '/c/Users/<username>/.ssh/id_ed25519':
			// Git operation  - Enter passphrase for key '/c/Users/<username>/.ssh/id_ed25519':
			let file: string | undefined = undefined;
			if (argv[5] && !/key/i.test(argv[5])) {
				file = extractFilePathFromArgs(argv, 5);
			} else if (argv[6]) {
				file = extractFilePathFromArgs(argv, 6);
			}

			this.logger.trace(`[Askpass][handleSSHAskpass] request: ${request}, file: ${file}`);

			const options: InputBoxOptions = {
				password: true,
				placeHolder: l10n.t('Passphrase'),
				prompt: file ? `SSH Key: ${file}` : undefined,
				ignoreFocusOut: true
			};

			return await window.showInputBox(options) || '';
		}

		// authenticity
		const host = argv[6].replace(/^["']+|["':]+$/g, '');
		const fingerprint = argv[15];

		this.logger.trace(`[Askpass][handleSSHAskpass] request: ${request}, host: ${host}, fingerprint: ${fingerprint}`);

		const options: QuickPickOptions = {
			canPickMany: false,
			ignoreFocusOut: true,
			placeHolder: l10n.t('Are you sure you want to continue connecting?'),
			title: l10n.t('"{0}" has fingerprint "{1}"', host ?? '', fingerprint ?? '')
		};
		const items = [l10n.t('yes'), l10n.t('no')];
		return await window.showQuickPick(items, options) ?? '';
	}

	getEnv(): { [key: string]: string } {
		const config = workspace.getConfiguration('git');
		return config.get<boolean>('useIntegratedAskPass') ? { ...this.env, ...this.sshEnv } : {};
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
