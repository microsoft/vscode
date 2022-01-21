/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ICredentialsChangeEvent, ICredentialsMainService } from 'vs/platform/credentials/common/credentials';
import { Emitter } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';
import { ILogService } from 'vs/platform/log/common/log';
import { isWindows } from 'vs/base/common/platform';
import { INativeEnvironmentService } from 'vs/platform/environment/common/environment';
import { IProductService } from 'vs/platform/product/common/productService';

interface ChunkedPassword {
	content: string;
	hasNextChunk: boolean;
}

type KeytarModule = typeof import('keytar');

export class CredentialsMainService extends Disposable implements ICredentialsMainService {

	private static readonly MAX_PASSWORD_LENGTH = 2500;
	private static readonly PASSWORD_CHUNK_SIZE = CredentialsMainService.MAX_PASSWORD_LENGTH - 100;
	declare readonly _serviceBrand: undefined;

	private _onDidChangePassword: Emitter<ICredentialsChangeEvent> = this._register(new Emitter());
	readonly onDidChangePassword = this._onDidChangePassword.event;

	private _keytarCache: KeytarModule | undefined;

	// If the credentials service is running on the server, we add a suffix -server to differentiate from the location that the
	// client would store the credentials.
	public async getSecretStoragePrefix() { return `${this.productService.urlProtocol}${this.isRunningOnServer ? '-server' : ''}`; }

	constructor(
		private isRunningOnServer: boolean,
		@ILogService private readonly logService: ILogService,
		@INativeEnvironmentService private readonly environmentMainService: INativeEnvironmentService,
		@IProductService private readonly productService: IProductService,
	) {
		super();
	}

	async getPassword(service: string, account: string): Promise<string | null> {
		const keytar = await this.withKeytar();

		const password = await keytar.getPassword(service, account);
		if (password) {
			try {
				let { content, hasNextChunk }: ChunkedPassword = JSON.parse(password);
				if (!content || !hasNextChunk) {
					return password;
				}

				let index = 1;
				while (hasNextChunk) {
					const nextChunk = await keytar.getPassword(service, `${account}-${index}`);
					const result: ChunkedPassword = JSON.parse(nextChunk!);
					content += result.content;
					hasNextChunk = result.hasNextChunk;
					index++;
				}

				return content;
			} catch {
				return password;
			}
		}

		return password;
	}

	async setPassword(service: string, account: string, password: string): Promise<void> {
		const keytar = await this.withKeytar();
		const MAX_SET_ATTEMPTS = 3;

		// Sometimes Keytar has a problem talking to the keychain on the OS. To be more resilient, we retry a few times.
		const setPasswordWithRetry = async (service: string, account: string, password: string) => {
			let attempts = 0;
			let error: any;
			while (attempts < MAX_SET_ATTEMPTS) {
				try {
					await keytar.setPassword(service, account, password);
					return;
				} catch (e) {
					error = e;
					this.logService.warn('Error attempting to set a password: ', e);
					attempts++;
					await new Promise(resolve => setTimeout(resolve, 200));
				}
			}

			// throw last error
			throw error;
		};

		if (isWindows && password.length > CredentialsMainService.MAX_PASSWORD_LENGTH) {
			let index = 0;
			let chunk = 0;
			let hasNextChunk = true;
			while (hasNextChunk) {
				const passwordChunk = password.substring(index, index + CredentialsMainService.PASSWORD_CHUNK_SIZE);
				index += CredentialsMainService.PASSWORD_CHUNK_SIZE;
				hasNextChunk = password.length - index > 0;

				const content: ChunkedPassword = {
					content: passwordChunk,
					hasNextChunk: hasNextChunk
				};

				await setPasswordWithRetry(service, chunk ? `${account}-${chunk}` : account, JSON.stringify(content));
				chunk++;
			}

		} else {
			await setPasswordWithRetry(service, account, password);
		}

		this._onDidChangePassword.fire({ service, account });
	}

	async deletePassword(service: string, account: string): Promise<boolean> {
		const keytar = await this.withKeytar();

		const didDelete = await keytar.deletePassword(service, account);
		if (didDelete) {
			this._onDidChangePassword.fire({ service, account });
		}

		return didDelete;
	}

	async findPassword(service: string): Promise<string | null> {
		const keytar = await this.withKeytar();

		return keytar.findPassword(service);
	}

	async findCredentials(service: string): Promise<Array<{ account: string, password: string }>> {
		const keytar = await this.withKeytar();

		return keytar.findCredentials(service);
	}

	private async withKeytar(): Promise<KeytarModule> {
		if (this._keytarCache) {
			return this._keytarCache;
		}

		if (this.environmentMainService.disableKeytar) {
			this.logService.info('Keytar is disabled. Using in-memory credential store instead.');
			this._keytarCache = new InMemoryKeytar();
			return this._keytarCache;
		}

		try {
			this._keytarCache = await import('keytar');
			// Try using keytar to see if it throws or not.
			await this._keytarCache.findCredentials('test-keytar-loads');
		} catch (e) {
			this.logService.warn(`Switching to using in-memory credential store instead because Keytar failed to load: ${e.message}`);
			this._keytarCache = new InMemoryKeytar();
		}
		return this._keytarCache;
	}

	// This class doesn't implement the clear() function because we don't know
	// what services have stored credentials. For reference, a "service" is an extension.
	// TODO: should we clear credentials for the built-in auth extensions?
	public clear(): Promise<void> {
		return Promise.resolve();
	}
}

interface ISecretVault {
	[service: string]: { [account: string]: string } | undefined;
}

// This class is used when we are unable to load Keytar properly it keeps credentials in-memory for
// the duration of the process.
class InMemoryKeytar implements KeytarModule {
	private readonly secretVault: ISecretVault = {};

	async getPassword(service: string, account: string): Promise<string | null> {
		return this.secretVault[service]?.[account] ?? null;
	}

	async setPassword(service: string, account: string, password: string): Promise<void> {
		this.secretVault[service] = this.secretVault[service] ?? {};
		this.secretVault[service]![account] = password;
	}

	async deletePassword(service: string, account: string): Promise<boolean> {
		if (!this.secretVault[service]?.[account]) {
			return false;
		}
		delete this.secretVault[service]![account];
		if (Object.keys(this.secretVault[service]!).length === 0) {
			delete this.secretVault[service];
		}
		return true;
	}

	async findPassword(service: string): Promise<string | null> {
		return JSON.stringify(this.secretVault[service]) ?? null;
	}

	async findCredentials(service: string): Promise<Array<{ account: string, password: string }>> {
		const credentials: { account: string, password: string }[] = [];
		for (const account of Object.keys(this.secretVault[service] || {})) {
			credentials.push({ account, password: this.secretVault[service]![account] });
		}
		return credentials;
	}
}
