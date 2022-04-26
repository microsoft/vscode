/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ICredentialsChangeEvent, ICredentialsMainService, InMemoryCredentialsProvider } from 'vs/platform/credentials/common/credentials';
import { Emitter } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';
import { ILogService } from 'vs/platform/log/common/log';
import { isWindows } from 'vs/base/common/platform';

interface ChunkedPassword {
	content: string;
	hasNextChunk: boolean;
}

export type KeytarModule = typeof import('keytar');

export abstract class BaseCredentialsMainService extends Disposable implements ICredentialsMainService {

	private static readonly MAX_PASSWORD_LENGTH = 2500;
	private static readonly PASSWORD_CHUNK_SIZE = BaseCredentialsMainService.MAX_PASSWORD_LENGTH - 100;
	declare readonly _serviceBrand: undefined;

	private _onDidChangePassword: Emitter<ICredentialsChangeEvent> = this._register(new Emitter());
	readonly onDidChangePassword = this._onDidChangePassword.event;

	protected _keytarCache: KeytarModule | undefined;

	constructor(
		@ILogService protected readonly logService: ILogService,
	) {
		super();
	}

	//#region abstract

	public abstract getSecretStoragePrefix(): Promise<string>;
	protected abstract withKeytar(): Promise<KeytarModule>;
	/**
	 * An optional method that subclasses can implement to assist in surfacing
	 * Keytar load errors to the user in a friendly way.
	 */
	protected abstract surfaceKeytarLoadError?: (err: any) => void;

	//#endregion

	async getPassword(service: string, account: string): Promise<string | null> {
		let keytar: KeytarModule;
		try {
			keytar = await this.withKeytar();
		} catch (e) {
			// for get operations, we don't want to surface errors to the user
			return null;
		}

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
		let keytar: KeytarModule;
		try {
			keytar = await this.withKeytar();
		} catch (e) {
			this.surfaceKeytarLoadError?.(e);
			throw e;
		}

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

		if (isWindows && password.length > BaseCredentialsMainService.MAX_PASSWORD_LENGTH) {
			let index = 0;
			let chunk = 0;
			let hasNextChunk = true;
			while (hasNextChunk) {
				const passwordChunk = password.substring(index, index + BaseCredentialsMainService.PASSWORD_CHUNK_SIZE);
				index += BaseCredentialsMainService.PASSWORD_CHUNK_SIZE;
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
		let keytar: KeytarModule;
		try {
			keytar = await this.withKeytar();
		} catch (e) {
			this.surfaceKeytarLoadError?.(e);
			throw e;
		}

		const password = await keytar.getPassword(service, account);
		if (!password) {
			return false;
		}
		const didDelete = await keytar.deletePassword(service, account);
		let { content, hasNextChunk }: ChunkedPassword = JSON.parse(password);
		if (content && hasNextChunk) {
			// need to delete additional chunks
			let index = 1;
			while (hasNextChunk) {
				const accountWithIndex = `${account}-${index}`;
				const nextChunk = await keytar.getPassword(service, accountWithIndex);
				await keytar.deletePassword(service, accountWithIndex);

				const result: ChunkedPassword = JSON.parse(nextChunk!);
				hasNextChunk = result.hasNextChunk;
				index++;
			}
		}

		if (didDelete) {
			this._onDidChangePassword.fire({ service, account });
		}

		return didDelete;
	}

	async findPassword(service: string): Promise<string | null> {
		let keytar: KeytarModule;
		try {
			keytar = await this.withKeytar();
		} catch (e) {
			// for get operations, we don't want to surface errors to the user
			return null;
		}

		return keytar.findPassword(service);
	}

	async findCredentials(service: string): Promise<Array<{ account: string; password: string }>> {
		let keytar: KeytarModule;
		try {
			keytar = await this.withKeytar();
		} catch (e) {
			// for get operations, we don't want to surface errors to the user
			return [];
		}

		return keytar.findCredentials(service);
	}

	public clear(): Promise<void> {
		if (this._keytarCache instanceof InMemoryCredentialsProvider) {
			return this._keytarCache.clear();
		}

		// We don't know how to properly clear Keytar because we don't know
		// what services have stored credentials. For reference, a "service" is an extension.
		// TODO: should we clear credentials for the built-in auth extensions?
		return Promise.resolve();
	}
}
