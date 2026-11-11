/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { PromptsType } from '../../../../workbench/contrib/chat/common/promptSyntax/promptTypes.js';
import { IBuiltinPromptPath } from '../../../../workbench/contrib/chat/common/promptSyntax/service/promptsService.js';
import { AgenticPromptsService } from '../../chat/browser/promptsService.js';

export class MobilePromptsService extends AgenticPromptsService {

	protected override async getBuiltinPromptFiles(type: PromptsType, token: CancellationToken): Promise<readonly IBuiltinPromptPath[]> {
		const files = await super.getBuiltinPromptFiles(type, token);
		return files.filter(file => file.name !== 'generate-chat-background');
	}
}
