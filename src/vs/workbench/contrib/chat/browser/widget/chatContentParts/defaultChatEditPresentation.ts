/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationTokenSource } from '../../../../../../base/common/cancellation.js';
import { Disposable, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { ITextModelService } from '../../../../../../editor/common/services/resolverService.js';
import { IOpenEditorOptions } from '../../../../../../platform/editor/browser/editor.js';
import { IEditorService, SIDE_GROUP } from '../../../../../services/editor/common/editorService.js';
import { IChatExternalEdit } from '../../../common/chatService/chatService.js';
import { IChatTextEditGroup } from '../../../common/model/chatModel.js';
import { IChatResponseViewModel } from '../../../common/model/chatViewModel.js';
import { IDisposableReference } from './chatCollections.js';
import { DiffEditorPool } from './chatContentCodePools.js';
import { ChatEditCompareModelFactory, IChatEditPresentation, IChatEditPresentationService } from './chatEditPresentation.js';
import { isResourceContentEmpty } from './chatEditPillElement.js';
import { CodeCompareBlockPart, ICodeCompareBlockData, ICodeCompareBlockDiffData } from './codeBlockPart.js';

export class DefaultChatEditPresentationService implements IChatEditPresentationService {
	declare readonly _serviceBrand: undefined;

	constructor(
		@IEditorService private readonly editorService: IEditorService,
		@ITextModelService private readonly textModelService: ITextModelService,
	) { }

	renderTextEdit(edit: IChatTextEditGroup, response: IChatResponseViewModel, createModel: ChatEditCompareModelFactory, diffEditorPool: DiffEditorPool, width: number): IChatEditPresentation {
		return new DefaultChatTextEditPresentation(edit, response, createModel, diffEditorPool, width);
	}

	async openExternalEdit(edit: IChatExternalEdit, { editorOptions: options, openToSide }: IOpenEditorOptions): Promise<void> {
		const group = openToSide ? SIDE_GROUP : undefined;
		if (edit.beforeContentUri && edit.afterContentUri) {
			if (edit.editKind === 'edit' && (edit.diff?.removed ?? 0) === 0 && await isResourceContentEmpty(this.textModelService, edit.beforeContentUri)) {
				await this.editorService.openEditor({ resource: edit.uri, options }, group);
				return;
			}
			await this.editorService.openEditor({
				original: { resource: edit.beforeContentUri },
				modified: { resource: edit.afterContentUri },
				options,
			}, group);
		} else if (edit.editKind === 'delete' && edit.beforeContentUri) {
			await this.editorService.openEditor({ resource: edit.beforeContentUri, options }, group);
		} else if (edit.editKind !== 'delete') {
			await this.editorService.openEditor({ resource: edit.uri, options }, group);
		}
	}
}

class DefaultChatTextEditPresentation extends Disposable implements IChatEditPresentation {
	readonly domNode: HTMLElement;
	private readonly comparePart: IDisposableReference<CodeCompareBlockPart>;

	constructor(edit: IChatTextEditGroup, element: IChatResponseViewModel, createModel: ChatEditCompareModelFactory, diffEditorPool: DiffEditorPool, width: number) {
		super();
		const cts = new CancellationTokenSource();
		this._register(toDisposable(() => cts.dispose(true)));
		this.comparePart = this._register(diffEditorPool.get());

		const data: ICodeCompareBlockData = {
			element,
			edit,
			diffData: (async () => {
				const ref = await createModel();
				if (this._store.isDisposed) {
					ref.dispose();
					return;
				}
				this._register(ref);
				return {
					modified: ref.object.modified.textEditorModel,
					original: ref.object.original.textEditorModel,
					originalSha1: ref.object.originalSha1,
				} satisfies ICodeCompareBlockDiffData;
			})(),
		};
		this.comparePart.object.render(data, width, cts.token);
		this.domNode = this.comparePart.object.element;
	}

	layout(width: number): void {
		this.comparePart.object.layout(width);
	}
}
