/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable } from '../../../../base/common/lifecycle.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { CustomizationHarnessServiceBase, createVSCodeHarnessDescriptor, IHarnessDescriptor } from '../../../../workbench/contrib/chat/common/customizationHarnessService.js';
import { IPromptsService, PromptsStorage } from '../../../../workbench/contrib/chat/common/promptSyntax/service/promptsService.js';
import { BUILTIN_STORAGE } from '../common/builtinPromptsStorage.js';
import { SessionType } from '../../../../workbench/contrib/chat/common/chatSessionsService.js';
// eslint-disable-next-line local/code-import-patterns
import { LOCAL_SESSION_ENABLED_SETTING } from '../../providers/copilotChatSessions/browser/copilotChatSessionsProvider.js';

/**
 * Sessions-window override of the customization harness service.
 *
 * The Local harness is registered when the `sessions.chat.localAgent.enabled`
 * setting is true (the default). When the setting is toggled, the harness is
 * dynamically added or removed so that the Customizations editor reflects the
 * current state.
 *
 * The Copilot CLI extension provides its harness (with `itemProvider`) via
 * `registerChatSessionCustomizationProvider()`, and AHP remote servers
 * register directly via `registerExternalHarness()`.
 */
export class SessionsCustomizationHarnessService extends CustomizationHarnessServiceBase {

	private _localHarnessRegistration: IDisposable | undefined;

	constructor(
		@IPromptsService promptsService: IPromptsService,
		@IConfigurationService configurationService: IConfigurationService,
	) {
		const localExtras = [PromptsStorage.extension, BUILTIN_STORAGE];
		const localHarness = createVSCodeHarnessDescriptor(localExtras);

		super(
			[],
			SessionType.Local,
			promptsService,
		);

		// Register the local harness dynamically so it can be toggled
		// when the `sessions.chat.localAgent.enabled` setting changes.
		if (configurationService.getValue<boolean>(LOCAL_SESSION_ENABLED_SETTING) !== false) {
			this._localHarnessRegistration = this.registerExternalHarness(localHarness);
		}

		configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(LOCAL_SESSION_ENABLED_SETTING)) {
				this._syncLocalHarness(localHarness, configurationService.getValue<boolean>(LOCAL_SESSION_ENABLED_SETTING) !== false);
			}
		});
	}

	private _syncLocalHarness(descriptor: IHarnessDescriptor, enabled: boolean): void {
		if (enabled && !this._localHarnessRegistration) {
			this._localHarnessRegistration = this.registerExternalHarness(descriptor);
		} else if (!enabled && this._localHarnessRegistration) {
			this._localHarnessRegistration.dispose();
			this._localHarnessRegistration = undefined;
		}
	}
}
