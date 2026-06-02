/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TSESTree } from '@typescript-eslint/utils';
import * as eslint from 'eslint';

/**
 * Lint rule that prevents using a `ServicesAccessor` after an `await` expression.
 *
 * The accessor returned by `IInstantiationService.invokeFunction` is only valid
 * synchronously during the invocation of the target function. Calling
 * `accessor.get(...)` after any `await` is a bug because the accessor will have
 * been invalidated.
 *
 * Detection strategies:
 * 1. `invokeFunction` / `invokeWithinContext` calls — first param of the callback
 *    is the accessor.
 * 2. Functions/methods with a parameter typed as `ServicesAccessor` — these are
 *    always called through `invokeFunction` at runtime (e.g. `Action2.run`,
 *    `ICommandHandler`).
 */
export default new class NoAccessorAfterAwait implements eslint.Rule.RuleModule {

	readonly meta: eslint.Rule.RuleMetaData = {
		messages: {
			accessorAfterAwait: 'ServicesAccessor \'{{name}}\' must not be used after \'await\'. The accessor is only valid synchronously. Extract needed services before any async operation.',
		},
		schema: false,
	};

	create(context: eslint.Rule.RuleContext): eslint.Rule.RuleListener {
		return {
			// Strategy 1: invokeFunction / invokeWithinContext calls
			'CallExpression': (node: eslint.Rule.Node) => {
				const callExpression = node as unknown as TSESTree.CallExpression;

				if (!isInvokeFunctionCall(callExpression.callee)) {
					return;
				}

				const functionArg = callExpression.arguments.find(arg =>
					arg.type === 'ArrowFunctionExpression' || arg.type === 'FunctionExpression'
				) as TSESTree.ArrowFunctionExpression | TSESTree.FunctionExpression | undefined;

				if (!functionArg || functionArg.params.length === 0) {
					return;
				}

				const accessorName = getParamName(functionArg.params[0]);
				if (!accessorName) {
					return;
				}

				checkForAccessorAfterAwait(functionArg, accessorName, context);
			},

			// Strategy 2: functions/methods with a `ServicesAccessor` typed parameter
			'FunctionDeclaration': (node: eslint.Rule.Node) => {
				checkFunctionWithAccessorParam(node as unknown as TSESTree.FunctionDeclaration, context);
			},
			'FunctionExpression': (node: eslint.Rule.Node) => {
				checkFunctionWithAccessorParam(node as unknown as TSESTree.FunctionExpression, context);
			},
			'ArrowFunctionExpression': (node: eslint.Rule.Node) => {
				checkFunctionWithAccessorParam(node as unknown as TSESTree.ArrowFunctionExpression, context);
			},
		};
	}
};

function checkFunctionWithAccessorParam(
	fn: TSESTree.FunctionDeclaration | TSESTree.FunctionExpression | TSESTree.ArrowFunctionExpression,
	context: eslint.Rule.RuleContext
) {
	for (const param of fn.params) {
		if (param.type === 'Identifier' && hasServicesAccessorAnnotation(param)) {
			// Skip if this function is the direct callback of an invokeFunction call
			// (already handled by strategy 1)
			if (isDirectInvokeFunctionCallback(fn)) {
				return;
			}
			checkForAccessorAfterAwait(fn, param.name, context);
			return;
		}
	}
}

/**
 * Check whether a function node is the direct callback argument of an
 * `invokeFunction` / `invokeWithinContext` call.
 */
function isDirectInvokeFunctionCallback(
	fn: TSESTree.FunctionDeclaration | TSESTree.FunctionExpression | TSESTree.ArrowFunctionExpression
): boolean {
	const parent = fn.parent;
	if (parent?.type === 'CallExpression' && isInvokeFunctionCall(parent.callee)) {
		return parent.arguments.some(arg => arg === fn);
	}
	return false;
}

function hasServicesAccessorAnnotation(param: TSESTree.Identifier): boolean {
	const annotation = param.typeAnnotation;
	if (!annotation || annotation.type !== 'TSTypeAnnotation') {
		return false;
	}
	const typeNode = annotation.typeAnnotation;
	if (typeNode.type === 'TSTypeReference' && typeNode.typeName.type === 'Identifier') {
		return typeNode.typeName.name === 'ServicesAccessor';
	}
	return false;
}

