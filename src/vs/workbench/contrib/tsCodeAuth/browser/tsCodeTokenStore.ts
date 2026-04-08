/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// test-workbench_change - new file

import { Disposable } from '../../../../base/common/lifecycle.js';
import { ISecretStorageService } from '../../../../platform/secrets/common/secrets.js';
import { ITsCodeTokenStore, StoredToken, TSCODE_SECRET_STORAGE_KEY } from '../common/tsCodeAuth.js';

export class TsCodeTokenStore extends Disposable implements ITsCodeTokenStore {
	declare readonly _serviceBrand: undefined;

	constructor(
		@ISecretStorageService private readonly secretStorageService: ISecretStorageService,
	) {
		super();
	}

	// test-workbench_change start
	async getToken(): Promise<StoredToken | undefined> {
		try {
			const raw = await this.secretStorageService.get(TSCODE_SECRET_STORAGE_KEY);
			if (!raw) {
				return undefined;
			}
			return JSON.parse(raw) as StoredToken;
		} catch {
			return undefined;
		}
	}
	// test-workbench_change end

	async saveToken(token: StoredToken): Promise<void> {
		await this.secretStorageService.set(TSCODE_SECRET_STORAGE_KEY, JSON.stringify(token));
	}

	async clearToken(): Promise<void> {
		await this.secretStorageService.delete(TSCODE_SECRET_STORAGE_KEY);
	}
}
