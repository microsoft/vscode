/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { raceCancellation } from 'vs/base/common/async';
import { CancellationToken } from 'vs/base/common/cancellation';
import { DisposableStore, IDisposable, MutableDisposable, dispose } from 'vs/base/common/lifecycle';
import { ICodeEditor, isCodeEditor } from 'vs/editor/browser/editorBrowser';
import { ITextModel } from 'vs/editor/common/model';
import { localize } from 'vs/nls';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IProgress, IProgressStep } from 'vs/platform/progress/common/progress';
import { DEFAULT_EDITOR_ASSOCIATION, SaveReason } from 'vs/workbench/common/editor';
import { Session } from 'vs/workbench/contrib/inlineChat/browser/inlineChatSession';
import { IInlineChatSessionService } from './inlineChatSessionService';
import { InlineChatConfigKeys } from 'vs/workbench/contrib/inlineChat/common/inlineChat';
import { GroupsOrder, IEditorGroup, IEditorGroupsService } from 'vs/workbench/services/editor/common/editorGroupsService';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IFilesConfigurationService } from 'vs/workbench/services/filesConfiguration/common/filesConfigurationService';
import { ITextFileService } from 'vs/workbench/services/textfile/common/textfiles';
import { IInlineChatSavingService } from './inlineChatSavingService';
import { Iterable } from 'vs/base/common/iterator';
import { IResourceEditorInput } from 'vs/platform/editor/common/editor';

interface SessionData {
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
	) {
		this._store.add(_inlineChatSessionService.onDidEndSession(e => {
			this._sessionData.get(e.session)?.dispose();
		}));
	}

	dispose(): void {
		this._store.dispose();
		dispose(this._sessionData.values());
	}

	markChanged(session: Session): void {
		if (!this._sessionData.has(session)) {

			if (this._sessionData.size === 0) {
				this._installSaveParticpant();
			}

			const saveConfig = this._fileConfigService.disableAutoSave(session.textModelN.uri);
			this._sessionData.set(session, {
				groupCandidate: this._editorGroupService.activeGroup,
				session,
				dispose: () => {
					saveConfig.dispose();
					this._sessionData.delete(session);
					if (this._sessionData.size === 0) {
						this._saveParticipant.clear();
					}
				}
			});
		}
	}

	private _installSaveParticpant(): void {
		this._saveParticipant.value = this._textFileService.files.addSaveParticipant({
			participate: (model, context, progress, token) => this._participate(model.textEditorModel, context.reason, progress, token)
		});
	}

	private async _participate(model: ITextModel | null, reason: SaveReason, progress: IProgress<IProgressStep>, token: CancellationToken): Promise<void> {

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
			if (model === session.textModelN) {
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
		const allSessionsEnded = this._waitForSessions(Iterable.concat(groups.values(), orphans), token);

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

		const groups = new Map<IEditorGroup, SessionData>();
		const orphans = new Set<SessionData>();

		for (const data of sessions) {
			const editor = this._inlineChatSessionService.getCodeEditor(data.session);
			const group = groupByEditor.get(editor);
			if (group) {
				// there is only one session per group because all sessions have the same model
				// because we save one file.
				groups.set(group, data);
			} else if (this._editorGroupService.groups.includes(data.groupCandidate)) {
				// the group candidate is still there. use it
				groups.set(data.groupCandidate, data);
			} else {
				orphans.add(data);
			}
		}
		return { groups, orphans };
	}

	private async _openAndWait(groups: Iterable<[IEditorGroup, SessionData]>, token: CancellationToken) {
		const sessions = new Set<SessionData>();
		for (const [group, data] of groups) {
			const input: IResourceEditorInput = { resource: data.session.textModelN.uri, options: { override: DEFAULT_EDITOR_ASSOCIATION.id } };
			const pane = await this._editorService.openEditor(input, group);
			const ctrl = pane?.getControl();
			if (!isCodeEditor(ctrl)) {
				// PANIC
				return;
			}
			this._inlineChatSessionService.moveSession(data.session, ctrl);
			sessions.add(data);
		}
		await this._waitForSessions(sessions, token);
	}

	private async _waitForSessions(iterable: Iterable<SessionData>, token: CancellationToken) {

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
			listener = this._inlineChatSessionService.onDidEndSession(e => {
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
