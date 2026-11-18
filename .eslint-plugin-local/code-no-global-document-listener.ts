/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Context, CreateRule, ESTree, Visitor } from '@oxlint/plugins';

export default new class NoGlobalDocumentListener implements CreateRule {

	create(context: Context): Visitor {
		return {
			CallExpression(node: ESTree.CallExpression) {
				const callee = node.callee;
				if (
					(
						(callee.type === 'Identifier' && callee.name === 'addDisposableListener') ||
						(callee.type === 'MemberExpression' && 'name' in callee.property && callee.property.name === 'addDisposableListener')
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
