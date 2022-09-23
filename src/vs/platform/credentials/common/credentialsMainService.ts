/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ICredentialsChangeEvent, ICredentialsMainService, InMemoryCredentialsProvider } from 'vs/platform/credentials/common/credentials';
import { Emitter } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';
import { ILogService } from 'vs/platform/log/common/log';
import { isWindows } from 'vs/base/common/platform';
import { retry } from 'vs/base/common/async';

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
		this.logService.trace('Getting password from keytar:', service, account);
		let keytar: KeytarModule;
		try {
			keytar = await this.withKeytar();
		} catch (e) {
			// for get operations, we don't want to surface errors to the user
			return null;
		}

		const password = await retry(() => keytar.getPassword(service, account), 50, 3);
		if (!password) {
			this.logService.trace('Did not get a password from keytar for account:', account);
			return password;
		}

		let content: string | undefined;
		let hasNextChunk: boolean | undefined;
		try {
			const parsed: ChunkedPassword = JSON.parse(password);
			content = parsed.content;
			hasNextChunk = parsed.hasNextChunk;
		} catch {
			// Ignore this similar to how we ignore parse errors in the delete
			// because on non-windows this will not be a JSON string.
		}

		if (!content || !hasNextChunk) {
			this.logService.trace('Got password from keytar for account:', account);
			return password;
		}

		try {
			let index = 1;
			while (hasNextChunk) {
				const nextChunk = await retry(() => keytar.getPassword(service, `${account}-${index}`), 50, 3);
				const result: ChunkedPassword = JSON.parse(nextChunk!);
				content += result.content;
				hasNextChunk = result.hasNextChunk;
				index++;
			}

			this.logService.trace(`Got ${index}-chunked password from keytar for account:`, account);
			return content;
		} catch (e) {
			this.logService.error(e);
			return password;
		}
	}

	async setPassword(service: string, account: string, password: string): Promise<void> {
		this.logService.trace('Setting password using keytar:', service, account);
		let keytar: KeytarModule;
		try {
			keytar = await this.withKeytar();
		} catch (e) {
			this.surfaceKeytarLoadError?.(e);
			throw e;
		}

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
				await retry(() => keytar.setPassword(service, chunk ? `${account}-${chunk}` : account, JSON.stringify(content)), 50, 3);
				chunk++;
			}

			this.logService.trace(`Got${chunk ? ` ${chunk}-chunked` : ''} password from keytar for account:`, account);
		} else {
			await retry(() => keytar.setPassword(service, account, password), 50, 3);
			this.logService.trace('Got password from keytar for account:', account);
		}

		this._onDidChangePassword.fire({ service, account });
	}

	async deletePassword(service: string, account: string): Promise<boolean> {
		this.logService.trace('Deleting password using keytar:', service, account);
		let keytar: KeytarModule;
		try {
			keytar = await this.withKeytar();
		} catch (e) {
			this.surfaceKeytarLoadError?.(e);
			throw e;
		}

		const password = await keytar.getPassword(service, account);
		if (!password) {
			this.logService.trace('Did not get a password to delete from keytar for account:', account);
			return false;
		}

		let content: string | undefined;
		let hasNextChunk: boolean | undefined;
		try {
			const possibleChunk = JSON.parse(password);
			content = possibleChunk.content;
			hasNextChunk = possibleChunk.hasNextChunk;
		} catch {
			// When the password is saved the entire JSON payload is encrypted then stored, thus the result from getPassword might not be valid JSON
			// https://github.com/microsoft/vscode/blob/c22cb87311b5eb1a3bf5600d18733f7485355dc0/src/vs/workbench/api/browser/mainThreadSecretState.ts#L83
			// However in the chunked case we JSONify each chunk after encryption so for the chunked case we do expect valid JSON here
			// https://github.com/microsoft/vscode/blob/708cb0c507d656b760f9d08115b8ebaf8964fd73/src/vs/platform/credentials/common/credentialsMainService.ts#L128
			// Empty catch here just as in getPassword because we expect to handle both JSON cases and non JSON cases here it's not an error case to fail to parse
			// https://github.com/microsoft/vscode/blob/708cb0c507d656b760f9d08115b8ebaf8964fd73/src/vs/platform/credentials/common/credentialsMainService.ts#L76
		}

		let index = 0;
		if (content && hasNextChunk) {
			try {
				// need to delete additional chunks
				index++;
				while (hasNextChunk) {
					const accountWithIndex = `${account}-${index}`;
					const nextChunk = await keytar.getPassword(service, accountWithIndex);
					await keytar.deletePassword(service, accountWithIndex);

					const result: ChunkedPassword = JSON.parse(nextChunk!);
					hasNextChunk = result.hasNextChunk;
					index++;
				}
			} catch (e) {
				this.logService.error(e);
			}
		}

		// Delete the first account to determine deletion success
		if (await keytar.deletePassword(service, account)) {
			this._onDidChangePassword.fire({ service, account });
			this.logService.trace(`Deleted${index ? ` ${index}-chunked` : ''} password from keytar for account:`, account);
			return true;
		}

		this.logService.trace(`Keytar failed to delete${index ? ` ${index}-chunked` : ''} password for account:`, account);
		return false;
	}

	async findPassword(service: string): Promise<string | null> {
		let keytar: KeytarModule;
		try {
			keytar = await this.withKeytar();
		} catch (e) {
			// for get operations, we don't want to surface errors to the user
			return null;
		}

		return await keytar.findPassword(service);
	}

	async findCredentials(service: string): Promise<Array<{ account: string; password: string }>> {
		let keytar: KeytarModule;
		try {
			keytar = await this.withKeytar();
		} catch (e) {
			// for get operations, we don't want to surface errors to the user
			return [];
		}

		return await keytar.findCredentials(service);
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
