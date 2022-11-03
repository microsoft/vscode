/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as eslint from 'eslint';

export = new class OnlyPrivatesUseUnderscorePrefix implements eslint.Rule.RuleModule {

	create(context: eslint.Rule.RuleContext): eslint.Rule.RuleListener {

		const propertyNamePattern = '/^_\\w+Service$/'

		function reportNode(node: any) {
			context.report({
				node,
				message: `Properties matching '${propertyNamePattern}' must be marked as private`
			});
		}

		return {
			[`PropertyDefinition[key.name=${propertyNamePattern}]:not([accessibility="private"])`]: (node: any) => {
				if (!String(node.key.name).endsWith('Brand')) {
					return reportNode(node);
				}
			},
			[`TSParameterProperty[parameter.name=${propertyNamePattern}]:not([accessibility="private"])`]: (node: any) => {
				return reportNode(node);
			}
		};
	}
};
