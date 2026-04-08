/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// test-workbench_change - new file

import { IWorkbenchContribution, WorkbenchPhase, registerWorkbenchContribution2 } from '../../../common/contributions.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IURLService } from '../../../../platform/url/common/url.js';
import { IAuthenticationService } from '../../../services/authentication/common/authentication.js';
import { ITsCodeAuthService, ITsCodeTokenStore } from '../common/tsCodeAuth.js';
import { TsCodeAuthService } from './tsCodeAuthService.js';
import { TsCodeTokenStore } from './tsCodeTokenStore.js';
import { TsCodeCallbackHandler } from './tsCodeCallbackHandler.js';
import { TsCodeOAuthProvider } from './tsCodeOAuthProvider.js';
import { TsCodeWelcomePage } from './tsCodeWelcomePage.js';

// --- Service registrations ---

registerSingleton(ITsCodeTokenStore, TsCodeTokenStore, InstantiationType.Delayed);
registerSingleton(ITsCodeAuthService, TsCodeAuthService, InstantiationType.Delayed);

// --- Workbench Contribution ---

export class TsCodeAuthContribution implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.tsCodeAuth';

	constructor(
		@ITsCodeAuthService private readonly authService: ITsCodeAuthService,
		@IURLService urlService: IURLService,
		@IAuthenticationService authenticationService: IAuthenticationService,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		// Register URL callback handler for tscode://auth/callback
		const callbackHandler = instantiationService.createInstance(TsCodeCallbackHandler);
		urlService.registerHandler(callbackHandler);

		// Register OAuth authentication provider
		const oauthProvider = instantiationService.createInstance(TsCodeOAuthProvider);
		authenticationService.registerAuthenticationProvider(oauthProvider.id, oauthProvider);

		// Create welcome page (subscribes to auth events internally)
		instantiationService.createInstance(TsCodeWelcomePage);

		// Kick off auth check
		this.authService.checkAndHandleAuth();
	}
}

registerWorkbenchContribution2(TsCodeAuthContribution.ID, TsCodeAuthContribution, WorkbenchPhase.AfterRestored); // test-workbench_change
