/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as eslint from 'eslint';
import { TSESTree } from '@typescript-eslint/experimental-utils';

/**
 * Enforces that all parameter properties have an explicit access modifier (public, protected, private).
 *
 * This catches a common bug where a service is accidentally made public by simply writing: `readonly prop: Foo`
 */
export = new class implements eslint.Rule.RuleModule {

	create(context: eslint.Rule.RuleContext): eslint.Rule.RuleListener {
		function check(inNode: any) {
			const node: TSESTree.TSParameterProperty = inNode;

			// For now, only apply to injected services
			const firstDecorator = node.decorators?.at(0);
			if (
				firstDecorator?.expression.type !== 'Identifier'
				|| !firstDecorator.expression.name.endsWith('Service')
			) {
				return;
			}

			if (!node.accessibility) {
				context.report({
					node: inNode,
					message: 'Parameter properties must have an explicit access modifier.'
				});
			}
		}

		return {
			['TSParameterProperty']: check,
		};
	}
};
