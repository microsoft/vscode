/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../workbench/common/contributions.js';
import { IWorkbenchLayoutService } from '../../../../workbench/services/layout/browser/layoutService.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ChatConfiguration } from '../../../../workbench/contrib/chat/common/constants.js';
import { SessionsPolicyBlockedOverlay } from './sessionsPolicyBlocked.js';

export class SessionsPolicyBlockedContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.sessionsPolicyBlocked';

	private readonly overlayRef = this._register(new MutableDisposable());

	constructor(
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IWorkbenchLayoutService private readonly layoutService: IWorkbenchLayoutService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) {
		super();

		this.update();

		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(ChatConfiguration.AgentEnabled)) {
				this.update();
			}
		}));
	}

	private update(): void {
		const enabled = this.configurationService.getValue<boolean>(ChatConfiguration.AgentEnabled);

		if (enabled === false) {
			if (!this.overlayRef.value) {
				this.overlayRef.value = this.instantiationService.createInstance(
					SessionsPolicyBlockedOverlay,
					this.layoutService.mainContainer,
				);
			}
		} else {
			this.overlayRef.clear();
		}
	}
}

registerWorkbenchContribution2(SessionsPolicyBlockedContribution.ID, SessionsPolicyBlockedContribution, WorkbenchPhase.BlockRestore);
