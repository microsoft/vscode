/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as eslint from 'eslint';

export default new class NoBadGDPRComment implements eslint.Rule.RuleModule {
	readonly meta: eslint.Rule.RuleMetaData = {
		type: 'problem',
		docs: {
			description: 'Ensure "Generate with Copilot" string in GitHubPullRequestProviders is never changed',
			category: 'Best Practices'
		},
		schema: [
			{
				type: 'object',
				properties: {
					className: { type: 'string' },
					string: { type: 'string' }
				},
				additionalProperties: false
			}
		]
	}
	create(context: eslint.Rule.RuleContext): eslint.Rule.RuleListener {
		const options = context.options[0] || {};
		const className = options.className || 'GitHubPullRequestProviders';
		const requiredString = options.string || 'Copilot';

		let inTargetClass = false;

		return {
			ClassDeclaration(node) {
				if (node.id && node.id.name === className) {
					inTargetClass = true;
				}
			},
			'ClassDeclaration:exit'(node) {
				if (node.id && node.id.name === className) {
					inTargetClass = false;
				}
			},
			Literal(node) {
				if (inTargetClass && typeof node.value === 'string' && node.value.includes('Generate')) {
					if (!node.value.includes(requiredString)) {
						context.report({
							node,
							message: `String literal in ${className} must include the word "Copilot" as the string is referenced in the GitHub Pull Request extension. Talk to alexr00 if you need to change it.`
						});
					}
				}
			}
		};
	}
};