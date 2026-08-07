/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CustomizationHarnessServiceBase, createVSCodeHarnessDescriptor } from '../../../../workbench/contrib/chat/common/customizationHarnessService.js';
import { IPromptsService } from '../../../../workbench/contrib/chat/common/promptSyntax/service/promptsService.js';
import { SessionType } from '../../../../workbench/contrib/chat/common/chatSessionsService.js';

/**
 * Sessions-window customization harness service.
 */
export class SessionsCustomizationHarnessService extends CustomizationHarnessServiceBase {

	constructor(
		@IPromptsService promptsService: IPromptsService,
	) {
		super(
			[createVSCodeHarnessDescriptor()],
			SessionType.Local,
			promptsService,
		);
	}
}
