/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IObservable, observableValue } from '../../../../../base/common/observable.js';
import { localize } from '../../../../../nls.js';
import { IDefaultAccountService } from '../../../../../platform/defaultAccount/common/defaultAccount.js';
import { IDisposable } from '../../../../../base/common/lifecycle.js';
import { ISessionsWelcomeStep } from '../../common/sessionsWelcomeService.js';

export class GitHubSignInStep implements ISessionsWelcomeStep {

	readonly id = 'github.signIn';
	readonly title = localize('githubSignIn.title', "Sign In with GitHub");
	readonly description = localize('githubSignIn.description', "Sign in to your GitHub account to use Agent Sessions.");
	readonly actionLabel = localize('githubSignIn.action', "Sign In");
	readonly order = 20;

	readonly isSatisfied: IObservable<boolean>;
	readonly initialized: Promise<void>;

	/** Caller must dispose this to clean up the event listener. */
	readonly disposable: IDisposable;

	private readonly _isSatisfied = observableValue<boolean>(this, false);

	constructor(
		@IDefaultAccountService private readonly defaultAccountService: IDefaultAccountService,
	) {
		this.isSatisfied = this._isSatisfied;

		// Listen for account changes
		this.disposable = this.defaultAccountService.onDidChangeDefaultAccount(account => {
			this._isSatisfied.set(account !== null && account !== undefined, undefined);
		});

		// Check initial state and mark initialized when resolved
		this.initialized = this.defaultAccountService.getDefaultAccount().then(account => {
			this._isSatisfied.set(account !== null && account !== undefined, undefined);
		});
	}

	async action(): Promise<void> {
		await this.defaultAccountService.signIn();
	}
}
