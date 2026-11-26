/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Context, CreateRule, RuleMeta, Visitor } from '@oxlint/plugins';
import { createImportRuleListener } from './utils.ts';

export default new class implements CreateRule {

	readonly meta: RuleMeta = {
		messages: {
			noNlsLocalize: 'Do not import localize from nls. Use vscode.l10n.t or import l10n from @vscode/l10n instead.'
		},
		docs: {
			description: 'Disallow importing localize from nls files',
		},
		schema: []
	};

	create(context: Context): Visitor {
		return createImportRuleListener((node, path) => {
			// Match paths ending with /nls, /nls.js, /vs/nls, etc.
			if (path.endsWith('/nls') || path.endsWith('/nls.js') || path === 'vs/nls') {
				context.report({
					loc: node.parent!.loc,
					messageId: 'noNlsLocalize'
				});
			}
		});
	}
};
