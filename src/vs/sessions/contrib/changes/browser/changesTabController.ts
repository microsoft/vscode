/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Sequencer } from '../../../../base/common/async.js';
import { onUnexpectedError } from '../../../../base/common/errors.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { autorun, IReader } from '../../../../base/common/observable.js';
import { isEqual } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { IEditorOptions } from '../../../../platform/editor/common/editor.js';
import { IWorkbenchContribution } from '../../../../workbench/common/contributions.js';
import { EditorInput } from '../../../../workbench/common/editor/editorInput.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IEditorGroup, IEditorGroupsService } from '../../../../workbench/services/editor/common/editorGroupsService.js';
import { IEditorService } from '../../../../workbench/services/editor/common/editorService.js';
import { ISessionsService } from '../../../services/sessions/browser/sessionsService.js';
import { IChangesViewService } from '../common/changesViewService.js';
import { ISessionChangesService } from './sessionChangesService.js';
import { EmptyFileEditorInput } from '../../editor/browser/emptyFileEditorInput.js';

const changesEditorOptions: IEditorOptions = {
	pinned: true,
	index: 0,
	preserveFocus: true,
	isExplicit: false,
};

const fileTabOptions: IEditorOptions = {
	pinned: true,
	preserveFocus: true,
	isExplicit: false,
};

export class ChangesTabController extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.sessions.changesTabController';

	private readonly _syncSequencer = new Sequencer();
	private _syncGeneration = 0;

	constructor(
		@ISessionsService private readonly _sessionsService: ISessionsService,
		@ISessionChangesService private readonly _sessionChangesService: ISessionChangesService,
		@IChangesViewService private readonly _changesViewService: IChangesViewService,
		@IEditorService private readonly _editorService: IEditorService,
		@IEditorGroupsService private readonly _editorGroupsService: IEditorGroupsService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
	) {
		super();

		this._register(autorun(reader => {
			const sessionResource = this._readTargetSessionResource(reader);
			const generation = ++this._syncGeneration;
			void this._syncSequencer.queue(() => this._syncChangesEditor(sessionResource, generation)).catch(onUnexpectedError);
		}));
	}

	private _readTargetSessionResource(reader: IReader): URI | undefined {
		const session = this._sessionsService.activeSession.read(reader);
		if (!session) {
			return undefined;
		}

		const isCreated = session.isCreated.read(reader);
		const isQuickChat = session.isQuickChat?.read(reader) ?? false;
		const workspace = session.workspace.read(reader);
		if (!isCreated || isQuickChat || !workspace) {
			return undefined;
		}

		return session.resource;
	}

	private async _syncChangesEditor(sessionResource: URI | undefined, generation: number): Promise<void> {
		if (generation !== this._syncGeneration) {
			return;
		}

		const group = this._editorGroupsService.mainPart.activeGroup;
		const changesResource = sessionResource ? this._sessionChangesService.getChangesEditorResource(sessionResource) : undefined;

		await this._closeInactiveChangesEditors(group, changesResource);
		if (generation !== this._syncGeneration || !sessionResource || !changesResource) {
			return;
		}

		this._changesViewService.setChangesetId(undefined);

		let changesEditor = this._findChangesEditor(group, changesResource);
		if (!changesEditor) {
			await this._sessionChangesService.openChangesEditor(sessionResource, changesEditorOptions, group);

			if (generation !== this._syncGeneration) {
				return;
			}

			changesEditor = this._findChangesEditor(group, changesResource);
		}

		if (changesEditor) {
			this._ensureFirst(group, changesEditor);
			await this._ensureDefaultFileTab(group);
		}
	}

	private async _ensureDefaultFileTab(group: IEditorGroup): Promise<void> {
		if (group.editors.some(editor => editor instanceof EmptyFileEditorInput)) {
			return;
		}

		await this._editorService.openEditor(this._instantiationService.createInstance(EmptyFileEditorInput), fileTabOptions, group);
	}

	private async _closeInactiveChangesEditors(group: IEditorGroup, activeChangesResource: URI | undefined): Promise<void> {
		const editorsToClose = group.editors.filter(editor => {
			const resource = this._getChangesEditorResource(editor);
			return resource && (!activeChangesResource || !isEqual(resource, activeChangesResource));
		});

		if (editorsToClose.length > 0) {
			await this._editorService.closeEditors(editorsToClose.map(editor => ({ groupId: group.id, editor })), { preserveFocus: true });
		}
	}

	private _findChangesEditor(group: IEditorGroup, changesResource: URI): EditorInput | undefined {
		return group.editors.find(editor => {
			const resource = this._getChangesEditorResource(editor);
			return !!resource && isEqual(resource, changesResource);
		});
	}

	private _getChangesEditorResource(editor: EditorInput): URI | undefined {
		const resource = editor.resource;
		return resource && this._sessionChangesService.getSessionResource(resource) ? resource : undefined;
	}

	private _ensureFirst(group: IEditorGroup, editor: EditorInput): void {
		if (!group.isPinned(editor)) {
			group.pinEditor(editor);
		}

		if (group.getIndexOfEditor(editor) !== 0) {
			group.moveEditor(editor, group, changesEditorOptions);
		}
	}
}
