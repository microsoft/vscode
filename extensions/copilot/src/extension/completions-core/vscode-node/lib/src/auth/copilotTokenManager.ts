/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IAuthenticationService } from '../../../../../../platform/authentication/common/authentication';
import { CopilotToken } from '../../../../../../platform/authentication/common/copilotToken';
import { createServiceIdentifier } from '../../../../../../util/common/services';
import { ThrottledDelayer } from '../../../../../../util/vs/base/common/async';
import { Disposable } from '../../../../../../util/vs/base/common/lifecycle';
export { CopilotToken } from '../../../../../../platform/authentication/common/copilotToken';

export const ICompletionsCopilotTokenManager = createServiceIdentifier<ICompletionsCopilotTokenManager>('ICompletionsCopilotTokenManager');
export interface ICompletionsCopilotTokenManager {
	readonly _serviceBrand: undefined;
	get token(): CopilotToken | undefined;
	primeToken(): Promise<boolean>;
	getToken(): Promise<CopilotToken>;
	resetToken(httpError?: number): void;
	getLastToken(): Omit<CopilotToken, 'token'> | undefined;
}

export class CopilotTokenManagerImpl extends Disposable implements ICompletionsCopilotTokenManager {
	declare _serviceBrand: undefined;
	private tokenRefetcher = new ThrottledDelayer(5_000);
	private _token: CopilotToken | undefined;
	get token() {
		void this.tokenRefetcher.trigger(() => this.updateCachedToken());
		return this._token;
	}

	constructor(
		protected primed = false,
		@IAuthenticationService private readonly authenticationService: IAuthenticationService
	) {
		super();

		this.updateCachedToken();
		this._register(this.authenticationService.onDidAuthenticationChange(() => this.updateCachedToken()));
	}

	/**
	 * Ensure we have a token and that the `StatusReporter` is up to date.
	 */
	primeToken(): Promise<boolean> {
		try {
			return this.getToken().then(
				() => true,
				() => false
			);
		} catch (e) {
			return Promise.resolve(false);
		}
	}

	async getToken(): Promise<CopilotToken> {
		return this.updateCachedToken();
	}

	private async updateCachedToken(): Promise<CopilotToken> {
		this._token = await this.authenticationService.getCopilotToken();
		return this._token;
	}

	resetToken(httpError?: number): void {
		this.authenticationService.resetCopilotToken();
	}

	getLastToken(): Omit<CopilotToken, 'token'> | undefined {
		return this.authenticationService.copilotToken;
	}
}