function checkForAccessorAfterAwait(
	fn: TSESTree.ArrowFunctionExpression | TSESTree.FunctionExpression | TSESTree.FunctionDeclaration,
	accessorName: string,
	context: eslint.Rule.RuleContext
) {
	let sawAwait = false;
	const visited = new Set<TSESTree.Node>();

	function walk(node: TSESTree.Node) {
		if (visited.has(node)) {
			return;
		}
		visited.add(node);

		// Don't descend into nested function scopes — they have their own
		// async context and the accessor name may be shadowed.
		if (node !== fn &&
			(node.type === 'ArrowFunctionExpression' ||
				node.type === 'FunctionExpression' ||
				node.type === 'FunctionDeclaration')) {
			return;
		}

		if (node.type === 'AwaitExpression') {
			// Walk the argument first (it is evaluated before the await suspends)
			if (node.argument) {
				walk(node.argument);
			}
			sawAwait = true;
			return;
		}

		if (isAccessorUsage(node, accessorName) && sawAwait) {
			context.report({
				node: node as unknown as eslint.Rule.Node,
				messageId: 'accessorAfterAwait',
				data: { name: accessorName },
			});
			return;
		}

		// Branch-aware walking: isolate await state across branches so an
		// await in one branch does not taint the other branch.
		if (node.type === 'IfStatement') {
			walk(node.test);
			const beforeBranches = sawAwait;

			// Walk consequent
			walk(node.consequent);
			const awaitAfterConsequent = sawAwait;
			const consequentExits = blockAlwaysExits(node.consequent);

			// Restore before walking alternate
			sawAwait = beforeBranches;
			if (node.alternate) {
				walk(node.alternate);
			}
			const awaitAfterAlternate = sawAwait;
			const alternateExits = node.alternate ? blockAlwaysExits(node.alternate) : false;

			// Determine sawAwait for code after the if-statement.
			// If a branch always exits (return/throw), code after is only
			// reachable from the other branch.
			if (consequentExits && alternateExits) {
				// Both exit — code after is unreachable, keep conservative
				sawAwait = awaitAfterConsequent || awaitAfterAlternate;
			} else if (consequentExits) {
				// Only reachable through alternate path
				sawAwait = awaitAfterAlternate;
			} else if (alternateExits) {
				// Only reachable through consequent path
				sawAwait = awaitAfterConsequent;
			} else {
				sawAwait = awaitAfterConsequent || awaitAfterAlternate;
			}
			return;
		}

		if (node.type === 'ConditionalExpression') {
			walk(node.test);
			const beforeBranches = sawAwait;
			walk(node.consequent);
			const awaitAfterConsequent = sawAwait;
			sawAwait = beforeBranches;
			walk(node.alternate);
			sawAwait = sawAwait || awaitAfterConsequent;
			return;
		}

		if (node.type === 'SwitchStatement') {
			walk(node.discriminant);
			const beforeCases = sawAwait;
			let anyCaseHadAwait = false;
			for (const c of node.cases) {
				sawAwait = beforeCases;
				if (c.test) { walk(c.test); }
				c.consequent.forEach(walk);
				anyCaseHadAwait = anyCaseHadAwait || sawAwait;
			}
			sawAwait = anyCaseHadAwait;
			return;
		}

		if (node.type === 'TryStatement') {
			const beforeTry = sawAwait;
			walk(node.block);
			const awaitAfterTry = sawAwait;
			// Catch: an exception may have been thrown before or after an await
			// in the try block, so we conservatively use the before-try state.
			sawAwait = beforeTry;
			if (node.handler) { walk(node.handler.body); }
			const awaitAfterCatch = sawAwait;
			sawAwait = awaitAfterTry || awaitAfterCatch;
			if (node.finalizer) { walk(node.finalizer); }
			return;
		}

		// `for await...of` suspends on each iteration
		if (node.type === 'ForOfStatement' && node.await) {
			walkChildren(node, (child) => {
				if (child === node.right) {
					walk(child);
					sawAwait = true;
				} else {
					walk(child);
				}
			});
			return;
		}

		// Walk children in source order for all other node types
		walkChildren(node, walk);
	}

	if (fn.body) {
		walk(fn.body);
	}
}

/**
 * Check whether a statement or block always exits the current function scope
 * via `return` or `throw`. Note: `break`/`continue` only exit loops, not the
 * enclosing function, so they are intentionally excluded.
 */
