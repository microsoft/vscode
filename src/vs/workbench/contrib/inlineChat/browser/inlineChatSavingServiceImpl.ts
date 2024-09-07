/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Queue, raceCancellation } from '../../../../base/common/async.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { DisposableStore, IDisposable, MutableDisposable, combinedDisposable, dispose } from '../../../../base/common/lifecycle.js';
import { ICodeEditor, isCodeEditor } from '../../../../editor/browser/editorBrowser.js';
import { localize } from '../../../../nls.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IProgress, IProgressStep } from '../../../../platform/progress/common/progress.js';
import { SaveReason } from '../../../common/editor.js';
import { Session } from './inlineChatSession.js';
import { IInlineChatSessionService } from './inlineChatSessionService.js';
import { InlineChatConfigKeys } from '../common/inlineChat.js';
import { GroupsOrder, IEditorGroup, IEditorGroupsService } from '../../../services/editor/common/editorGroupsService.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { IFilesConfigurationService } from '../../../services/filesConfiguration/common/filesConfigurationService.js';
import { ITextFileService } from '../../../services/textfile/common/textfiles.js';
import { IInlineChatSavingService } from './inlineChatSavingService.js';
import { Iterable } from '../../../../base/common/iterator.js';
import { IResourceEditorInput } from '../../../../platform/editor/common/editor.js';
import { Schemas } from '../../../../base/common/network.js';
import { CellUri } from '../../notebook/common/notebookCommon.js';
import { getNotebookEditorFromEditorPane } from '../../notebook/browser/notebookBrowser.js';
import { compare } from '../../../../base/common/strings.js';
import { IWorkingCopyFileService } from '../../../services/workingCopy/common/workingCopyFileService.js';
import { URI } from '../../../../base/common/uri.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { Event } from '../../../../base/common/event.js';
import { InlineChatController } from './inlineChatController.js';

interface SessionData {
	readonly resourceUri: URI;
	readonly dispose: () => void;
	readonly session: Session;
	readonly groupCandidate: IEditorGroup;
}

export class InlineChatSavingServiceImpl implements IInlineChatSavingService {

	declare readonly _serviceBrand: undefined;

	private readonly _store = new DisposableStore();
	private readonly _saveParticipant = this._store.add(new MutableDisposable());
	private readonly _sessionData = new Map<Session, SessionData>();

	constructor(
		@IFilesConfigurationService private readonly _fileConfigService: IFilesConfigurationService,
		@IEditorGroupsService private readonly _editorGroupService: IEditorGroupsService,
		@ITextFileService private readonly _textFileService: ITextFileService,
		@IEditorService private readonly _editorService: IEditorService,
		@IInlineChatSessionService private readonly _inlineChatSessionService: IInlineChatSessionService,
		@IConfigurationService private readonly _configService: IConfigurationService,
		@IWorkingCopyFileService private readonly _workingCopyFileService: IWorkingCopyFileService,
		@ILogService private readonly _logService: ILogService,
	) {
		this._store.add(Event.any(_inlineChatSessionService.onDidEndSession, _inlineChatSessionService.onDidStashSession)(e => {
			this._sessionData.get(e.session)?.dispose();
		}));
	}

	dispose(): void {
		this._store.dispose();
		dispose(this._sessionData.values());
	}

