/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ICredentialsChangeEvent, ICredentialsService } from 'vs/platform/credentials/common/credentials';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { Emitter } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';
import { ILogService } from 'vs/platform/log/common/log';
import { isWindows } from 'vs/base/common/platform';
import { INativeEnvironmentService } from 'vs/platform/environment/common/environment';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';

export const ICredentialsMainService = createDecorator<ICredentialsMainService>('credentialsMainService');

export interface ICredentialsMainService extends ICredentialsService { }

interface ChunkedPassword {
	content: string;
	hasNextChunk: boolean;
}

export class CredentialsMainService extends Disposable implements ICredentialsMainService {

	private static readonly MAX_PASSWORD_LENGTH = 2500;
	private static readonly PASSWORD_CHUNK_SIZE = CredentialsMainService.MAX_PASSWORD_LENGTH - 100;
	declare readonly _serviceBrand: undefined;

	private _onDidChangePassword: Emitter<ICredentialsChangeEvent> = this._register(new Emitter());
	readonly onDidChangePassword = this._onDidChangePassword.event;

	constructor(
		@ILogService private readonly logService: ILogService,
		@INativeEnvironmentService private readonly environmentMainService: INativeEnvironmentService
	) {
		super();
	}

	//#region Credentials

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

	private async withKeytar(): Promise<typeof import('keytar')> {
		if (this.environmentMainService.disableKeytar) {
			throw new Error('keytar has been disabled via --disable-keytar option');
		}

		return await import('keytar');
	}

	//#endregion

	// This class doesn't implement the clear() function because we don't know
	// what services have stored credentials. For reference, a "service" is an extension.
	// TODO: should we clear credentials for the built-in auth extensions?
}

registerSingleton(ICredentialsService, CredentialsMainService, true);
