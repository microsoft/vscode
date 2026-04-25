/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../../base/common/uri.js';
import { InstantiationType, registerSingleton } from '../../../../../platform/instantiation/common/extensions.js';
import { StorageScope } from '../../../../../platform/storage/common/storage.js';
import {
	CustomizationHarnessServiceBase,
	ICustomizationEnablementHandler,
	ICustomizationHarnessService,
	createVSCodeHarnessDescriptor,
} from '../../common/customizationHarnessService.js';
import { PromptsType } from '../../common/promptSyntax/promptTypes.js';
import { IPromptsService, PromptsStorage } from '../../common/promptSyntax/service/promptsService.js';
import { BUILTIN_STORAGE } from '../../common/aiCustomizationWorkspaceService.js';
import { SessionType } from '../../common/chatSessionsService.js';

/**
 * Enablement provider backed by promptsService (StorageService).
 * Used by the VS Code (Local) harness to manage disabled customizations.
 */
function createPromptsServiceEnablementHandler(promptsService: IPromptsService): ICustomizationEnablementHandler {
	return {
		handleCustomizationEnablement(uri: URI, type: PromptsType, enabled: boolean, scope: 'global' | 'workspace'): void {
			const storageScope = scope === 'workspace' ? StorageScope.WORKSPACE : StorageScope.PROFILE;
			const disabled = promptsService.getDisabledPromptFilesForScope(type, storageScope);
			if (enabled) {
				disabled.delete(uri);
			} else {
				disabled.add(uri);
			}
			promptsService.setDisabledPromptFiles(type, disabled, storageScope);

			// When enabling, also remove from the other scope to fully re-enable
			if (enabled) {
				const otherScope = scope === 'workspace' ? StorageScope.PROFILE : StorageScope.WORKSPACE;
				const otherDisabled = promptsService.getDisabledPromptFilesForScope(type, otherScope);
				if (otherDisabled.delete(uri)) {
					promptsService.setDisabledPromptFiles(type, otherDisabled, otherScope);
				}
			}
		},
	};
}

/**
 * Core implementation of the customization harness service.
 *
 * Only the Local harness is registered statically. All other harnesses
 * (e.g. Copilot CLI) are contributed by extensions via the provider API.
 */
class CustomizationHarnessService extends CustomizationHarnessServiceBase {
	constructor(
		@IPromptsService promptsService: IPromptsService,
	) {
		const localExtras = [PromptsStorage.extension, BUILTIN_STORAGE];
		const enablementHandler = createPromptsServiceEnablementHandler(promptsService);
		super(
			[createVSCodeHarnessDescriptor(localExtras, enablementHandler)],
			SessionType.Local,
			promptsService,
		);
	}
}

registerSingleton(ICustomizationHarnessService, CustomizationHarnessService, InstantiationType.Delayed);

