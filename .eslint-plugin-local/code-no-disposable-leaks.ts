/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as eslint from 'eslint';

/**
 * Checks for potential disposable leaks by identifying cases where:
 * 1. Event listeners are called directly without storing the result
 * 
 * This rule focuses on high-confidence cases to minimize false positives.
 */
export = new class implements eslint.Rule.RuleModule {

	readonly meta: eslint.Rule.RuleMetaData = {
		type: 'problem',
		messages: {
			eventNotStored: 'Event listener or observable call result should be stored and disposed. Consider storing the result or using _register().',
		},
		schema: false,
	};

	create(context: eslint.Rule.RuleContext): eslint.Rule.RuleListener {

		// Check if a call expression is an event call that returns a disposable
		function isEventCall(node: any): boolean {
			if (node.type === 'CallExpression' && node.callee?.type === 'MemberExpression') {
				const propertyName = node.callee.property?.name;
				// Common event patterns that return disposables
				return propertyName === 'event' || 
					   (propertyName && propertyName.startsWith('on') && propertyName.length > 2);
			}
			return false;
		}

		// Check if the result is being properly handled
		function isProperlyHandled(parent: any, node: any): boolean {
			if (!parent) return false;

			// Direct registration: this._register(obj.event(...))
			if (parent.type === 'CallExpression' && 
				parent.callee?.type === 'MemberExpression' &&
				parent.callee.property?.name === '_register') {
				return true;
			}

			// DisposableStore.add: store.add(obj.event(...))
			if (parent.type === 'CallExpression' &&
				parent.callee?.type === 'MemberExpression' &&
				parent.callee.property?.name === 'add') {
				return true;
			}

			// Event listener with disposables parameter: obj.onEvent(handler, thisArg, disposables)
			if (node.type === 'CallExpression' && node.arguments?.length >= 3) {
				return true;
			}

			return false;
		}

		return {
			// Check for event listeners that might leak
			'CallExpression': (node: any) => {
				// Only flag event calls that are used as expression statements (not stored)
				if (isEventCall(node) && 
					node.parent?.type === 'ExpressionStatement' && 
					!isProperlyHandled(node.parent, node)) {
					context.report({
						node,
						messageId: 'eventNotStored'
					});
				}
			}
		};
	}
};