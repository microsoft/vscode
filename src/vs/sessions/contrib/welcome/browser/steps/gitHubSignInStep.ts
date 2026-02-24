/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IObservable, observableValue } from '../../../../../base/common/observable.js';
import { localize } from '../../../../../nls.js';
import { IDefaultAccountService } from '../../../../../platform/defaultAccount/common/defaultAccount.js';
import { IDefaultAccount } from '../../../../../base/common/defaultAccount.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { ISessionsWelcomeStep } from '../../common/sessionsWelcomeService.js';

export class GitHubSignInStep extends Disposable implements ISessionsWelcomeStep {

	readonly id = 'github.signIn';
	readonly title = localize('githubSignIn.title', "Sign In with GitHub");
	readonly description = localize('githubSignIn.description', "Sign in to your GitHub account to use Agent Sessions.");
	readonly actionLabel = localize('githubSignIn.action', "Sign In");
	readonly order = 20;

	readonly isSatisfied: IObservable<boolean>;
	readonly initialized: Promise<void>;

	private readonly _isSatisfied = observableValue<boolean>(this, false);

	constructor(
		@IDefaultAccountService private readonly defaultAccountService: IDefaultAccountService,
	) {
		super();

		this.isSatisfied = this._isSatisfied;

		// Listen for account changes
		this._register(this.defaultAccountService.onDidChangeDefaultAccount(account => {
			this._isSatisfied.set(this.isSignedInWithValidToken(account), undefined);
		}));

		// Check initial state and mark initialized when resolved
		this.initialized = this.defaultAccountService.getDefaultAccount().then(account => {
			this._isSatisfied.set(this.isSignedInWithValidToken(account), undefined);
		});
	}

	/**
	 * Returns `true` when the user is signed in and their token has not
	 * expired. A `null` value for {@link IDefaultAccount.entitlementsData}
	 * indicates the OAuth token is expired or revoked (HTTP 401).
	 */
	private isSignedInWithValidToken(account: IDefaultAccount | null | undefined): boolean {
		return account !== null && account !== undefined && account.entitlementsData !== null;
	}

	async action(): Promise<void> {
		await this.defaultAccountService.signIn();
	}
}
