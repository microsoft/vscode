/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as eslint from 'eslint';
import { dirname, join } from 'path';
import { createImportRuleListener } from './utils.ts';

export default new class implements eslint.Rule.RuleModule {

	readonly meta: eslint.Rule.RuleMetaData = {};

	create(context: eslint.Rule.RuleContext): eslint.Rule.RuleListener {

		if (context.filename.includes('/test/')) {
			return {};
		}
		return createImportRuleListener((node, path) => {


			if (path[0] === '.') {
				path = join(dirname(context.filename), path);
			}

			if (path.includes('/test/')) {
				context.report({
					loc: node.parent!.loc,
					message: 'You are not allowed to import anything form /test/ file in a non-test file.',
					data: {
						import: path
					}
				});
			}
		});
	}
};
