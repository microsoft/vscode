/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as eslint from 'eslint';

export = new class NoGlobalDocumentListener implements eslint.Rule.RuleModule {

	create(context: eslint.Rule.RuleContext): eslint.Rule.RuleListener {
		return {
			CallExpression(node: any) {
				if (
					(
						node.callee.name === 'addDisposableListener' ||
						node.callee.property?.name === 'addDisposableListener'
					) &&
					node.arguments.length > 0 &&
					node.arguments[0].type === 'Identifier' &&
					node.arguments[0].name === 'document'
				) {
					context.report({
						node,
						message: 'Use <targetWindow>.document to support multi-window scenarios. Resolve targetWindow with DOM.getWindow(element) or DOM.getActiveWindow() or use the predefined mainWindow constant.',
					});
				}
			},
		};
	}
};
