/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { ExtensionIdentifier } from '../../../../../platform/extensions/common/extensions.js';
import { ChatMessageRole, ILanguageModelsService } from '../../../chat/common/languageModels.js';


export async function assessOutputForErrors(buffer: string, token: CancellationToken, languageModelsService: Pick<ILanguageModelsService, 'selectLanguageModels' | 'sendChatRequest'>): Promise<string> {
	const models = await languageModelsService.selectLanguageModels({ vendor: 'copilot', family: 'gpt-4o-mini' });
	if (!models.length) {
		return 'No models available';
	}

	const response = await languageModelsService.sendChatRequest(models[0], new ExtensionIdentifier('github.copilot-chat'), [{ role: ChatMessageRole.Assistant, content: [{ type: 'text', value: `Evaluate this terminal output to determine if there were errors or if the command ran successfully: ${buffer}.` }] }], {}, token);

	let responseText = '';

	const streaming = (async () => {
		for await (const part of response.stream) {
			if (Array.isArray(part)) {
				for (const p of part) {
					if (p.part.type === 'text') {
						responseText += p.part.value;
					}
				}
			} else if (part.part.type === 'text') {
				responseText += part.part.value;
			}
		}
	})();

	try {
		await Promise.all([response.result, streaming]);
		return response.result;
	} catch (err) {
		return 'Error occurred ' + err;
	}
}
