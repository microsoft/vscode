/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'vscode';
import { IAuthenticationService } from '../../../../../../platform/authentication/common/authentication';
import { IDisposable } from '../../../../../../util/vs/base/common/lifecycle';
import { IInstantiationService } from '../../../../../../util/vs/platform/instantiation/common/instantiation';
import { CopilotToken } from '../../../lib/src/auth/copilotTokenManager';
import { onCopilotToken } from '../../../lib/src/auth/copilotTokenNotifier';
import { ICompletionsLogTargetService } from '../../../lib/src/logger';
import { codeReferenceLogger } from '../../../lib/src/snippy/logger';
import { ICompletionsRuntimeModeService } from '../../../lib/src/util/runtimeMode';
import { CodeRefEngagementTracker } from './codeReferenceEngagementTracker';

export class CodeReference implements IDisposable {
	subscriptions: Disposable | undefined;
	event?: Disposable;
	enabled: boolean = false;

	constructor(
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@ICompletionsRuntimeModeService readonly _runtimeMode: ICompletionsRuntimeModeService,
		@ICompletionsLogTargetService private readonly _logTarget: ICompletionsLogTargetService,
		@IAuthenticationService private readonly _authenticationService: IAuthenticationService,
	) { }

	dispose() {
		this.subscriptions?.dispose();
		this.event?.dispose();
	}

	register() {
		if (!this._runtimeMode.isRunningInTest()) {
			this.event = onCopilotToken(this._authenticationService, (t) => this.onCopilotToken(t));
		}
		return this;
	}

	addDisposable(disposable: Disposable) {
		if (!this.subscriptions) {
			this.subscriptions = Disposable.from(disposable);
		} else {
			this.subscriptions = Disposable.from(this.subscriptions, disposable);
		}
	}

	onCopilotToken = (token: Omit<CopilotToken, 'token'>) => {
		this.enabled = token.codeQuoteEnabled || false;
		if (!token.codeQuoteEnabled) {
			this.subscriptions?.dispose();
			this.subscriptions = undefined;
			codeReferenceLogger.debug(this._logTarget, 'Public code references are disabled.');
			return;
		}

		codeReferenceLogger.info(this._logTarget, 'Public code references are enabled.');
		this.addDisposable(this._instantiationService.createInstance(CodeRefEngagementTracker));
	};
}
