/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Queue } from '../../../../base/common/async.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { DisposableStore, MutableDisposable, combinedDisposable, dispose } from '../../../../base/common/lifecycle.js';
import { localize } from '../../../../nls.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IProgress, IProgressStep } from '../../../../platform/progress/common/progress.js';
import { SaveReason } from '../../../common/editor.js';
import { Session } from './inlineChatSession.js';
import { IInlineChatSessionService } from './inlineChatSessionService.js';
import { InlineChatConfigKeys } from '../common/inlineChat.js';
import { IEditorGroup, IEditorGroupsService } from '../../../services/editor/common/editorGroupsService.js';
import { IFilesConfigurationService } from '../../../services/filesConfiguration/common/filesConfigurationService.js';
import { ITextFileService } from '../../../services/textfile/common/textfiles.js';
import { IInlineChatSavingService } from './inlineChatSavingService.js';
import { Iterable } from '../../../../base/common/iterator.js';
import { Schemas } from '../../../../base/common/network.js';
import { CellUri } from '../../notebook/common/notebookCommon.js';
import { IWorkingCopyFileService } from '../../../services/workingCopy/common/workingCopyFileService.js';
import { URI } from '../../../../base/common/uri.js';
import { Event } from '../../../../base/common/event.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { ILabelService } from '../../../../platform/label/common/label.js';
import { CancellationError } from '../../../../base/common/errors.js';

interface SessionData {
	readonly resourceUri: URI;
	readonly dispose: () => void;
	readonly session: Session;
	readonly groupCandidate: IEditorGroup;
}

// TODO@jrieken this duplicates a config key
const key = 'chat.editing.alwaysSaveWithGeneratedChanges';

export class InlineChatSavingServiceImpl implements IInlineChatSavingService {

	declare readonly _serviceBrand: undefined;

	private readonly _store = new DisposableStore();
	private readonly _saveParticipant = this._store.add(new MutableDisposable());
	private readonly _sessionData = new Map<Session, SessionData>();

	constructor(
		@IFilesConfigurationService private readonly _fileConfigService: IFilesConfigurationService,
		@IEditorGroupsService private readonly _editorGroupService: IEditorGroupsService,
		@ITextFileService private readonly _textFileService: ITextFileService,
		@IInlineChatSessionService _inlineChatSessionService: IInlineChatSessionService,
		@IConfigurationService private readonly _configService: IConfigurationService,
		@IWorkingCopyFileService private readonly _workingCopyFileService: IWorkingCopyFileService,
		@IDialogService private readonly _dialogService: IDialogService,
		@ILabelService private readonly _labelService: ILabelService,
	) {
		this._store.add(Event.any(_inlineChatSessionService.onDidEndSession, _inlineChatSessionService.onDidStashSession)(e => {
			this._sessionData.get(e.session)?.dispose();
		}));

		this._store.add(_configService.onDidChangeConfiguration(e => {
			if (!e.affectsConfiguration(key) && !e.affectsConfiguration(InlineChatConfigKeys.AcceptedOrDiscardBeforeSave)) {
				return;
			}
			if (this._isDisabled()) {
				dispose(this._sessionData.values());
				this._sessionData.clear();
			}
		}));
	}

	dispose(): void {
		this._store.dispose();
		dispose(this._sessionData.values());
	}

	markChanged(session: Session): void {

		if (this._isDisabled()) {
			return;
		}

		if (!this._sessionData.has(session)) {

			let uri = session.targetUri;

			// notebooks: use the notebook-uri because saving happens on the notebook-level
			if (uri.scheme === Schemas.vscodeNotebookCell) {
				const data = CellUri.parse(uri);
				if (!data) {
					return;
				}
				uri = data?.notebook;
			}

			if (this._sessionData.size === 0) {
				this._installSaveParticpant();
			}

			const saveConfigOverride = this._fileConfigService.disableAutoSave(uri);
			this._sessionData.set(session, {
				resourceUri: uri,
				groupCandidate: this._editorGroupService.activeGroup,
				session,
				dispose: () => {
					saveConfigOverride.dispose();
					this._sessionData.delete(session);
					if (this._sessionData.size === 0) {
						this._saveParticipant.clear();
					}
				}
			});
		}
	}

	private _installSaveParticpant(): void {

		const queue = new Queue<void>();

		const d1 = this._textFileService.files.addSaveParticipant({
			participate: (model, ctx, progress, token) => {
				return queue.queue(() => this._participate(ctx.savedFrom ?? model.textEditorModel?.uri, ctx.reason, progress, token));
			}
		});
		const d2 = this._workingCopyFileService.addSaveParticipant({
			participate: (workingCopy, ctx, progress, token) => {
				return queue.queue(() => this._participate(ctx.savedFrom ?? workingCopy.resource, ctx.reason, progress, token));
			}
		});
		this._saveParticipant.value = combinedDisposable(d1, d2, queue);
	}

	private async _participate(uri: URI | undefined, reason: SaveReason, progress: IProgress<IProgressStep>, token: CancellationToken): Promise<void> {


		if (reason !== SaveReason.EXPLICIT) {
			// all saves that we are concerned about are explicit
			// because we have disabled auto-save for them
			return;
		}

		if (this._isDisabled()) {
			// disabled
			return;
		}

		const sessions = new Map<Session, SessionData>();
		for (const [session, data] of this._sessionData) {
			if (uri?.toString() === data.resourceUri.toString()) {
				sessions.set(session, data);
			}
		}

		if (sessions.size === 0) {
			return;
		}

		let message: string;

		if (sessions.size === 1) {
			const session = Iterable.first(sessions.values())!.session;
			const agentName = session.agent.fullName;
			const filelabel = this._labelService.getUriBasenameLabel(session.textModelN.uri);

			message = localize('message.1', "Do you want to save the changes {0} made in {1}?", agentName, filelabel);
		} else {
			const labels = Array.from(Iterable.map(sessions.values(), i => this._labelService.getUriBasenameLabel(i.session.textModelN.uri)));
			message = localize('message.2', "Do you want to save the changes inline chat made in {0}?", labels.join(', '));
		}

		const result = await this._dialogService.confirm({
			message,
			detail: localize('detail', "AI-generated changes may be incorrect and should be reviewed before saving."),
			primaryButton: localize('save', "Save"),
			cancelButton: localize('discard', "Cancel"),
			checkbox: {
				label: localize('config', "Always save with AI-generated changes without asking"),
				checked: false
			}
		});

		if (!result.confirmed) {
			// cancel the save
			throw new CancellationError();
		}

		if (result.checkboxChecked) {
			// remember choice
			this._configService.updateValue(key, true);
		}
	}

	private _isDisabled() {
		return this._configService.getValue<boolean>(InlineChatConfigKeys.AcceptedOrDiscardBeforeSave) === true || this._configService.getValue(key);
	}
}
