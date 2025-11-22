/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Emitter } from '../../../../base/common/event.js';
import { hashAsync } from '../../../../base/common/hash.js';
import { Disposable, IReference, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../base/common/network.js';
import { URI } from '../../../../base/common/uri.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { ILanguageService } from '../../../../editor/common/languages/language.js';
import { ITextModel } from '../../../../editor/common/model.js';
import { IModelService } from '../../../../editor/common/services/model.js';
import { IResolvedTextEditorModel, ITextModelService } from '../../../../editor/common/services/resolverService.js';
import { EditorModel } from '../../../common/editor/editorModel.js';
import { IChatResponseViewModel } from '../common/chatViewModel.js';
import { IDisposableReference } from './chatContentParts/chatCollections.js';
import { DiffEditorPool } from './chatContentParts/chatContentCodePools.js';
import { CodeCompareBlockPart, ICodeCompareBlockData, ICodeCompareBlockDiffData } from './codeBlockPart.js';

/**
 * Parses unified diff format into before/after content.
 * Supports standard unified diff format with - and + prefixes.
 */
export function parseUnifiedDiff(diffText: string): { before: string; after: string } {
	const lines = diffText.split('\n');
	const beforeLines: string[] = [];
	const afterLines: string[] = [];

	for (const line of lines) {
		if (line.startsWith('- ')) {
			beforeLines.push(line.substring(2));
		} else if (line.startsWith('-')) {
			beforeLines.push(line.substring(1));
		} else if (line.startsWith('+ ')) {
			afterLines.push(line.substring(2));
		} else if (line.startsWith('+')) {
			afterLines.push(line.substring(1));
		} else if (line.startsWith(' ')) {
			// Context line - appears in both
			const content = line.substring(1);
			beforeLines.push(content);
			afterLines.push(content);
		} else if (!line.startsWith('@@') && !line.startsWith('---') && !line.startsWith('+++') && !line.startsWith('diff ')) {
			// Regular line without prefix - treat as context
			beforeLines.push(line);
			afterLines.push(line);
		}
	}

	return {
		before: beforeLines.join('\n'),
		after: afterLines.join('\n')
	};
}

/**
 * Simple diff editor model for inline diffs in markdown code blocks
 */
class SimpleDiffEditorModel extends EditorModel {
	public readonly original: ITextModel;
	public readonly modified: ITextModel;

	constructor(
		private readonly _original: IReference<IResolvedTextEditorModel>,
		private readonly _modified: IReference<IResolvedTextEditorModel>,
	) {
		super();
		this.original = this._original.object.textEditorModel;
		this.modified = this._modified.object.textEditorModel;
	}

	public override dispose() {
		super.dispose();
		this._original.dispose();
		this._modified.dispose();
	}
}

export interface IMarkdownDiffBlockData {
	readonly element: IChatResponseViewModel;
	readonly codeBlockIndex: number;
	readonly languageId: string;
	readonly beforeContent: string;
	readonly afterContent: string;
	readonly codeBlockResource?: URI;
	readonly isReadOnly?: boolean;
	readonly horizontalPadding?: number;
}

/**
 * Renders a diff block from markdown content.
 * This is a lightweight wrapper that uses CodeCompareBlockPart for the actual rendering.
 */
export class MarkdownDiffBlockPart extends Disposable {
	private readonly _onDidChangeContentHeight = this._register(new Emitter<void>());
	public readonly onDidChangeContentHeight = this._onDidChangeContentHeight.event;

	readonly element: HTMLElement;
	private readonly comparePart: IDisposableReference<CodeCompareBlockPart>;
	private readonly modelRef = this._register(new MutableDisposable<SimpleDiffEditorModel>());

	constructor(
		data: IMarkdownDiffBlockData,
		diffEditorPool: DiffEditorPool,
		currentWidth: number,
		@IModelService private readonly modelService: IModelService,
		@ITextModelService private readonly textModelService: ITextModelService,
		@ILanguageService private readonly languageService: ILanguageService,
	) {
		super();

		this.comparePart = this._register(diffEditorPool.get());

		this._register(this.comparePart.object.onDidChangeContentHeight(() => {
			this._onDidChangeContentHeight.fire();
		}));

		// Create in-memory models for the diff
		const originalUri = URI.from({
			scheme: Schemas.vscodeChatCodeBlock,
			path: `/chat-diff-original-${data.codeBlockIndex}-${generateUuid()}`,
		});
		const modifiedUri = URI.from({
			scheme: Schemas.vscodeChatCodeBlock,
			path: `/chat-diff-modified-${data.codeBlockIndex}-${generateUuid()}`,
		});

		const languageSelection = this.languageService.createById(data.languageId);

		// Create the models
		this._register(this.modelService.createModel(data.beforeContent, languageSelection, originalUri, false));
		this._register(this.modelService.createModel(data.afterContent, languageSelection, modifiedUri, false));

		const modelsPromise = Promise.all([
			this.textModelService.createModelReference(originalUri),
			this.textModelService.createModelReference(modifiedUri)
		]).then(([originalRef, modifiedRef]) => {
			return new SimpleDiffEditorModel(originalRef, modifiedRef);
		});

		const compareData: ICodeCompareBlockData = {
			element: data.element,
			isReadOnly: data.isReadOnly,
			horizontalPadding: data.horizontalPadding,
			edit: {
				uri: data.codeBlockResource || modifiedUri,
				edits: [],
				kind: 'textEditGroup',
				done: true
			},
			diffData: modelsPromise.then(async model => {
				this.modelRef.value = model;
				const diffData: ICodeCompareBlockDiffData = {
					original: model.original,
					modified: model.modified,
					originalSha1: await hashAsync(model.original.getValue()),
				};
				return diffData;
			})
		};

		this.comparePart.object.render(compareData, currentWidth, CancellationToken.None);
		this.element = this.comparePart.object.element;
	}

	layout(width: number): void {
		this.comparePart.object.layout(width);
	}

	reset(): void {
		this.modelRef.clear();
	}
}
