/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { PromptSnapshotNodeStatistics } from '../../../../prompt/src/components/components';
import { Tokenizer } from '../../../../prompt/src/tokenization';

export interface WeightedBlock {
	/**
	 * Paths use a syntax similar to JSON path, but with a few differences:
	 * - Fragments, string and number components are ignored
	 * - The same identifier can exist at the same level, and is represented as an array index ([i])
	 *   For example this prompts:
	 *     <>
	 *      <ComponentA />
	 *      <ComponentB />
	 *      <ComponentA />
	 *     </>
	 *  Would have the following paths:
	 *    $.ComponentA[0]
	 *    $.ComponentB
	 *    $.ComponentA[1]
	 */
	componentPath: string;
	type: 'prefix' | 'suffix' | 'context';
	// The original text value of the block
	value: string;
	weight: number;
	index?: number; // Optional block index, used to group context items
	nodeStatistics: PromptSnapshotNodeStatistics;
	chunks?: Set<string>;
	source?: unknown;
}
interface ElidableBlock extends WeightedBlock {
	// The number of tokens of the original value
	tokens: number;
	markedForRemoval: boolean;
}

interface LineWithPathAndTokens {
	line: string;
	componentPath: string;
	tokens: number;
}

interface PrefixElidableBlock extends ElidableBlock {
	originalIndex: number;
	lines: LineWithPathAndTokens[];
}

export interface ElidedBlock extends WeightedBlock {
	tokens: number;
	elidedValue: string;
	elidedTokens: number;
}

interface ElisionStrategy {
	elide(
		prefixBlocks: WeightedBlock[],
		prefixTokenLimit: number,
		suffixBlock: WeightedBlock,
		suffixTokenLimit: number,
		tokenizer: Tokenizer
	): { blocks: ElidedBlock[]; cycles: number };
}

/**
 * The wishlist strategy does a two-pass elision, based on prompt/src/wishlist.ts
 * - Removes blocks (of lines) with the lowest weight, ignoring blocks with a weight of 1.
 * - Adjust the total token count to fit within the limit line by line, top to bottom.
 *
 * Notice the extra `suffix*` arguments in the constructor and elide method.
 */
export class WishlistElision implements ElisionStrategy {
	elide(
		prefixBlocks: WeightedBlock[],
		prefixTokenLimit: number,
		suffixBlock: WeightedBlock,
		suffixTokenLimit: number,
		tokenizer: Tokenizer
	) {
		if (prefixTokenLimit <= 0) {
			throw new Error('Prefix limit must be greater than 0');
		}

		const [elidablePrefixBlocks, maxPrefixTokens] = this.preparePrefixBlocks(prefixBlocks, tokenizer);
		const { elidedSuffix, adjustedPrefixTokenLimit } = this.elideSuffix(
			suffixBlock,
			suffixTokenLimit,
			prefixTokenLimit,
			maxPrefixTokens,
			tokenizer
		);
		const elidedPrefix = this.elidePrefix(
			elidablePrefixBlocks,
			adjustedPrefixTokenLimit,
			maxPrefixTokens,
			tokenizer
		);

		return { blocks: [elidedSuffix, ...elidedPrefix], cycles: 1 };
	}

	private preparePrefixBlocks(blocks: WeightedBlock[], tokenizer: Tokenizer): [PrefixElidableBlock[], number] {
		let maxPrefixTokens = 0;
		// Create a set to keep track of component paths
		const componentPaths = new Set<string>();

		const elidableBlocks = blocks.map((block, index) => {
			let blockTokens = 0;
			// Update the total tokens by approximating the length of a block with the sum
			// of the lengths of its lines. Lines are split by newlines, and the newline
			// value is kept together with the line (and hence counted as a token).
			const blockLines = block.value.split(/([^\n]*\n+)/).filter(l => l !== '');
			const processedBlockLines = blockLines.map(line => {
				const tokens = tokenizer.tokenLength(line);
				blockTokens += tokens;
				maxPrefixTokens += tokens;
				return { line, componentPath: block.componentPath, tokens };
			});
			// Check if the component path is unique
			const componentPath = block.componentPath;
			if (componentPaths.has(componentPath)) {
				throw new Error(`Duplicate component path in prefix blocks: ${componentPath}`);
			}
			componentPaths.add(componentPath);
			return {
				...block,
				tokens: blockTokens,
				markedForRemoval: false,
				originalIndex: index,
				lines: processedBlockLines,
			};
		});

		return [elidableBlocks, maxPrefixTokens];
	}

