/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Context, CreateRule, RuleMeta, Visitor } from '@oxlint/plugins';
import { join } from 'path';
import { createImportRuleListener } from './utils.ts';

export default new class NoNlsInStandaloneEditorRule implements CreateRule {

	readonly meta: RuleMeta = {
		messages: {
			badImport: 'Not allowed to import standalone editor modules.'
		},
		docs: {
			url: 'https://github.com/microsoft/vscode/wiki/Source-Code-Organization'
		},
		schema: false,
	};

	create(context: Context): Visitor {

		if (/vs(\/|\\)editor/.test(context.filename)) {
			// the vs/editor folder is allowed to use the standalone editor
			return {};
		}

		return createImportRuleListener((node, path) => {

			// the patterns below start with `vs/editor`, which isn't in the file name, so they only match when the import contains `editor`
			if (!path.includes('editor')) {
				return;
			}

			// resolve relative paths
			if (path[0] === '.') {
				path = join(context.filename, path);
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

