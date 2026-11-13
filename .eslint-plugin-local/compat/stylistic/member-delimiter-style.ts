/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Context, CreateRule, ESTree, Visitor } from '@oxlint/plugins';

/**
 * Requires members of interfaces and type literals to end with a semicolon, except that the last member of a
 * single-line body must not have a delimiter. Implements the default options of `@stylistic/member-delimiter-style`.
 */
export default new class MemberDelimiterStyle implements CreateRule {

	readonly meta: CreateRule['meta'] = {
		type: 'layout',
		docs: { description: 'Require a specific member delimiter style for interfaces and type literals' },
		fixable: 'whitespace',
		schema: [],
		messages: {
			unexpectedComma: 'Unexpected separator (,).',
			unexpectedSemi: 'Unexpected separator (;).',
			expectedSemi: 'Expected a semicolon.',
		},
	};

	create(context: Context): Visitor {
		const sourceCode = context.sourceCode;

		const check = (body: ESTree.Node, members: readonly ESTree.TSSignature[]) => {
			const isSingleLine = body.loc.start.line === body.loc.end.line;
			members.forEach((member, index) => {
				const lastToken = sourceCode.getLastToken(member);
				if (!lastToken) {
					return;
				}
				const delimiter = lastToken.type === 'Punctuator' && (lastToken.value === ';' || lastToken.value === ',') ? lastToken.value : undefined;
				const position = { line: lastToken.loc.end.line, column: lastToken.loc.end.column };
				if (isSingleLine && index === members.length - 1) {
					if (delimiter) {
						context.report({
							node: lastToken,
							loc: { start: position, end: position },
							messageId: delimiter === ';' ? 'unexpectedSemi' : 'unexpectedComma',
							fix: fixer => fixer.remove(lastToken),
						});
					}
				} else if (delimiter !== ';') {
					context.report({
						node: lastToken,
						loc: { start: position, end: position },
						messageId: 'expectedSemi',
						fix: fixer => delimiter ? fixer.replaceText(lastToken, ';') : fixer.insertTextAfter(lastToken, ';'),
					});
				}
			});
		};

		return {
			TSInterfaceBody: (node: ESTree.TSInterfaceBody) => check(node, node.body),
			TSTypeLiteral: (node: ESTree.TSTypeLiteral) => check(node, node.members),
		};
	}
};