	/**
	 * Special handling for the suffix, adapted from PromptWishlist.fulfill
	 * Some behaviors are different from the original implementation:
	 * - If the token limit is less than the edit distance, we don't error but just return the first tokens of the new suffix.
	 * - When using the cached suffix, we check and enforce the limit.
	 * - Remaining tokens are returned and handled by the caller, so we don't need to check the prefix nor modify limits in place.
	 */
	private elideSuffix(
		suffixBlock: WeightedBlock,
		suffixTokenLimit: number,
		prefixTokenLimit: number,
		maxPrefixTokens: number,
		tokenizer: Tokenizer
	) {
		const suffix = suffixBlock.value;
		if (suffix.length === 0 || suffixTokenLimit <= 0) {
			const elidedSuffix: ElidedBlock = {
				...suffixBlock,
				tokens: 0,
				elidedValue: '',
				elidedTokens: 0,
			};
			return {
				elidedSuffix,
				adjustedPrefixTokenLimit: prefixTokenLimit + Math.max(0, suffixTokenLimit),
			};
		}

		// Check the maximum (approximate) length of the prefix.
		// If everything fits, we give the remaining budget to the suffix instead.
		if (maxPrefixTokens < prefixTokenLimit) {
			suffixTokenLimit = suffixTokenLimit + (prefixTokenLimit - maxPrefixTokens);
			prefixTokenLimit = maxPrefixTokens;
		}

		const shortenedSuffix = tokenizer.takeFirstTokens(suffix, suffixTokenLimit);
		const elidedSuffix: ElidedBlock = {
			...suffixBlock,
			// Update the original value and tokens
			value: suffix,
			tokens: tokenizer.tokenLength(suffix),
			elidedValue: shortenedSuffix.text,
			elidedTokens: shortenedSuffix.tokens.length,
		};

		return {
			elidedSuffix,
			adjustedPrefixTokenLimit: prefixTokenLimit + Math.max(0, suffixTokenLimit - shortenedSuffix.tokens.length),
		};
	}

	private elidePrefix(
		elidablePrefixBlocks: PrefixElidableBlock[],
		tokenLimit: number,
		maxPrefixTokens: number,
		tokenizer: Tokenizer
	): ElidedBlock[] {
		const prefixBlocks = this.removeLowWeightPrefixBlocks(elidablePrefixBlocks, tokenLimit, maxPrefixTokens);

		// The nodes that are not marked for removal are split into lines, but we keep
		// track of the block they came from
		const prefixLines = prefixBlocks.filter(block => !block.markedForRemoval).flatMap(block => block.lines);

		if (prefixLines.length === 0) {
			return [];
		}

		const [trimmedLines, prefixTokens] = this.trimPrefixLinesToFit(prefixLines, tokenLimit, tokenizer);
		// Populate the final elidable blocks
		let currentPrefixTokens = prefixTokens;
		return prefixBlocks.map(block => {
			if (block.markedForRemoval) {
				// Try to re-include blocks if there's space left and they are not part of a chunk
				if (currentPrefixTokens + block.tokens <= tokenLimit && !block.chunks) {
					// This is an approximation, but we don't want to add more token operations.
					// In the wishlist, this is done using the priority list, but for simplicity we just
					// do it in order.
					currentPrefixTokens += block.tokens;
					return { ...block, elidedValue: block.value, elidedTokens: block.tokens };
				}
				return { ...block, elidedValue: '', elidedTokens: 0 };
			}

			const elidedValue = trimmedLines
				.filter(l => l.componentPath === block.componentPath && l.line !== '')
				.map(l => l.line)
				.join('');
			let elidedTokens = block.tokens;
			if (elidedValue !== block.value) {
				elidedTokens = elidedValue !== '' ? tokenizer.tokenLength(elidedValue) : 0;
			}

			return { ...block, elidedValue, elidedTokens };
		});
	}

