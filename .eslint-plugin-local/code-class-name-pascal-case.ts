/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Context, CreateRule, ESTree, RuleMeta, Visitor } from '@oxlint/plugins';

/**
 * Equivalent to `@typescript-eslint/naming-convention` configured with `{ selector: 'class', format: ['PascalCase'] }`,
 * without the cost of running that rule's general selector matching on every file.
 */
export default new class ClassNamePascalCase implements CreateRule {

	readonly meta: RuleMeta = {
		type: 'suggestion',
		messages: {
			notPascalCase: 'Class name `{{name}}` must match one of the following formats: PascalCase',
		},
		docs: {
			description: 'Require class names to be PascalCase.',
		},
		schema: [],
	};

	create(context: Context): Visitor {
		const checkClass = (node: ESTree.Class): void => {
			if (node.id && !isPascalCase(node.id.name)) {
				context.report({
					node: node.id,
					messageId: 'notPascalCase',
					data: { name: node.id.name },
				});
			}
		};

		return {
			ClassDeclaration: checkClass,
			ClassExpression: checkClass,
		};
	}
};

/**
 * typescript-eslint's definition of PascalCase: the first character is not lowercase and there are no underscores.
 */
function isPascalCase(name: string): boolean {
	return name.length === 0 || (name[0] === name[0].toUpperCase() && !name.includes('_'));
}
