/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Context, CreateRule, RuleMeta, Visitor } from '@oxlint/plugins';
import { JSDoc, visitAllJSDocComments } from './jsdocUtils.ts';

interface Options {
	readonly allowWhitespace?: boolean;
	readonly preventAtEnd?: boolean;
	readonly preventAtMiddleLines?: boolean;
}

const middleAsterisks = /^\*+/;
const middleAsterisksOrWhitespace = /^([\t ]|\*(?!\*))+/;
const endAsterisksSingleLine = /\*(\**)\*$/;
const endAsterisksMultipleLine = /(\**)\*$/;
const endAsterisksOrWhitespaceSingleLine = /\*((?:\*|(?: |\t))*)\*$/;
const endAsterisksOrWhitespaceMultipleLine = /((?:\*|(?: |\t))*)\*$/;

/**
 * `jsdoc/no-multi-asterisks`: the lines of a JSDoc block start with a single `*`, and the block ends with a single
 * `*\/`. Only the first such line of a block is reported. Fixed by removing the extra asterisks.
 */
export default new class NoMultiAsterisks implements CreateRule {

	readonly meta: RuleMeta = {
		type: 'suggestion',
		docs: {
			description: 'Prevents use of multiple asterisks at the beginning of lines.',
		},
		fixable: 'code',
		schema: [{
			type: 'object',
			properties: {
				allowWhitespace: { type: 'boolean' },
				preventAtEnd: { type: 'boolean' },
				preventAtMiddleLines: { type: 'boolean' },
			},
			additionalProperties: false,
		}],
	};

	create(context: Context): Visitor {
		const { allowWhitespace = false, preventAtEnd = true, preventAtMiddleLines = true } = (context.options[0] ?? {}) as Options;
		const middle = allowWhitespace ? middleAsterisks : middleAsterisksOrWhitespace;

		const check = (jsdoc: JSDoc): void => {
			for (const { number, tokens } of jsdoc.block.source) {
				const { delimiter, description, end, name, postDelimiter, tag, type } = tokens;
				if (preventAtMiddleLines && !end && !tag && !type && !name && middle.test(allowWhitespace ? postDelimiter + description : description)) {
					jsdoc.report('Should be no multiple asterisks on middle lines.', number, () => {
						tokens.description = description.replace(middle, '');
					});
					return;
				}
				if (!preventAtEnd || !end) {
					continue;
				}
				const isSingleLineBlock = delimiter === '/**';
				const delim = isSingleLineBlock ? '*' : delimiter;
				const endAsterisks = allowWhitespace
					? (isSingleLineBlock ? endAsterisksSingleLine : endAsterisksMultipleLine)
					: (isSingleLineBlock ? endAsterisksOrWhitespaceSingleLine : endAsterisksOrWhitespaceMultipleLine);
				const match = (allowWhitespace ? postDelimiter + description + delim : description + delim).match(endAsterisks);
				if (!match || (!isSingleLineBlock && match[1] && !match[1].trim())) {
					continue;
				}
				jsdoc.report('Should be no multiple asterisks on end lines.', number, () => {
					if (!isSingleLineBlock) {
						tokens.delimiter = '';
					}
					tokens.description = (description + delim).replace(endAsterisks, '');
				});
				return;
			}
		};

		return visitAllJSDocComments(context, check);
	}
};
