/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as eslint from 'eslint';
import path from 'path';

const layers = new Set([
	'common',
	'vscode',
	'node',
	'vscode-node',
	'worker',
	'vscode-worker',
])

export default new class NoUnlayeredFiles implements eslint.Rule.RuleModule {

	create(context: eslint.Rule.RuleContext): eslint.Rule.RuleListener {

		const filenameParts = context.filename.split(path.sep);

		if (!filenameParts.find(part => layers.has(part))) {
			context.report({
				loc: {
					line: 0,
					column: 0,
				},
				message: `File '${context.filename}' should be inside a '${[...layers].join(', ')}' folder.`,
			});
		}

		return {};
	}
};
