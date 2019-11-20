/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { Disposable, DisposableStore } from 'vs/base/common/lifecycle';
import { IFilesConfigurationService, AutoSaveMode } from 'vs/workbench/services/filesConfiguration/common/filesConfigurationService';
import { IHostService } from 'vs/workbench/services/host/browser/host';
import { SaveReason, IEditorIdentifier, IEditorInput, GroupIdentifier } from 'vs/workbench/common/editor';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { ICodeEditor, isCodeEditor, isDiffEditor } from 'vs/editor/browser/editorBrowser';
import { IEditorGroupsService } from 'vs/workbench/services/editor/common/editorGroupsService';

export class EditorAutoSave extends Disposable implements IWorkbenchContribution {

	private lastActiveEditor: IEditorInput | null = null;
	private lastActiveGroupId: GroupIdentifier | null = null;
	private lastActiveEditorControlDisposable = this._register(new DisposableStore());

	constructor(
		@IFilesConfigurationService private readonly filesConfigurationService: IFilesConfigurationService,
		@IHostService private readonly hostService: IHostService,
		@IEditorService private readonly editorService: IEditorService,
		@IEditorGroupsService private readonly editorGroupService: IEditorGroupsService
	) {
		super();

		this.registerListeners();
	}

	private registerListeners(): void {
		this._register(this.hostService.onDidChangeFocus(focused => this.onWindowFocusChange(focused)));
		this._register(this.editorService.onDidActiveEditorChange(() => this.onDidActiveEditorChange()));
	}

	private onWindowFocusChange(focused: boolean): void {
		if (!focused) {
			this.maybeTriggerAutoSave(SaveReason.WINDOW_CHANGE);
		}
	}

	private onDidActiveEditorChange(): void {

		// Treat editor change like a focus change for our last active editor if any
		if (this.lastActiveEditor && typeof this.lastActiveGroupId === 'number') {
			this.maybeTriggerAutoSave(SaveReason.FOCUS_CHANGE, { groupId: this.lastActiveGroupId, editor: this.lastActiveEditor });
		}

		// Remember as last active
		const activeGroup = this.editorGroupService.activeGroup;
		const activeEditor = this.lastActiveEditor = activeGroup.activeEditor;
		this.lastActiveGroupId = activeGroup.id;

		// Dispose previous active control listeners
		this.lastActiveEditorControlDisposable.clear();

		// Listen to focus changes on control for auto save
		if (activeGroup && activeEditor) {
			const activeTextEditorWidget = this.editorService.activeTextEditorWidget;
			const controlsToObserve: ICodeEditor[] = [];

			if (isCodeEditor(activeTextEditorWidget)) {
				controlsToObserve.push(activeTextEditorWidget);
			} else if (isDiffEditor(activeTextEditorWidget)) {
				controlsToObserve.push(activeTextEditorWidget.getOriginalEditor(), activeTextEditorWidget.getModifiedEditor());
			}

			controlsToObserve.forEach(control => this.lastActiveEditorControlDisposable.add(control.onDidBlurEditorWidget(() => {
				this.maybeTriggerAutoSave(SaveReason.FOCUS_CHANGE, { groupId: activeGroup.id, editor: activeEditor });
			})));
		}
	}

	private maybeTriggerAutoSave(reason: SaveReason, editorIdentifier?: IEditorIdentifier): void {
		if (editorIdentifier && (editorIdentifier.editor.isReadonly() || editorIdentifier.editor.isUntitled())) {
			return; // no auto save for readonly or untitled editors
		}

		const mode = this.filesConfigurationService.getAutoSaveMode();

		// Determine if we need to save all. In case of a window focus change we also save if auto save mode
		// is configured to be ON_FOCUS_CHANGE (editor focus change)
		if (
			(reason === SaveReason.WINDOW_CHANGE && (mode === AutoSaveMode.ON_FOCUS_CHANGE || mode === AutoSaveMode.ON_WINDOW_CHANGE)) ||
			(reason === SaveReason.FOCUS_CHANGE && mode === AutoSaveMode.ON_FOCUS_CHANGE)
		) {
			if (editorIdentifier) {
				this.editorService.save(editorIdentifier, { reason });
			} else {
				this.editorService.saveAll({ reason });
			}
		}
	}
}
