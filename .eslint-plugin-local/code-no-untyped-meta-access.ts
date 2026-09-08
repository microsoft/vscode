/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as eslint from 'eslint';
import type * as ESTree from 'estree';
import { TSESTree } from '@typescript-eslint/utils';

/**
 * Disallows untyped access to the agent host protocol's open `_meta` bag.
 *
 * `_meta` is declared on protocol messages as an opaque
 * `Record<string, unknown>`. Reading a field off it directly (`x._meta.foo`,
 * `x._meta?.['foo']`) or casting it to an interface (`x._meta as Foo`) bypasses
 * any validation and lets well-known keys drift between producers and consumers.
 *
 * Instead, read well-known keys through a validating reader declared under
 * `common/meta` (e.g. `readToolCallMeta(toolCall)`), which takes the parent
 * object, checks each recognized field, and drops wrong-typed values.
 * Referencing `_meta` itself as a value is allowed for opaque forwarding and
 * merging. Field access and casts are also flagged when `_meta` is first
 * assigned to a local variable, so aliasing the bag is not a validation
 * boundary.
 *
 * This rule is purely syntactic (no type information): it keys off the `_meta`
 * identifier. Non-protocol `_meta` APIs (for example, a vendored SDK's own
 * typed metadata) must be isolated in an explicitly excluded adapter.
 */
export default new class NoUntypedMetaAccess implements eslint.Rule.RuleModule {

	readonly meta: eslint.Rule.RuleMetaData = {
		messages: {
			noMetaFieldAccess: 'Do not read fields off `_meta` directly. Use a validating reader declared under `common/meta` (e.g. `readToolCallMeta(toolCall)`).',
			noMetaCast: 'Do not cast `_meta` or an alias of it to an interface. Read well-known keys through a validating reader that takes the parent object (e.g. `readToolCallMeta(toolCall)`) declared under `common/meta`.',
		},
		schema: false,
	};

	create(context: eslint.Rule.RuleContext): eslint.Rule.RuleListener {
		const metaAliases = new Set<eslint.Scope.Variable>();
		const metaPropertyAliases = new Set<eslint.Scope.Variable>();

		function unwrap(node: TSESTree.Node | null | undefined): TSESTree.Node | null | undefined {
			while (node?.type === 'ChainExpression' || node?.type === 'TSNonNullExpression') {
				node = node.expression;
			}
			return node;
		}

		function isMetaAccess(node: TSESTree.Node | null | undefined): boolean {
			const n = unwrap(node);
			if (!n || n.type !== 'MemberExpression') {
				return false;
			}
			if (!n.computed && n.property.type === 'Identifier') {
				return n.property.name === '_meta';
			}
			if (n.computed && n.property.type === 'Literal') {
				return n.property.value === '_meta';
			}
			if (n.computed && n.property.type === 'Identifier') {
				const variable = resolveVariable(n.property);
				return variable !== undefined && metaPropertyAliases.has(variable);
			}
			return false;
		}

		function resolveVariable(identifier: TSESTree.Identifier): eslint.Scope.Variable | undefined {
			let scope: eslint.Scope.Scope | null = context.sourceCode.getScope(identifier as ESTree.Node);
			while (scope) {
				const variable = scope.set.get(identifier.name);
				if (variable) {
					return variable;
				}
				scope = scope.upper;
			}
			return undefined;
		}

		function isMetaAlias(node: TSESTree.Node | null | undefined): boolean {
			const n = unwrap(node);
			if (!n || n.type !== 'Identifier') {
				return false;
			}
			const variable = resolveVariable(n);
			return variable !== undefined && metaAliases.has(variable);
		}

		function isMetaBag(node: TSESTree.Node | null | undefined): boolean {
			return isMetaAccess(node) || isMetaAlias(node);
		}

		function isMetaBagCopy(node: TSESTree.Node | null | undefined): boolean {
			const n = unwrap(node);
			return !!n && n.type === 'ObjectExpression' && n.properties.some(property =>
				property.type === 'SpreadElement' && isMetaBag(property.argument)
			);
		}

		function isMetaDerivedValue(node: TSESTree.Node | null | undefined): boolean {
			const n = unwrap(node);
			if (isMetaBag(n) || isMetaBagCopy(n)) {
				return true;
			}
			return (!!n && n.type === 'LogicalExpression'
				&& (isMetaDerivedValue(n.left) || isMetaDerivedValue(n.right)))
				|| (!!n && n.type === 'ConditionalExpression'
					&& (isMetaDerivedValue(n.consequent) || isMetaDerivedValue(n.alternate)));
		}

		function trackAlias(identifier: TSESTree.Identifier): void {
			const variable = resolveVariable(identifier);
			if (variable) {
				metaAliases.add(variable);
			}
		}

		return {
			'VariableDeclarator': (node: TSESTree.VariableDeclarator) => {
				if (node.id.type === 'Identifier' && node.init?.type === 'Literal' && node.init.value === '_meta') {
					const declaration = context.sourceCode.getAncestors(node as ESTree.Node).at(-1);
					if (declaration?.type === 'VariableDeclaration' && declaration.kind === 'const') {
						const variable = resolveVariable(node.id);
						if (variable) {
							metaPropertyAliases.add(variable);
						}
					}
				}
				if (node.id.type === 'Identifier' && isMetaDerivedValue(node.init)) {
					trackAlias(node.id);
					return;
				}
				if (node.id.type === 'ObjectPattern' && isMetaDerivedValue(node.init)) {
					context.report({ node, messageId: 'noMetaFieldAccess' });
					return;
				}
				if (node.id.type !== 'ObjectPattern') {
					return;
				}
				for (const property of node.id.properties) {
					if (property.type !== 'Property') {
						continue;
					}
					const isMetaProperty = (!property.computed && property.key.type === 'Identifier' && property.key.name === '_meta')
						|| (property.key.type === 'Literal' && property.key.value === '_meta');
					const identifier = property.value.type === 'Identifier'
						? property.value
						: property.value.type === 'AssignmentPattern' && property.value.left.type === 'Identifier'
							? property.value.left
							: undefined;
					if (isMetaProperty && identifier) {
						trackAlias(identifier);
					} else if (isMetaProperty) {
						context.report({ node: property.value, messageId: 'noMetaFieldAccess' });
					}
				}
			},
			'AssignmentExpression': (node: TSESTree.AssignmentExpression) => {
				if (node.operator === '=' && node.left.type === 'Identifier' && isMetaDerivedValue(node.right)) {
					trackAlias(node.left);
				} else if (node.left.type === 'ObjectPattern' && isMetaDerivedValue(node.right)) {
					context.report({ node, messageId: 'noMetaFieldAccess' });
				}
			},
			'MemberExpression': (node: TSESTree.MemberExpression) => {
				if (isMetaBag(node.object)) {
					context.report({ node, messageId: 'noMetaFieldAccess' });
				}
			},
			'TSAsExpression, TSTypeAssertion': (node: TSESTree.TSAsExpression | TSESTree.TSTypeAssertion) => {
				if (isMetaBag(node.expression)) {
					context.report({ node, messageId: 'noMetaCast' });
				}
			},
		};
	}
};
