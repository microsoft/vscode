/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as glob from 'vs/base/common/glob';

// TODO: this doesn't properly support a lot of the intricacies of .gitignore, for intance
// vscode's root gitignore has:

// extensions/**/dist/
// /out*/
// /extensions/**/out/

// but paths like /extensions/css-language-features/client/dist/browser/cssClientMain.js.map are being searched

export function parseIgnoreFile(ignoreContents: string) {
	const ignoreLines = ignoreContents.split('\n').map(line => line.trim()).filter(line => line[0] !== '#');
	const ignoreExpression = Object.create(null);
	for (const line of ignoreLines) {
		ignoreExpression[line] = true;
	}

	const checker = glob.parse(ignoreExpression);
	return checker;
}