	/**
	 * Marks blocks for removal based on their weight and the total token limit.
	 * If a block has a chunk identifier, all blocks with the same chunk will be removed together.
	 * Blocks with a weight of 1 are protected from removal.
	 */
	private removeLowWeightPrefixBlocks(
		elidablePrefixBlocks: PrefixElidableBlock[],
		tokenLimit: number,
		maxPrefixTokens: number
	): PrefixElidableBlock[] {
		let totalPrefixTokens = maxPrefixTokens;

		// Sort the blocks by weight ascending
		elidablePrefixBlocks.sort((a, b) => a.weight - b.weight);
		// Remove blocks with the lowest weight until total tokens are within the limit
		// If a block has a weight of 1, it is skipped in this step
		for (const block of elidablePrefixBlocks) {
			if (totalPrefixTokens <= tokenLimit) { break; }
			if (block.weight === 1) { continue; }

			// If block has a chunk that's already been processed, skip it
			if (block.chunks && block.markedForRemoval) { continue; }

			if (block.chunks && block.chunks.size > 0) {
				// Mark all blocks with the same chunk for removal
				for (const relatedBlock of elidablePrefixBlocks) {
					if (
						!relatedBlock.markedForRemoval &&
						relatedBlock.chunks &&
						// For nested chunks: if removing outer chunk, remove all inner chunks
						// by checking if the related block contains ALL chunk IDs from current block
						[...block.chunks].every(id => relatedBlock.chunks?.has(id))
					) {
						relatedBlock.markedForRemoval = true;
						totalPrefixTokens -= relatedBlock.tokens;
					}
				}
			} else {
				// Regular case: just mark this block for removal
				block.markedForRemoval = true;
				totalPrefixTokens -= block.tokens;
			}
		}

		// Sort the nodes by their original index
		return elidablePrefixBlocks.sort((a, b) => a.originalIndex - b.originalIndex);
	}

	private trimPrefixLinesToFit(
		linesWithComponentPath: LineWithPathAndTokens[],
		tokenLimit: number,
		tokenizer: Tokenizer
	): [LineWithPathAndTokens[], number] {
		let currentPrefixTokens = 0;

		// Create a new array to store lines that fit within the limit
		const fittingLines: typeof linesWithComponentPath = [];

		// Iterate from the end of the array
		for (let i = linesWithComponentPath.length - 1; i >= 0; i--) {
			const currentLine = linesWithComponentPath[i];
			const lineTokens = currentLine.tokens;

			// Check if adding this line would exceed the limit
			if (currentPrefixTokens + lineTokens <= tokenLimit) {
				fittingLines.unshift(currentLine); // Add to front to maintain order
				currentPrefixTokens += lineTokens;
			} else {
				break; // Stop once we exceed the limit
			}
		}

		if (fittingLines.length === 0) {
			// This can still mean that the last line (the cursor line) is too long.
			// So we try to fit the last line up to the limit.
			const lastLine = linesWithComponentPath[linesWithComponentPath.length - 1];
			if (lastLine && lastLine.line.length > 0) {
				const prompt = tokenizer.takeLastTokens(lastLine.line, tokenLimit);
				fittingLines.push({
					line: prompt.text,
					componentPath: lastLine.componentPath,
					tokens: prompt.tokens.length,
				});
				return [fittingLines, prompt.tokens.length];
			}

			const errorMsg = `Cannot fit prefix within limit of ${tokenLimit} tokens`;
			throw new Error(errorMsg);
		}
		return [fittingLines, currentPrefixTokens];
	}
}

export function makePrompt(elidedBlocks: ElidedBlock[]): string {
	return elidedBlocks.map(block => block.elidedValue).join('');
}

export function makePrefixPrompt(elidedBlocks: ElidedBlock[]): string {
	return elidedBlocks
		.filter(b => b.type === 'prefix')
		.map(block => block.elidedValue)
		.join('');
}

/**
 * Return context items grouped in blocks reflecting the prompt structure.
 */
export function makeContextPrompt(elidedBlocks: ElidedBlock[]): string[] {
	if (elidedBlocks.length === 0) {
		return [];
	}

	// Group context items by index
	const contextGroups = new Map<number, string[]>();
	for (const block of elidedBlocks) {
		// Only consider context blocks with an index
		if (block.type === 'context' && block.index !== undefined) {
			// Initialize the group
			if (!contextGroups.has(block.index)) {
				contextGroups.set(block.index, []);
			}
			// Add the trimmed value
			const trimmed = block.elidedValue.trim();
			if (trimmed.length > 0) {
				contextGroups.get(block.index)!.push(trimmed);
			}
		}
	}

	const maxIndex = Math.max(...Array.from(contextGroups.keys()), -1);

	// Create context blocks
	const contextBlocks = [];
	for (let i = 0; i <= maxIndex; i++) {
		const group = contextGroups.get(i);
		if (group && group.length > 0) {
			const value = group.join('\n').trim();
			contextBlocks.push(value);
		} else {
			// If there are no items for this index, add an empty string to maintain ordering
			contextBlocks.push('');
		}
	}

	return contextBlocks;
}
