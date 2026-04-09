/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// test-workbench_change - new file

import { IWorkbenchContribution, WorkbenchPhase, registerWorkbenchContribution2 } from '../../../common/contributions.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IAuthenticationService } from '../../../services/authentication/common/authentication.js';
import { ITsCodeAuthService, ITsCodeTokenStore } from '../common/tsCodeAuth.js';
import { TsCodeAuthService } from './tsCodeAuthService.js';
import { TsCodeTokenStore } from './tsCodeTokenStore.js';
import { TsCodeOAuthProvider } from './tsCodeOAuthProvider.js';
import { TsCodeWelcomePage } from './tsCodeWelcomePage.js';
import { IEditorService } from '../../../services/editor/common/editorService.js'; // test-workbench_change
import { TscodeWelcomeInput } from '../../welcomeGettingStarted/browser/tscodeWelcomeInput.js'; // test-workbench_change
import { IStorageService, StorageScope } from '../../../../platform/storage/common/storage.js'; // test-workbench_change

// --- Service registrations ---

registerSingleton(ITsCodeTokenStore, TsCodeTokenStore, InstantiationType.Delayed);
registerSingleton(ITsCodeAuthService, TsCodeAuthService, InstantiationType.Delayed);

// --- Workbench Contribution ---

export class TsCodeAuthContribution implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.tsCodeAuth';

	constructor(
		@ITsCodeAuthService private readonly authService: ITsCodeAuthService,
		@IAuthenticationService authenticationService: IAuthenticationService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IEditorService editorService: IEditorService, // test-workbench_change
		@IStorageService storageService: IStorageService, // test-workbench_change
	) {
		// Register OAuth authentication provider
		const oauthProvider = instantiationService.createInstance(TsCodeOAuthProvider);
		authenticationService.registerAuthenticationProvider(oauthProvider.id, oauthProvider);

		// Create welcome page (subscribes to auth events internally)
		instantiationService.createInstance(TsCodeWelcomePage);

		// test-workbench_change start - Open TscodeWelcomePage animation after login
		this.authService.onDidLogin(() => {
			// Only show animation if it hasn't been shown before
			const mementoRaw = storageService.get('tscodeWelcome', StorageScope.APPLICATION);
			const memento = mementoRaw ? JSON.parse(mementoRaw) : {};
			if (!memento.hasShownAnimation) {
				editorService.openEditor({
					resource: TscodeWelcomeInput.RESOURCE,
					options: {
						override: TscodeWelcomeInput.ID,
						pinned: false,
					}
				});
			}
		});
		// test-workbench_change end

		// Kick off auth check
		this.authService.checkAndHandleAuth();
	}
}

registerWorkbenchContribution2(TsCodeAuthContribution.ID, TsCodeAuthContribution, WorkbenchPhase.BlockRestore); // test-workbench_change
