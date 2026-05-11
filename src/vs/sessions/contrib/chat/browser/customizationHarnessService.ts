/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CustomizationHarnessServiceBase, createVSCodeHarnessDescriptor } from '../../../../workbench/contrib/chat/common/customizationHarnessService.js';
import { IPromptsService, PromptsStorage } from '../../../../workbench/contrib/chat/common/promptSyntax/service/promptsService.js';
import { BUILTIN_STORAGE } from '../common/builtinPromptsStorage.js';
import { SessionType } from '../../../../workbench/contrib/chat/common/chatSessionsService.js';

/**
 * Sessions-window override of the customization harness service.
 *
 * The Local harness is registered statically so that local customizations
 * (instructions, skills, agents, etc.) are available in the Agents window.
 * The Copilot CLI extension provides its harness (with `itemProvider`) via
 * `registerChatSessionCustomizationProvider()`, and AHP remote servers
 * register directly via `registerExternalHarness()`.
 */
export class SessionsCustomizationHarnessService extends CustomizationHarnessServiceBase {
	constructor(
		@IPromptsService promptsService: IPromptsService
	) {
		const localExtras = [PromptsStorage.extension, BUILTIN_STORAGE];
		super(
			[createVSCodeHarnessDescriptor(localExtras)],
			SessionType.Local,
			promptsService,
		);
	}
}
