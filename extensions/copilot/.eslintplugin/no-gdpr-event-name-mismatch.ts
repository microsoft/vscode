/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TSESTree } from '@typescript-eslint/typescript-estree';
import * as eslint from 'eslint';

export default new class NoGDPREventNameMismatch implements eslint.Rule.RuleModule {

	readonly meta: eslint.Rule.RuleMetaData = {
		type: "problem",
		fixable: "code",
		docs: {
			description: "Finds common cases where the gdpr comment does not match the telemetry event name in code.",
		},
	};
	create(context: eslint.Rule.RuleContext): eslint.Rule.RuleListener {

		function getParentOfType<NodeType extends TSESTree.Node>(node: TSESTree.Node, type: string): NodeType | undefined {
			let parentNode: TSESTree.Node | undefined = node.parent;
			while (parentNode && parentNode.type !== type) {
				parentNode = parentNode.parent;
			}
			return parentNode as NodeType;
		}

		function getEventNameFromLeadingGdprComment(esNode: TSESTree.Node): string | undefined {
			const statement = getParentOfType(esNode, 'ExpressionStatement');
			if (!statement) {
				return;
			}

			const comments = context.sourceCode.getCommentsBefore(statement as any);
			if (comments.length === 0) {
				return;
			}
			const comment = comments[0];
			if (!comment.value.includes('__GDPR__') || !comment.loc) {
				return;
			}

			const dataStart = comment.value.indexOf('\n');
			const data = comment.value.substring(dataStart)

			let gdprData: { [key: string]: object }
			try {
				const jsonRaw = `{ ${data} }`
				gdprData = JSON.parse(jsonRaw);
			} catch (e) {
				return;
			}

			return Object.keys(gdprData)[0];
		}

		return {
			['ExpressionStatement MemberExpression Identifier[name=/^send.*TelemetryEvent$/]'](node: any) {
				const esNode = node as TSESTree.Identifier;
				const gdprCommentEventName = getEventNameFromLeadingGdprComment(esNode);
				if (!gdprCommentEventName) {
					return;
				}

				const callExpr = getParentOfType<TSESTree.CallExpression>(esNode, 'CallExpression');
				if (!callExpr) {
					return;
				}

				const firstArg = callExpr.arguments[0];
				if (firstArg.type !== TSESTree.AST_NODE_TYPES.Literal) {
					return;
				}

				const callName = firstArg.value
				if (callName !== gdprCommentEventName) {
					context.report({
						node,
						message: `Found mismatch between GDPR comment event name (${gdprCommentEventName}) and telemetry event name (${callName}).`
					});
				}
			}
		};
	}
};
