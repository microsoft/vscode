/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../../base/browser/dom.js';
import { CancellationTokenSource } from '../../../../../../base/common/cancellation.js';
import { hashAsync } from '../../../../../../base/common/hash.js';
import { Disposable, IReference, MutableDisposable, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../../../base/common/network.js';
import { URI } from '../../../../../../base/common/uri.js';
import { generateUuid } from '../../../../../../base/common/uuid.js';
import { ILanguageService } from '../../../../../../editor/common/languages/language.js';
import { ITextModel } from '../../../../../../editor/common/model.js';
import { IModelService } from '../../../../../../editor/common/services/model.js';
import { IResolvedTextEditorModel, ITextModelService } from '../../../../../../editor/common/services/resolverService.js';
import { ICommandService } from '../../../../../../platform/commands/common/commands.js';
import { IContextKeyService } from '../../../../../../platform/contextkey/common/contextkey.js';
import { EditorModel } from '../../../../../common/editor/editorModel.js';
import { IChatResponseViewModel } from '../../../common/model/chatViewModel.js';
import { IDisposableReference } from './chatCollections.js';
import { DiffEditorPool } from './chatContentCodePools.js';
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
		@IContextKeyService contextKeyService: IContextKeyService,
		@ICommandService commandService: ICommandService,
	) {
		super();

		this.comparePart = this._register(diffEditorPool.get());

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

		const originalModel = this.modelService.createModel(data.beforeContent, languageSelection, originalUri, false);
		const modifiedModel = this.modelService.createModel(data.afterContent, languageSelection, modifiedUri, false);
		const cts = new CancellationTokenSource();
		let referencesSettled = false;
		let disposeRequested = false;
		let didDisposeModels = false;
		const disposeModels = () => {
			if (didDisposeModels) {
				return;
			}

			didDisposeModels = true;
			originalModel.dispose();
			modifiedModel.dispose();
		};
		this._register(toDisposable(() => {
			disposeRequested = true;
			cts.dispose(true);
			if (referencesSettled) {
				disposeModels();
			}
		}));

		const modelsPromise = Promise.all([
			this.textModelService.createModelReference(originalUri),
			this.textModelService.createModelReference(modifiedUri)
		]).then(([originalRef, modifiedRef]) => {
			referencesSettled = true;
			const model = new SimpleDiffEditorModel(originalRef, modifiedRef);
			if (disposeRequested) {
				model.dispose();
				disposeModels();
				return undefined;
			}

			return model;
		}, error => {
			referencesSettled = true;
			disposeModels();
			if (disposeRequested) {
				return undefined;
			}

			throw error;
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
				if (!model) {
					return undefined;
				}

				this.modelRef.value = model;
				const diffData: ICodeCompareBlockDiffData = {
					original: model.original,
					modified: model.modified,
					originalSha1: await hashAsync(model.original.getValue()),
				};
				return diffData;
			})
		};

		this.comparePart.object.render(compareData, currentWidth, cts.token);
		this.element = this.comparePart.object.element;

		// Phone-layout shortcut: open the MobileDiffView overlay (registered in
		// vs/sessions) instead of the inline diff editor. The command id is
		// referenced by string to avoid a cross-layer import.
		//
		// Note: the inline `before`/`after` content here lives only in
		// in-memory text models (`vscodeChatCodeBlock://...`) which the mobile
		// diff view cannot read via `textFileService`. We still route the tap
		// so that the user always lands in the overlay on phone; the overlay
		// degrades to its empty/no-changes state when the URIs are unreadable.
		this._register(dom.addDisposableListener(this.element, 'click', e => {
			if (contextKeyService.getContextKeyValue<boolean>('sessionsIsPhoneLayout') !== true) {
				return;
			}
			e.preventDefault();
			e.stopPropagation();
			// Shape mirrors IFileDiffViewData in
			// vs/sessions/browser/parts/mobile/contributions/mobileDiffView.ts.
			const diff = {
				originalURI: data.codeBlockResource ?? originalUri,
				modifiedURI: data.codeBlockResource ?? modifiedUri,
				identical: false,
				added: 0,
				removed: 0,
			};
			commandService.executeCommand('sessions.mobile.openDiffView', { diff });
		}, /* useCapture */ true));
	}

	layout(width: number): void {
		this.comparePart.object.layout(width);
	}

	reset(): void {
		this.modelRef.clear();
	}
}