function blockAlwaysExits(node: TSESTree.Node): boolean {
	if (node.type === 'ReturnStatement' || node.type === 'ThrowStatement') {
		return true;
	}
	if (node.type === 'BlockStatement' && node.body.length > 0) {
		return blockAlwaysExits(node.body[node.body.length - 1]);
	}
	if (node.type === 'IfStatement') {
		return blockAlwaysExits(node.consequent) &&
			!!node.alternate && blockAlwaysExits(node.alternate);
	}
	return false;
}

/**
 * Check if a node is a usage of the accessor — either `accessor.get(...)` or
 * just a reference to the accessor identifier (e.g. passing it to another fn).
 */
function isAccessorUsage(node: TSESTree.Node, accessorName: string): boolean {
	// accessor.get(...)
	if (node.type === 'CallExpression' &&
		node.callee.type === 'MemberExpression' &&
		node.callee.object.type === 'Identifier' &&
		node.callee.object.name === accessorName) {
		return true;
	}
	// Passing accessor as an argument: someFunction(accessor)
	if (node.type === 'Identifier' && node.name === accessorName) {
		// Only flag when used as a call argument or assignment, not in
		// the function's own parameter list
		const parent = node.parent;
		if (parent?.type === 'CallExpression' && parent.arguments.includes(node)) {
			return true;
		}
	}
	return false;
}

function walkChildren(node: TSESTree.Node, visit: (child: TSESTree.Node) => void) {
	switch (node.type) {
		case 'BlockStatement':
			node.body.forEach(visit);
			break;
		case 'ExpressionStatement':
			visit(node.expression);
			break;
		case 'VariableDeclaration':
			node.declarations.forEach(decl => {
				if (decl.init) { visit(decl.init); }
			});
			break;
		case 'CallExpression':
			visit(node.callee);
			node.arguments.forEach(visit);
			break;
		case 'MemberExpression':
			visit(node.object);
			if (node.computed) { visit(node.property); }
			break;

		case 'ReturnStatement':
			if (node.argument) { visit(node.argument); }
			break;
		case 'BinaryExpression':
		case 'LogicalExpression':
			visit(node.left);
			visit(node.right);
			break;
		case 'AssignmentExpression':
			visit(node.left);
			visit(node.right);
			break;
		case 'TemplateLiteral':
			node.expressions.forEach(visit);
			break;
		case 'TaggedTemplateExpression':
			visit(node.tag);
			visit(node.quasi);
			break;
		case 'ArrayExpression':
			node.elements.forEach(e => { if (e) { visit(e); } });
			break;
		case 'ObjectExpression':
			node.properties.forEach(p => {
				if (p.type === 'Property') {
					visit(p.value);
				} else {
					visit(p);
				}
			});
			break;
		case 'SpreadElement':
			visit(node.argument);
			break;
		case 'UnaryExpression':
		case 'UpdateExpression':
			visit(node.argument);
			break;

		case 'ForStatement':
			if (node.init) { visit(node.init); }
			if (node.test) { visit(node.test); }
			if (node.update) { visit(node.update); }
			visit(node.body);
			break;
		case 'ForInStatement':
			visit(node.left);
			visit(node.right);
			visit(node.body);
			break;
		case 'ForOfStatement':
			visit(node.left);
			visit(node.right);
			visit(node.body);
			break;
		case 'WhileStatement':
		case 'DoWhileStatement':
			visit(node.test);
			visit(node.body);
			break;
		case 'ThrowStatement':
			if (node.argument) { visit(node.argument); }
			break;
		case 'NewExpression':
			visit(node.callee);
			node.arguments.forEach(visit);
			break;
		case 'SequenceExpression':
			node.expressions.forEach(visit);
			break;
		case 'TSAsExpression':
		case 'TSNonNullExpression':
			visit(node.expression);
			break;
		// Leaf / unhandled nodes — nothing to traverse
		default:
			break;
	}
}

function getParamName(param: TSESTree.Parameter): string | null {
	if (param.type === 'Identifier') {
		return param.name;
	}
	return null;
}

const invokeFunctionNames = new Set(['invokeFunction', 'invokeWithinContext']);

function isInvokeFunctionCall(callee: TSESTree.Expression): boolean {
	// object.invokeFunction(...)
	if (callee.type === 'MemberExpression' &&
		callee.property.type === 'Identifier' &&
		invokeFunctionNames.has(callee.property.name)) {
		return true;
	}
	// Standalone invokeFunction(...) — unlikely but handle it
	if (callee.type === 'Identifier' && invokeFunctionNames.has(callee.name)) {
		return true;
	}
	return false;
}
