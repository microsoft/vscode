/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable } from '../../../../base/common/lifecycle.js';
import { CustomizationHarnessServiceBase, createVSCodeHarnessDescriptor, IHarnessDescriptor } from '../../../../workbench/contrib/chat/common/customizationHarnessService.js';
import { IPromptsService, PromptsStorage } from '../../../../workbench/contrib/chat/common/promptSyntax/service/promptsService.js';
import { BUILTIN_STORAGE } from '../common/builtinPromptsStorage.js';
import { SessionType } from '../../../../workbench/contrib/chat/common/chatSessionsService.js';
import { ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';

/**
 * The session type that supports local harness customization.
 * Hardcoded for now — ideally providers would declare harness support explicitly.
 */
const LOCAL_HARNESS_SESSION_TYPE = 'local';

/**
 * Sessions-window override of the customization harness service.
 *
 * The Local harness is registered when a provider offers a session type
 * matching {@link LOCAL_HARNESS_SESSION_TYPE}. When providers are added or
 * removed (or their session types change), the harness is dynamically
 * added or removed so that the Customizations editor reflects the
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
		@ISessionsManagementService private readonly sessionsManagementService: ISessionsManagementService,
	) {
		const localExtras = [PromptsStorage.extension, BUILTIN_STORAGE];
		const localHarness = createVSCodeHarnessDescriptor(localExtras);

		super(
			[],
			SessionType.Local,
			promptsService,
		);

		const sync = () => this._syncLocalHarness(localHarness, this._hasLocalSessionType());

		this.sessionsManagementService.onDidChangeSessionTypes(sync);

		// Initial sync
		sync();
	}

	private _hasLocalSessionType(): boolean {
		return this.sessionsManagementService.getAllSessionTypes().some(
			t => t.id === LOCAL_HARNESS_SESSION_TYPE
		);
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