	markChanged(session: Session): void {
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

		if (!this._configService.getValue<boolean>(InlineChatConfigKeys.AcceptedOrDiscardBeforeSave)) {
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

		progress.report({
			message: sessions.size === 1
				? localize('inlineChat', "Waiting for Inline Chat changes to be Accepted or Discarded...")
				: localize('inlineChat.N', "Waiting for Inline Chat changes in {0} editors to be Accepted or Discarded...", sessions.size)
		});

		// reveal all sessions in order and also show dangling sessions
		const { groups, orphans } = this._getGroupsAndOrphans(sessions.values());
		const editorsOpenedAndSessionsEnded = this._openAndWait(groups, token).then(() => {
			if (token.isCancellationRequested) {
				return;
			}
			return this._openAndWait(Iterable.map(orphans, s => [this._editorGroupService.activeGroup, s]), token);
		});

		// fallback: resolve when all sessions for this model have been resolved. this is independent of the editor opening
		const allSessionsEnded = this._whenSessionsEnded(Iterable.concat(groups.map(tuple => tuple[1]), orphans), token);

		await Promise.race([allSessionsEnded, editorsOpenedAndSessionsEnded]);
	}

	private _getGroupsAndOrphans(sessions: Iterable<SessionData>) {

		const groupByEditor = new Map<ICodeEditor, IEditorGroup>();
		for (const group of this._editorGroupService.getGroups(GroupsOrder.MOST_RECENTLY_ACTIVE)) {
			const candidate = group.activeEditorPane?.getControl();
			if (isCodeEditor(candidate)) {
				groupByEditor.set(candidate, group);
			}
		}

		const groups: [IEditorGroup, SessionData][] = [];
		const orphans = new Set<SessionData>();

		for (const data of sessions) {

			const editor = this._inlineChatSessionService.getCodeEditor(data.session);
			const group = groupByEditor.get(editor);
			if (group) {
				// there is only one session per group because all sessions have the same model
				// because we save one file.
				groups.push([group, data]);
			} else if (this._editorGroupService.groups.includes(data.groupCandidate)) {
				// the group candidate is still there. use it
				groups.push([data.groupCandidate, data]);
			} else {
				orphans.add(data);
			}
		}
		return { groups, orphans };
	}

	private async _openAndWait(groups: Iterable<[IEditorGroup, SessionData]>, token: CancellationToken) {

		const dataByGroup = new Map<IEditorGroup, SessionData[]>();
		for (const [group, data] of groups) {
			let array = dataByGroup.get(group);
			if (!array) {
				array = [];
				dataByGroup.set(group, array);
			}
			array.push(data);
		}

		for (const [group, array] of dataByGroup) {

			if (token.isCancellationRequested) {
				break;
			}

			array.sort((a, b) => compare(a.session.targetUri.toString(), b.session.targetUri.toString()));


			for (const data of array) {

				const input: IResourceEditorInput = { resource: data.resourceUri };
				const pane = await this._editorService.openEditor(input, group);
				let editor: ICodeEditor | undefined;
				if (data.session.targetUri.scheme === Schemas.vscodeNotebookCell) {
					const notebookEditor = getNotebookEditorFromEditorPane(pane);
					const uriData = CellUri.parse(data.session.targetUri);
					if (notebookEditor && notebookEditor.hasModel() && uriData) {
						const cell = notebookEditor.getCellByHandle(uriData.handle);
						if (cell) {
							await notebookEditor.revealRangeInCenterIfOutsideViewportAsync(cell, data.session.wholeRange.value);
						}
						const tuple = notebookEditor.codeEditors.find(tuple => tuple[1].getModel()?.uri.toString() === data.session.targetUri.toString());
						editor = tuple?.[1];
					}

				} else {
					if (isCodeEditor(pane?.getControl())) {
						editor = <ICodeEditor>pane.getControl();
					}
				}

				if (!editor) {
					// PANIC
					break;
				}
				this._inlineChatSessionService.moveSession(data.session, editor);
				InlineChatController.get(editor)?.showSaveHint();
				this._logService.info('WAIT for session to end', editor.getId(), data.session.targetUri.toString());
				await this._whenSessionsEnded(Iterable.single(data), token);
			}
		}
	}

	private async _whenSessionsEnded(iterable: Iterable<SessionData>, token: CancellationToken) {

		const sessions = new Map<Session, SessionData>();
		for (const item of iterable) {
			sessions.set(item.session, item);
		}

		if (sessions.size === 0) {
			// nothing to do
			return;
		}

		let listener: IDisposable | undefined;

		const whenEnded = new Promise<void>(resolve => {
			listener = Event.any(this._inlineChatSessionService.onDidEndSession, this._inlineChatSessionService.onDidStashSession)(e => {
				const data = sessions.get(e.session);
				if (data) {
					data.dispose();
					sessions.delete(e.session);
					if (sessions.size === 0) {
						resolve(); // DONE, release waiting
					}
				}
			});
		});

		try {
			await raceCancellation(whenEnded, token);
		} finally {
			listener?.dispose();
		}
	}
}
