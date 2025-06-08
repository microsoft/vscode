/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as eslint from 'eslint';

/**
 * Checks for potential disposable leaks by identifying:
 * 1. Event listeners that return disposables but aren't stored/disposed
 * 2. Emitter/DisposableStore instances that aren't registered for disposal
 * 3. Variables assigned disposables that never get disposed
 */
export = new class implements eslint.Rule.RuleModule {

	readonly meta: eslint.Rule.RuleMetaData = {
		type: 'problem',
		messages: {
			eventNotDisposed: 'Event listener should be disposed. Store the result and call dispose() or use _register().',
			emitterNotRegistered: 'Emitter should be registered for disposal using _register() or stored in DisposableStore.',
			disposableNotDisposed: 'Disposable object should be disposed. Call dispose() or use _register().',
		},
		schema: false,
	};

	create(context: eslint.Rule.RuleContext): eslint.Rule.RuleListener {

		// Known disposable types that should be tracked
		const disposableTypes = new Set([
			'Emitter', 'DisposableStore', 'MutableDisposable', 'Disposable'
		]);

		// Event methods that return disposables
		const eventMethods = new Set([
			'event'
		]);

		// Check if a call expression creates a disposable
		function isDisposableCreation(node: any): boolean {
			if (node.type === 'NewExpression' && node.callee?.name) {
				return disposableTypes.has(node.callee.name);
			}
			if (node.type === 'CallExpression') {
				// Check for event listeners like obj.event(...)
				if (node.callee?.type === 'MemberExpression' && 
					node.callee.property?.name && 
					(eventMethods.has(node.callee.property.name) || 
					 node.callee.property.name.startsWith('on'))) {
					return true;
				}
			}
			return false;
		}

		// Check if the result is being stored/registered properly
		function isProperlyHandled(parent: any): boolean {
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

			// Directly chained .dispose(): obj.event(...).dispose()
			if (parent.type === 'MemberExpression' && parent.property?.name === 'dispose') {
				return true;
			}

			return false;
		}

		return {
			// Check for event listeners that might leak
			'CallExpression': (node: any) => {
				if (isDisposableCreation(node) && !isProperlyHandled(node.parent)) {
					// Special handling for event calls
					if (node.callee?.type === 'MemberExpression' && 
						node.callee.property?.name && 
						(eventMethods.has(node.callee.property.name) || 
						 node.callee.property.name.startsWith('on'))) {
						context.report({
							node,
							messageId: 'eventNotDisposed'
						});
					}
				}
			},

			// Check for new Emitter/DisposableStore that might leak
			'NewExpression': (node: any) => {
				if (disposableTypes.has(node.callee?.name) && !isProperlyHandled(node.parent)) {
					if (node.callee.name === 'Emitter') {
						context.report({
							node,
							messageId: 'emitterNotRegistered'
						});
					} else {
						context.report({
							node,
							messageId: 'disposableNotDisposed'
						});
					}
				}
			}
		};
	}
};