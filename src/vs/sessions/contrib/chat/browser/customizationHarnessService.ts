/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CustomizationHarnessServiceBase } from '../../../../workbench/contrib/chat/common/customizationHarnessService.js';
import { IPromptsService } from '../../../../workbench/contrib/chat/common/promptSyntax/service/promptsService.js';

/**
 * Sessions-window override of the customization harness service.
 *
 * Harnesses are provided by chat session providers and AHP remote servers.
 */
export class SessionsCustomizationHarnessService extends CustomizationHarnessServiceBase {

	constructor(
		@IPromptsService promptsService: IPromptsService,
	) {
		super([], '', promptsService);
	}
}
