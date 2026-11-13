/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Context, CreateRule, RuleMeta, Visitor } from '@oxlint/plugins';
import { JSDoc, seedTokens, visitAllJSDocComments, type Block, type Line } from './jsdocUtils.ts';

/**
 * Removes the line `offset` of the lines of tag `tagIndex` from the block, or clears it if it ends the block.
 */
function removeTagLine(block: Block, tagIndex: number, offset: number): void {
	const tagSource = block.tags[tagIndex].source;
	const firstNumber = block.source[0].number;
	const sourceIndex = block.source.findIndex(line => line.number === tagSource[0].number);
	if (sourceIndex === -1) {
		return;
	}
	let spliceCount = 1;
	for (const { tokens } of tagSource.slice(1)) {
		if (tokens.tag || tokens.end) {
			break;
		}
		spliceCount++;
	}
	const spliceIndex = sourceIndex + offset;
	const { tokens } = block.source[spliceIndex];
	if ((spliceIndex === 0 && block.tags.length >= 2) || tokens.end || tokens.delimiter === '/**') {
		Object.assign(tokens, { postDelimiter: '', tag: '', postTag: '', type: '', postType: '', name: '', postName: '', description: '' });
	} else {
		const count = spliceCount - offset + (spliceIndex ? 0 : block.source.length);
		block.source.splice(spliceIndex, count);
		tagSource.splice(offset, count);
	}
	block.source.slice(sourceIndex).forEach((line, i) => line.number = firstNumber + sourceIndex + i);
}

/**
 * Returns the description of a block, with a line break per line, and the index of its last line.
 */
function getDescription(block: Block): { description: string; lastDescriptionLine: number } {
	const descriptions: string[] = [];
	let lastDescriptionLine = 0;
	let tagsBegun = false;
	block.source.some(({ tokens: { description, end, tag } }, index) => {
		if (tag) {
			tagsBegun = true;
		}
		if (index && (tag || end)) {
			lastDescriptionLine = index - 1;
			if (!tagsBegun && description) {
				descriptions.push(description);
			}
			return true;
		}
		if (!tagsBegun && (index || description)) {
			descriptions.push(description || (descriptions.length ? '' : '\n'));
		}
		return false;
	});
	return { description: descriptions.join('\n'), lastDescriptionLine };
}

/**
 * Removes the last `count` lines of the description of a block (not counting its first line).
 */
function removeTrailingDescriptionLines(block: Block, count: number): void {
	const descriptions: string[] = [];
	const postDelimiters: string[] = [];
	let startIndex: number | undefined;
	let endIndex: number | undefined;
	let info: Pick<Line['tokens'], 'start' | 'delimiter' | 'postDelimiter'> | undefined;
	block.source.some(({ tokens: { delimiter, description, end, postDelimiter, start, tag } }, index) => {
		if (delimiter === '/**') {
			return false;
		}
		if (startIndex === undefined) {
			startIndex = index;
			info = { delimiter, postDelimiter, start };
		}
		if (tag || end) {
			endIndex = index;
			return true;
		}
		postDelimiters.push(postDelimiter);
		descriptions.push(description);
		return false;
	});
	if (descriptions.length) {
		const lines = descriptions.slice(0, -count).map((description, i): Line => ({
			number: 0,
			source: '',
			tokens: seedTokens({ ...info, description, postDelimiter: postDelimiters[i] }),
		}));
		block.source.splice(startIndex!, endIndex! - startIndex!, ...lines);
	}
}

/**
 * `jsdoc/tag-lines` with its default options (`'never'`, `{ startLines: 0 }`): there are no empty lines after a tag,
 * nor between the description of a block and its tags. Fixed by removing the lines.
 */
export default new class TagLines implements CreateRule {

	readonly meta: RuleMeta = {
		type: 'suggestion',
		docs: {
			description: 'Enforces lines (or no lines) before, after, or between tags.',
		},
		fixable: 'code',
		schema: [],
	};

	create(context: Context): Visitor {
		const check = (jsdoc: JSDoc): void => {
			const block = jsdoc.block;
			block.tags.some((tag, tagIndex) => {
				let reportIndex: number | undefined;
				tag.source.forEach(({ tokens: { description, end, name, tag, type } }, index) => {
					if (description) {
						reportIndex = undefined;
					}
					if (!tag && !name && !type && !description && !end) {
						reportIndex = index;
					}
				});
				if (reportIndex === undefined) {
					return false;
				}
				const offset = reportIndex;
				jsdoc.report('Expected no lines between tags', tag.source[0].number + 1, () => removeTagLine(block, tagIndex, offset));
				return true;
			});

			if (!block.tags.length) {
				return;
			}
			const { description, lastDescriptionLine } = getDescription(block);
			if (!/\S/.test(description)) {
				return;
			}
			const trailingLines = /\n+$/.exec(description)?.[0].length ?? 0;
			if (trailingLines > 0) {
				jsdoc.report('Expected only 0 lines after block description', lastDescriptionLine - trailingLines, () => removeTrailingDescriptionLines(block, trailingLines));
			}
		};

		return visitAllJSDocComments(context, check);
	}
};
