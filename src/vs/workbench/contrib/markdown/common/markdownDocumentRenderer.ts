/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as marked from 'vs/base/common/marked/marked';
import { tokenizeToString } from 'vs/editor/common/modes/textToHtmlTokenizer';
import { ITokenizationSupport, TokenizationRegistry } from 'vs/editor/common/modes';
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';
import { IModeService } from 'vs/editor/common/services/modeService';

/**
 * Renders a string of markdown as a document.
 *
 * Uses VS Code's syntax highlighting code blocks.
 */
export async function renderMarkdownDocument(
	text: string,
	extensionService: IExtensionService,
	modeService: IModeService,
): Promise<string> {

	const highlight = (code: string, lang: string, callback: ((error: any, code: string) => void) | undefined): any => {
		if (!callback) {
			return code;
		}
		extensionService.whenInstalledExtensionsRegistered().then(async () => {
			let support: ITokenizationSupport | undefined;
			const modeId = modeService.getModeIdForLanguageName(lang);
			if (modeId) {
				modeService.triggerMode(modeId);
				support = await TokenizationRegistry.getPromise(modeId) ?? undefined;
			}
			callback(null, `<code>${tokenizeToString(code, support)}</code>`);
		});
		return '';
	};

	return new Promise<string>((resolve, reject) => {
		marked(text, { highlight }, (err, value) => err ? reject(err) : resolve(value));
	});
}
