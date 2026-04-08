/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
/** @jsxRuntime automatic */
/** @jsxImportSource ../../../../prompt/jsx-runtime/ */

import { ComponentStatistics, PromptSnapshotNode } from '../../../../prompt/src/components/components';
import { SnapshotWalker, WalkContextTransformer } from '../../../../prompt/src/components/walker';
import { isContextNode } from './completionsContext';
import {
	CompletionsPromptRenderer,
	normalizeLineEndings,
	transformers,
} from './completionsPromptRenderer';
import { BeforeCursor } from './currentFile';
import { ElidedBlock, makeContextPrompt, makePrefixPrompt, WeightedBlock } from './elision';

let contextIndex = 0;
function resetContextIndex() {
	contextIndex = 0;
}

function getNextContextIndex() {
	return contextIndex++;
}

export class SplitContextPromptRenderer extends CompletionsPromptRenderer {
	protected override formatPrefix: (elidedBlocks: ElidedBlock[]) => string = makePrefixPrompt;
	protected override formatContext: ((elidedBlocks: ElidedBlock[]) => string[]) | undefined = makeContextPrompt;

	override processSnapshot(
		snapshot: PromptSnapshotNode,
		delimiter: string
	): {
		prefixBlocks: WeightedBlock[];
		suffixBlock: WeightedBlock;
		componentStatistics: ComponentStatistics[];
	} {
		const prefixBlocks: WeightedBlock[] = [];
		const suffixBlocks: WeightedBlock[] = [];
		const componentStatistics: ComponentStatistics[] = [];

		// Store the status of the required prefix node
		let foundPrefix = false;

		resetContextIndex();
		const walker = new SnapshotWalker(snapshot, splitContextTransformers);
		walker.walkSnapshot((node, _parent, context) => {
			if (node === snapshot) {
				return true;
			}

			if (node.statistics.updateDataTimeMs && node.statistics.updateDataTimeMs > 0) {
				componentStatistics.push({
					componentPath: node.path,
					updateDataTimeMs: node.statistics.updateDataTimeMs,
				});
			}

			// Check for the presence of required prefix node
			if (node.name === BeforeCursor.name) {
				foundPrefix = true;
			}

			if (node.value === undefined || node.value === '') {
				// No need to process this node as it only adds whitespace
				return true;
			}

			const chunks = context.chunks as Set<string> | undefined;
			const type = context.type as string | undefined;
			if (type === 'suffix') {
				// Suffix handling: Mark the child node with content as suffix
				suffixBlocks.push({
					value: normalizeLineEndings(node.value),
					type: 'suffix',
					weight: context.weight as number,
					componentPath: node.path,
					nodeStatistics: node.statistics,
					chunks,
					source: context.source,
				});
			} else {
				const isPrefix = type === 'prefix';

				// Add delimiter to non-prefix nodes
				const nodeValueWithDelimiter =
					isPrefix || node.value.endsWith(delimiter) ? node.value : node.value + delimiter;
				prefixBlocks.push({
					type: isPrefix ? 'prefix' : 'context',
					value: normalizeLineEndings(nodeValueWithDelimiter),
					weight: context.weight as number,
					componentPath: node.path,
					nodeStatistics: node.statistics,
					chunks,
					source: context.source,
					index: isPrefix ? undefined : (context.index as number), // index only set for context nodes
				});
			}
			return true;
		});

		if (!foundPrefix) {
			throw new Error(`Node of type ${BeforeCursor.name} not found`);
		}
		if (suffixBlocks.length > 1) {
			throw new Error(`Only one suffix is allowed`);
		}

		const suffixBlock: WeightedBlock =
			suffixBlocks.length === 1
				? suffixBlocks[0]
				: {
					componentPath: '',
					value: '',
					weight: 1,
					nodeStatistics: {},
					type: 'suffix',
				};

		return { prefixBlocks, suffixBlock, componentStatistics };
	}
}

const splitContextTransformers: WalkContextTransformer[] = [
	...transformers,
	(node, _, context) => {
		if (isContextNode(node)) {
			return { ...context, index: getNextContextIndex() };
		}
		return context;
	},
];
