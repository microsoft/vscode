/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ArrayQueue } from 'vs/base/common/arrays';
import { BugIndicatingError } from 'vs/base/common/errors';
import { Disposable, DisposableStore, IDisposable } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import { Position } from 'vs/editor/common/core/position';
import { ITextModel } from 'vs/editor/common/model';
import { IModelService } from 'vs/editor/common/services/model';
import { LineRange } from 'vs/workbench/contrib/mergeEditor/browser/model/lineRange';

export class TextModelProjection extends Disposable {
	private static counter: number = 0;

	public static create(
		sourceDocument: ITextModel,
		projectionConfiguration: ProjectionConfiguration,
		modelService: IModelService
	): TextModelProjection {
		const textModel = TextModelProjection.createModelReference(
			modelService
		);
		return new TextModelProjection(textModel, sourceDocument, { dispose: () => { } }, projectionConfiguration);
	}

	public static createForTargetDocument(
		sourceDocument: ITextModel,
		projectionConfiguration: ProjectionConfiguration,
		targetDocument: ITextModel,
	): TextModelProjection {
		return new TextModelProjection(targetDocument, sourceDocument, new DisposableStore(), projectionConfiguration);
	}

	private static createModelReference(
		modelService: IModelService
	): ITextModel {
		const uri = URI.from({
			scheme: 'projected-text-model',
			path: `/projection${TextModelProjection.counter++}`,
		});

		return modelService.createModel('', null, uri, false);
	}

	private currentBlocks: Block[];

	constructor(
		public readonly targetDocument: ITextModel,
		private readonly sourceDocument: ITextModel,
		disposable: IDisposable,
		projectionConfiguration: ProjectionConfiguration
	) {
		super();

		this._register(disposable);

		const result = getBlocks(sourceDocument, projectionConfiguration);
		this.currentBlocks = result.blocks;
		targetDocument.setValue(result.transformedContent);

		this._register(
			sourceDocument.onDidChangeContent((c) => {
				// TODO improve this
				const result = getBlocks(sourceDocument, projectionConfiguration);
				this.currentBlocks = result.blocks;
				targetDocument.setValue(result.transformedContent);
			})
		);
	}

	/**
	 * The created transformer can only be called with monotonically increasing positions.
	 */
	createMonotonousReverseTransformer(): Transformer {
		let lineDelta = 0;
		const blockQueue = new ArrayQueue(this.currentBlocks);
		let lastLineNumber = 0;
		const sourceDocument = this.sourceDocument;
		return {
			transform(position) {
				if (position.lineNumber < lastLineNumber) {
					throw new BugIndicatingError();
				}
				lastLineNumber = position.lineNumber;

				while (true) {
					const next = blockQueue.peek();
					if (!next) {
						break;
					}
					if (position.lineNumber + lineDelta > next.lineRange.startLineNumber) {
						blockQueue.dequeue();
						lineDelta += next.lineRange.lineCount - 1;
					} else if (position.lineNumber + lineDelta === next.lineRange.startLineNumber && position.column === 2) {
						const targetLineNumber = position.lineNumber + lineDelta + next.lineRange.lineCount - 1;
						return new Position(targetLineNumber, sourceDocument.getLineMaxColumn(targetLineNumber));
					} else {
						break;
					}
				}

				// Column number never changes
				return new Position(position.lineNumber + lineDelta, position.column);
			},
		};
	}
}

function getBlocks(document: ITextModel, configuration: ProjectionConfiguration): { blocks: Block[]; transformedContent: string } {
	const blocks: Block[] = [];
	const transformedContent: string[] = [];

	let inBlock = false;
	let startLineNumber = -1;
	let curLine = 0;

	for (const line of document.getLinesContent()) {
		curLine++;
		if (!inBlock) {
			if (line.startsWith(configuration.blockToRemoveStartLinePrefix)) {
				inBlock = true;
				startLineNumber = curLine;
			} else {
				transformedContent.push(line);
			}
		} else {
			if (line.startsWith(configuration.blockToRemoveEndLinePrefix)) {
				inBlock = false;
				blocks.push(new Block(new LineRange(startLineNumber, curLine - startLineNumber + 1)));
				// We add a (hopefully) unique symbol so that diffing recognizes the deleted block (HEXAGRAM FOR CONFLICT)
				// allow-any-unicode-next-line
				transformedContent.push('䷅');
			}
		}
	}

	return {
		blocks,
		transformedContent: transformedContent.join('\n')
	};
}

class Block {
	constructor(public readonly lineRange: LineRange) { }
}

interface ProjectionConfiguration {
	blockToRemoveStartLinePrefix: string;
	blockToRemoveEndLinePrefix: string;
}

interface Transformer {
	transform(position: Position): Position;
}
