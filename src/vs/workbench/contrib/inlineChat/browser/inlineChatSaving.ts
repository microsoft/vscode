/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { raceCancellation } from 'vs/base/common/async';
import { CancellationToken } from 'vs/base/common/cancellation';
import { DisposableStore, MutableDisposable, dispose } from 'vs/base/common/lifecycle';
import { getCodeEditor } from 'vs/editor/browser/editorBrowser';
import { ITextModel } from 'vs/editor/common/model';
import { localize } from 'vs/nls';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IProgress, IProgressStep } from 'vs/platform/progress/common/progress';
import { DEFAULT_EDITOR_ASSOCIATION, SaveReason } from 'vs/workbench/common/editor';
import { IInlineChatSessionService, Session } from 'vs/workbench/contrib/inlineChat/browser/inlineChatSession';
import { InlineChatConfigKeys } from 'vs/workbench/contrib/inlineChat/common/inlineChat';
import { GroupsOrder, IEditorGroup, IEditorGroupsService } from 'vs/workbench/services/editor/common/editorGroupsService';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IFilesConfigurationService } from 'vs/workbench/services/filesConfiguration/common/filesConfigurationService';
import { ITextFileService } from 'vs/workbench/services/textfile/common/textfiles';

export const IInlineChatSavingService = createDecorator<IInlineChatSavingService>('IInlineChatSavingService	');

export interface IInlineChatSavingService {
	_serviceBrand: undefined;

	markChanged(session: Session): void;

}

interface SessionData {
	readonly dispose: () => void;
	readonly session: Session;
	readonly group: IEditorGroup;
}

export class InlineChatSavingService implements IInlineChatSavingService {

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

			const disposable = this._fileConfigService.disableAutoSave(session.textModelN.uri);
			const group = this._getEditorGroup(session);
			this._sessionData.set(session, {
				session,
				group,
				dispose: () => {
					disposable.dispose();
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

		const store = new DisposableStore();

		const allDone = new Promise<void>(resolve => {
			store.add(this._inlineChatSessionService.onDidEndSession(e => {

				const data = sessions.get(e.session);
				if (!data) {
					return;
				}

				data.dispose();
				sessions.delete(e.session);

				if (sessions.size === 0) {
					resolve(); // DONE, release save block!
				}
			}));
		});

		progress.report({
			message: sessions.size === 1
				? localize('inlineChat', "Waiting for Inline Chat changes to be Accepted or Discarded...")
				: localize('inlineChat.N', "Waiting for Inline Chat changes in {0} editors to be Accepted or Discarded...", sessions.size)
		});

		await this._revealInlineChatSessions(sessions.values());

		try {
			await raceCancellation(allDone, token);
		} finally {
			store.dispose();
		}
	}

	private _getEditorGroup(session: Session): IEditorGroup {
		const candidate = this._editorGroupService.getGroups(GroupsOrder.MOST_RECENTLY_ACTIVE).find(group => {
			return getCodeEditor(group.activeEditorPane?.getControl()) === session.editor;
		});
		return candidate ?? this._editorGroupService.activeGroup;
	}

	private async _revealInlineChatSessions(sessions: Iterable<SessionData>): Promise<void> {

		for (const data of sessions) {

			const inputs = data.group
				.findEditors(data.session.textModelN.uri)
				.filter(input => input.editorId === DEFAULT_EDITOR_ASSOCIATION.id);

			if (inputs.length === 0) {
				await this._editorService.openEditor({ resource: data.session.textModelN.uri }, data.group);
			} else {
				await data.group.openEditor(inputs[0]);
			}
		}
	}
}
