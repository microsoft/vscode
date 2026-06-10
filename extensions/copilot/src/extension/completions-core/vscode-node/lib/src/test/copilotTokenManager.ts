/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CopilotToken, createTestExtendedTokenInfo, type ExtendedTokenInfo } from '../../../../../../platform/authentication/common/copilotToken';
import { ICompletionsCopilotTokenManager } from '../auth/copilotTokenManager';

// Buffer to allow refresh to happen successfully
export class FakeCopilotTokenManager implements ICompletionsCopilotTokenManager {
	declare _serviceBrand: undefined;
	private _token: CopilotToken;

	constructor() {
		this._token = FakeCopilotTokenManager.createTestCopilotToken({ token: 'tid=test;rt=1' });
	}

	get token(): CopilotToken | undefined {
		return this._token;
	}

	primeToken(): Promise<boolean> {
		return Promise.resolve(true);
	}

	async getToken(): Promise<CopilotToken> {
		return this._token;
	}

	resetToken(httpError?: number): void {
	}

	getLastToken(): Omit<CopilotToken, 'token'> | undefined {
		return this._token;
	}

	private static readonly REFRESH_BUFFER_SECONDS = 60;
	private static createTestCopilotToken(overrides?: Partial<Omit<ExtendedTokenInfo, 'expires_at'>>): CopilotToken {
		const expires_at = Date.now() + ((overrides?.refresh_in ?? 0) + FakeCopilotTokenManager.REFRESH_BUFFER_SECONDS) * 1000;
		return new CopilotToken(createTestExtendedTokenInfo({ expires_at, ...overrides }));
	}
}
