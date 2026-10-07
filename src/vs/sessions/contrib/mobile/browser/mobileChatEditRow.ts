/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../base/common/codicons.js';
import { onUnexpectedError } from '../../../../base/common/errors.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { autorun } from '../../../../base/common/observable.js';
import { IEditorWorkerService } from '../../../../editor/common/services/editorWorker.js';
// eslint-disable-next-line local/code-translation-remind -- Experimental entry is excluded from production translation resources.
import { localize } from '../../../../nls.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ChatEditPillElement } from '../../../../workbench/contrib/chat/browser/widget/chatContentParts/chatEditPillElement.js';
import { ChatEditCompareModelFactory, IChatEditPhoneDiff, IChatEditPresentation } from '../../../../workbench/contrib/chat/browser/widget/chatContentParts/chatEditPhonePresenter.js';
import { IChatEditingService } from '../../../../workbench/contrib/chat/common/editing/chatEditingService.js';
import { IChatTextEditGroup } from '../../../../workbench/contrib/chat/common/model/chatModel.js';
import { IChatResponseViewModel } from '../../../../workbench/contrib/chat/common/model/chatViewModel.js';

/** A mobile edit row; compare models stay owned by the shared editing services. */
export class MobileChatEditRow extends Disposable implements IChatEditPresentation {
	readonly domNode: HTMLElement;

	constructor(
		edit: IChatTextEditGroup,
		response: IChatResponseViewModel,
		createModel: ChatEditCompareModelFactory,
		openDiff: (diff: IChatEditPhoneDiff) => Promise<boolean>,
		@IInstantiationService instantiationService: IInstantiationService,
		@IEditorWorkerService editorWorkerService: IEditorWorkerService,
		@IChatEditingService chatEditingService: IChatEditingService,
	) {
		super();
		const pill = this._register(instantiationService.createInstance(ChatEditPillElement));
		this.domNode = pill.element;
		pill.setUri(edit.uri);
		pill.setStatus(Codicon.diff, localize('edited', "Edited"));
		pill.setProgressFill(undefined);
		pill.setLabelDetail('');

		// Prefer the pre-edit snapshot: the live file may already include these edits.
		const entry = chatEditingService.getEditingSession(response.sessionResource)?.getEntry(edit.uri);
		if (entry) {
			if (entry.linesAdded && entry.linesRemoved) {
				const { linesAdded, linesRemoved } = entry;
				this._register(autorun(reader => pill.setDiff({ added: linesAdded.read(reader), removed: linesRemoved.read(reader) })));
			}
			this._register(pill.onDidClick(() => {
				void openDiff({
					uri: edit.uri, originalURI: entry.originalURI, modifiedURI: entry.modifiedURI,
					added: entry.linesAdded?.get() ?? 0, removed: entry.linesRemoved?.get() ?? 0,
				}).catch(onUnexpectedError);
			}));
			return;
		}

		const models = createModel().then(reference => {
			if (this._store.isDisposed) {
				reference.dispose();
				return undefined;
			}
			return this._register(reference).object;
		});
		let stats = { added: 0, removed: 0 };
		void models.then(async models => {
			if (!models) {
				return;
			}
			const diff = await editorWorkerService.computeDiff(models.original.textEditorModel.uri, models.modified.textEditorModel.uri, {
				ignoreTrimWhitespace: false, maxComputationTimeMs: 1000, computeMoves: false,
			}, 'advanced');
			if (!diff || this._store.isDisposed) {
				return;
			}
			stats = diff.changes.reduce((counts, change) => ({
				added: counts.added + change.modified.length,
				removed: counts.removed + change.original.length,
			}), { added: 0, removed: 0 });
			pill.setDiff(stats);
		}).catch(onUnexpectedError);
		this._register(pill.onDidClick(() => {
			void models.then(models => {
				if (models && !this._store.isDisposed) {
					return openDiff({
						uri: edit.uri, originalURI: models.original.textEditorModel.uri,
						modifiedURI: models.modified.textEditorModel.uri, ...stats,
					});
				}
				return undefined;
			}).catch(onUnexpectedError);
		}));
	}
}
