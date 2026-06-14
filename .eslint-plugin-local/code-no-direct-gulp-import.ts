/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as eslint from 'eslint';
import { normalize } from 'path';
import { createImportRuleListener } from './utils.ts';

const REPO_ROOT = normalize(`${import.meta.dirname}/..`);
const FACADE_PATH = normalize(`${REPO_ROOT}/build/gulp-facade.ts`);

function isGulpModule(name: string): boolean {
	return name === 'gulp' || name.startsWith('gulp-');
}

export default new class implements eslint.Rule.RuleModule {

	readonly meta: eslint.Rule.RuleMetaData = {
		messages: {
			notAllowed: 'Importing \'{{module}}\' directly is not allowed. Import from \'./gulp-facade\' (or relative path to build/gulp-facade) instead.'
		},
		schema: false
	};

	create(context: eslint.Rule.RuleContext): eslint.Rule.RuleListener {
		const filename = normalize(context.getFilename());
		if (filename === FACADE_PATH) {
			return {};
		}

		return createImportRuleListener((node, path) => {
			if (!isGulpModule(path)) {
				return;
			}
			context.report({
				loc: node.loc,
				messageId: 'notAllowed',
				data: { module: path }
			});
		});
	}
};
