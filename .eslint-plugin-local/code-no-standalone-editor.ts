/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as eslint from 'eslint';
import { join } from 'path';
import { createImportRuleListener } from './utils';

export = new class NoNlsInStandaloneEditorRule implements eslint.Rule.RuleModule {

	readonly meta: eslint.Rule.RuleMetaData = {
		messages: {
			badImport: 'Not allowed to import standalone editor modules.'
		},
		docs: {
			url: 'https://github.com/microsoft/vscode/wiki/Source-Code-Organization'
		},
		schema: false,
	};

	create(context: eslint.Rule.RuleContext): eslint.Rule.RuleListener {

		if (/vs(\/|\\)editor/.test(context.getFilename())) {
			// the vs/editor folder is allowed to use the standalone editor
			return {};
		}

		return createImportRuleListener((node, path) => {

			// resolve relative paths
			if (path[0] === '.') {
				path = join(context.getFilename(), path);
			}

			if (
				/vs(\/|\\)editor(\/|\\)standalone(\/|\\)/.test(path)
				|| /vs(\/|\\)editor(\/|\\)common(\/|\\)standalone(\/|\\)/.test(path)
				|| /vs(\/|\\)editor(\/|\\)editor.api/.test(path)
				|| /vs(\/|\\)editor(\/|\\)editor.main/.test(path)
				|| /vs(\/|\\)editor(\/|\\)editor.worker.start/.test(path)
			) {
				context.report({
					loc: node.loc,
					messageId: 'badImport'
				});
			}
		});
	}
};

