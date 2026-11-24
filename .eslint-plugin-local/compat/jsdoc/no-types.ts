/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Context, CreateRule, ESTree, RuleMeta, Visitor } from '@oxlint/plugins';
import { getJSDocComment, JSDoc, loose, type Spec } from './jsdocUtils.ts';

const typedTags = new Set(['param', 'arg', 'argument', 'returns', 'return']);
const propertyTags = new Set(['prop', 'property']);

/**
 * `jsdoc/no-types`: TypeScript code declares the types of parameters and return values, so the JSDoc of functions,
 * methods and classes must not repeat them as `{type}`. Fixed by removing the types.
 */
export default new class NoTypes implements CreateRule {

	readonly meta: RuleMeta = {
		type: 'suggestion',
		docs: {
			description: 'Disallows types on `@param` and `@returns` tags, which are redundant with TypeScript.',
		},
		fixable: 'code',
		schema: [],
	};

	create(context: Context): Visitor {
		const check = (node: ESTree.Node): void => {
			const comment = getJSDocComment(context.sourceCode, loose(node));
			if (!comment) {
				return;
			}
			const jsdoc = new JSDoc(context, comment);
			const report = (tag: Spec, message: string) => {
				jsdoc.report(message, tag.source[0].number, () => {
					for (const { tokens } of tag.source) {
						tokens.postTag = '';
						tokens.type = '';
					}
				});
			};
			for (const tag of jsdoc.block.tags) {
				if (typedTags.has(tag.tag) && tag.type) {
					report(tag, `Types are not permitted on @${tag.tag}.`);
				}
			}
			if (node.type === 'ClassDeclaration') {
				for (const tag of jsdoc.block.tags) {
					if (propertyTags.has(tag.tag) && tag.type) {
						report(tag, `Types are not permitted on @${tag.tag} in the supplied context.`);
					}
				}
			}
		};

		return {
			ArrowFunctionExpression: check,
			FunctionDeclaration: check,
			FunctionExpression: check,
			TSDeclareFunction: check,
			TSMethodSignature: check,
			ClassDeclaration: check,
		};
	}
};
