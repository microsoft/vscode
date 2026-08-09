/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as eslint from 'eslint';
import { TSESTree } from '@typescript-eslint/utils';

/**
 * Disallows untyped access to the agent host protocol's open `_meta` bag.
 *
 * `_meta` is declared on protocol messages as an opaque
 * `Record<string, unknown>`. Reading a field off it directly (`x._meta.foo`,
 * `x._meta?.['foo']`) or casting it to an interface (`x._meta as Foo`) bypasses
 * any validation and lets well-known keys drift between producers and consumers.
 *
 * Instead, read well-known keys through a validating reader declared in a common
 * module (e.g. `readToolCallMeta(toolCall)`), which takes the parent object,
 * reads its `_meta` internally, checks each field, and drops wrong-typed values.
 * Referencing `_meta` itself as a value (the leaf reference, e.g.
 * `const meta = source._meta`) is allowed — only further member access or casts
 * off `_meta` are flagged.
 *
 * This rule is purely syntactic (no type information): it keys off the `_meta`
 * identifier, so the reader modules that perform the one sanctioned first hop
 * into a namespaced slot, and the rare access to a non-protocol `_meta` (e.g. a
 * vendored SDK's own typed `_meta`), use a scoped `eslint-disable` line.
 */
export default new class NoUntypedMetaAccess implements eslint.Rule.RuleModule {

	readonly meta: eslint.Rule.RuleMetaData = {
		messages: {
			noMetaFieldAccess: 'Do not read fields off `_meta` directly. Read well-known keys through a validating reader that takes the parent object (e.g. `readToolCallMeta(toolCall)`) declared in a common module.',
			noMetaCast: 'Do not cast `_meta` to an interface. Read well-known keys through a validating reader that takes the parent object (e.g. `readToolCallMeta(toolCall)`) declared in a common module.',
		},
		schema: false,
	};

	create(context: eslint.Rule.RuleContext): eslint.Rule.RuleListener {

		function unwrap(node: TSESTree.Node | null | undefined): TSESTree.Node | null | undefined {
			return node?.type === 'ChainExpression' ? node.expression : node;
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
			return false;
		}

		return {
			'MemberExpression': (node: TSESTree.MemberExpression) => {
				if (isMetaAccess(node.object)) {
					context.report({ node, messageId: 'noMetaFieldAccess' });
				}
			},
			'TSAsExpression, TSTypeAssertion': (node: TSESTree.TSAsExpression | TSESTree.TSTypeAssertion) => {
				if (isMetaAccess(node.expression)) {
					context.report({ node, messageId: 'noMetaCast' });
				}
			},
		};
	}
};
