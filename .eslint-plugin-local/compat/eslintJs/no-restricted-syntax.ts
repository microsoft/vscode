/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Context, CreateRule, Node, RuleMeta, Visitor } from '@oxlint/plugins';

type RestrictedSyntaxOption = string | { readonly selector: string; readonly message?: string };

/**
 * ESLint's `no-restricted-syntax`: reports every node that matches one of the configured selectors, either with the
 * configured message, or with a message that names the selector.
 */
export default new class NoRestrictedSyntax implements CreateRule {

	readonly meta: RuleMeta = {
		type: 'suggestion',
		docs: { description: 'Disallow specified syntax' },
		messages: {
			restrictedSyntax: '{{message}}',
		},
		schema: {
			type: 'array',
			items: {
				oneOf: [
					{ type: 'string' },
					{
						type: 'object',
						properties: {
							selector: { type: 'string' },
							message: { type: 'string' },
						},
						required: ['selector'],
						additionalProperties: false,
					},
				],
			},
			uniqueItems: true,
			minItems: 0,
		},
	};

	create(context: Context): Visitor {
		const visitor: Visitor = {};
		for (const option of context.options as readonly RestrictedSyntaxOption[]) {
			const selector = typeof option === 'string' ? option : option.selector;
			const message = typeof option !== 'string' && option.message ? option.message : `Using '${selector}' is not allowed.`;
			// Like ESLint, a selector that is configured more than once reports with its last configured message.
			visitor[selector] = (node: Node) => {
				context.report({ node, messageId: 'restrictedSyntax', data: { message } });
			};
		}
		return visitor;
	}
};
