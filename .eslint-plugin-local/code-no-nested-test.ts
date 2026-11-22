/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Context, CreateRule, ESTree, RuleMeta, Scope, Visitor } from '@oxlint/plugins';

const registrations = new Set(['test', 'it', 'suite', 'describe']);
const testBodies = new Set(['test', 'it']);

/**
 * Tests and suites (Mocha globals) are registered while the surrounding suite runs. Registering one from inside a
 * test body happens too late: Mocha silently drops it, so it never runs. This typically comes from
 * a misplaced closing brace.
 */
export default new class NoNestedTest implements CreateRule {

	readonly meta: RuleMeta = {
		type: 'problem',
		messages: {
			nested: '`{{name}}` is declared inside the body of another test and will never run. Check for a misplaced closing brace.'
		},
		schema: []
	};

	create(context: Context): Visitor {
		const sourceCode = context.sourceCode;

		/**
		 * Returns the test API name (`test`, `suite`, ...) when the callee syntactically looks like a call into the
		 * test framework. {@link isFrameworkGlobal} must also hold for it to be one.
		 */
		function getTestApiName(node: ESTree.Node): string | undefined {
			if (node.type !== 'CallExpression') {
				return undefined;
			}
			let callee = node.callee;
			// `test.skip(...)`, `test.only(...)`
			if (callee.type === 'MemberExpression' && callee.object.type === 'Identifier' && !callee.computed) {
				callee = callee.object;
			}
			return callee.type === 'Identifier' && registrations.has(callee.name) ? callee.name : undefined;
		}

		/**
		 * Only Mocha's globals are covered. A local helper that happens to be named `test` is not the test
		 * framework, and `node:test` runs a test declared inside another test as a subtest.
		 * This requires scope analysis, which is costly, so it is only checked after all syntactic conditions.
		 */
		function isFrameworkGlobal(node: ESTree.Node, name: string): boolean {
			for (let scope: Scope | null = sourceCode.getScope(node); scope; scope = scope.upper) {
				const variable = scope.set.get(name);
				// Configured globals (`languageOptions.globals`, `/* global test */`) have no definitions.
				if (variable && variable.defs.length > 0) {
					return false;
				}
			}
			return true;
		}

		function isInsideTestBody(node: ESTree.Node): boolean {
			for (let fn: ESTree.Node | null = node.parent; fn; fn = fn.parent) {
				const parent = fn.parent;
				if ((fn.type === 'ArrowFunctionExpression' || fn.type === 'FunctionExpression')
					&& parent?.type === 'CallExpression' && parent.arguments.includes(fn)) {
					const name = getTestApiName(parent);
					if (name && testBodies.has(name) && isFrameworkGlobal(parent, name)) {
						return true;
					}
				}
			}
			return false;
		}

		/** An inline function, or a reference to one (`test('name', sharedTest)`). */
		function isCallbackArgument(arg: ESTree.CallExpression['arguments'][number]): boolean {
			return arg.type === 'ArrowFunctionExpression' || arg.type === 'FunctionExpression' || arg.type === 'Identifier' || arg.type === 'MemberExpression';
		}

		return {
			CallExpression: (node: ESTree.CallExpression) => {
				const name = getTestApiName(node);
				if (name && node.arguments.some(isCallbackArgument) && isInsideTestBody(node) && isFrameworkGlobal(node, name)) {
					context.report({ node, messageId: 'nested', data: { name } });
				}
			}
		};
	}
};
