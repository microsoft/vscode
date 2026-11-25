/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Context, CreateRule, ESTree, RuleMeta, Visitor } from '@oxlint/plugins';
import { getJSDocComment, JSDoc, loose, looseChild, looseChildren, nameOf, type LooseNode } from './jsdocUtils.ts';

/**
 * A parameter of a function, as `@param` tags name it: a plain name, a rest parameter, or a parameter whose
 * properties are documented separately (a destructuring pattern, or a parameter typed with an object literal type).
 */
type ParameterName = string | undefined | { readonly rest: string | string[] | undefined } | { readonly destructured: true };

function getParameterName(param: LooseNode): ParameterName {
	const left = looseChild(param, 'left');
	const typeAnnotation = left && 'typeAnnotation' in left ? looseChild(left, 'typeAnnotation') : looseChild(param, 'typeAnnotation');
	if (looseChild(typeAnnotation, 'typeAnnotation')?.type === 'TSTypeLiteral') {
		return { destructured: true };
	}
	if ('name' in param) {
		return nameOf(param);
	}
	if (left && 'name' in left) {
		return nameOf(left);
	}
	if (param.type === 'ObjectPattern' || left?.type === 'ObjectPattern' || param.type === 'ArrayPattern' || left?.type === 'ArrayPattern') {
		return { destructured: true };
	}
	if (param.type === 'RestElement') {
		const argument = looseChild(param, 'argument');
		return { rest: nameOf(argument) ?? looseChildren(argument, 'elements')?.map(element => nameOf(element)!) };
	}
	if (param.type === 'TSParameterProperty') {
		return getParameterName(looseChild(param, 'parameter')!);
	}
	throw new Error(`Unsupported function signature format: \`${param.type}\`.`);
}

function getParameterNames(node: LooseNode): ParameterName[] {
	const params = looseChildren(looseChild(looseChild(node, 'typeAnnotation'), 'typeAnnotation'), 'params')
		?? looseChildren(node, 'params')
		?? looseChildren(looseChild(node, 'value'), 'params')
		?? [];
	return params.map(getParameterName);
}

const functionTypes = new Set(['ArrowFunctionExpression', 'FunctionDeclaration', 'FunctionExpression', 'TSDeclareFunction', 'TSMethodSignature', 'TSPropertySignature']);

/**
 * `jsdoc/check-param-names`: the `@param` tags of a function name its parameters, in order, and are not duplicated.
 * Implements the options `{ enableFixer: false, checkDestructured: false }`: the properties of destructured parameters
 * are not checked, and duplicates are not removed.
 */
export default new class CheckParamNames implements CreateRule {

	readonly meta: RuleMeta = {
		type: 'suggestion',
		docs: {
			description: 'Checks for dupe `@param` names and that parameter names in function declarations match JSDoc param names.',
		},
		schema: [{
			type: 'object',
			properties: {
				checkDestructured: { enum: [false] },
				enableFixer: { enum: [false] },
			},
			additionalProperties: false,
		}],
	};

	create(context: Context): Visitor {
		const check = (node: ESTree.Node): void => {
			const comment = getJSDocComment(context.sourceCode, loose(node));
			if (!comment) {
				return;
			}
			if (node.type === 'TSPropertySignature' && node.typeAnnotation?.typeAnnotation.type !== 'TSFunctionType') {
				return;
			}
			const jsdoc = new JSDoc(context, comment);
			const paramTags = jsdoc.block.tags.filter(tag => tag.tag === 'param');
			if (!paramTags.length) {
				return;
			}
			const parameterNames = getParameterNames(loose(node));
			const topLevelTagNames = paramTags.filter(tag => !tag.name.includes('.')).map(tag => tag.name.trim());

			let dotted = 0;
			let thisOffset = 0;
			paramTags.some((tag, index) => {
				const duplicate = paramTags.find((other, otherIndex) => other.name === tag.name && otherIndex !== index);
				if (duplicate) {
					jsdoc.report(`Duplicate @param "${tag.name}"`, duplicate.source[0].number);
					return true;
				}
				if (tag.name.includes('.')) {
					dotted++;
					return false;
				}
				let parameterName = parameterNames[index - dotted + thisOffset];
				if (parameterName === 'this' && tag.name.trim() !== 'this') {
					thisOffset++;
					parameterName = parameterNames[index - dotted + thisOffset];
				}
				if (!parameterName) {
					jsdoc.report(`@param "${tag.name}" does not match an existing function parameter.`, tag.source[0].number);
					return true;
				}
				if (typeof parameterName === 'object' && 'rest' in parameterName && Array.isArray(parameterName.rest)) {
					const actual = tag.name.trim();
					const expected = parameterName.rest[index];
					if (actual === expected) {
						thisOffset--;
						return false;
					}
					jsdoc.report(`Expected @param name to be "${expected}". Got "${actual}".`, tag.source[0].number);
					return true;
				}
				if (typeof parameterName === 'object' && 'destructured' in parameterName) {
					return false;
				}
				const name = typeof parameterName === 'object' ? parameterName.rest : parameterName;
				if (name === tag.name.trim()) {
					return false;
				}
				const expectedNames = parameterNames
					.map((item, i) => typeof item === 'object' && 'destructured' in item ? topLevelTagNames[i] : item)
					.filter(item => item !== 'this')
					.map(item => typeof item === 'object' ? `...${item.rest}` : item);
				jsdoc.report(`Expected @param names to be "${expectedNames.join(', ')}". Got "${topLevelTagNames.join(', ')}".`, tag.source[0].number);
				return true;
			});
		};

		const visitor: Visitor = {};
		for (const type of functionTypes) {
			visitor[type] = check;
		}
		return visitor;
	}
};
