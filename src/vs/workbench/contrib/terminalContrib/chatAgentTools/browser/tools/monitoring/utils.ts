/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ILanguageModelChatResponse } from '../../../../../chat/common/languageModels.js';

export async function getTextResponseFromStream(response: ILanguageModelChatResponse): Promise<string> {
	let responseText = '';
	const streaming = (async () => {
		if (!response || !response.stream) {
			return;
		}
		for await (const part of response.stream) {
			if (Array.isArray(part)) {
				for (const p of part) {
					if (p.type === 'text') {
						responseText += p.value;
					}
				}
			} else if (part.type === 'text') {
				responseText += part.value;
			}
		}
	})();

	try {
		await Promise.all([response.result, streaming]);
		return responseText;
	} catch (err) {
		return 'Error occurred ' + err;
	}
}
