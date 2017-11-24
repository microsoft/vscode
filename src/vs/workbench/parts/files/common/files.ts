/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import URI from 'vs/base/common/uri';
import { IEditorOptions } from 'vs/editor/common/config/editorOptions';
import { IWorkbenchEditorConfiguration } from 'vs/workbench/common/editor';
import { IFilesConfiguration, FileChangeType, IFileService } from 'vs/platform/files/common/files';
import { FileStat, OpenEditor } from 'vs/workbench/parts/files/common/explorerModel';
import { ContextKeyExpr, RawContextKey } from 'vs/platform/contextkey/common/contextkey';
import { ITextModelContentProvider } from 'vs/editor/common/services/resolverService';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { TPromise } from 'vs/base/common/winjs.base';
import { onUnexpectedError } from 'vs/base/common/errors';
import { IModel } from 'vs/editor/common/editorCommon';
import { IMode } from 'vs/editor/common/modes';
import { IModelService } from 'vs/editor/common/services/modelService';
import { IModeService } from 'vs/editor/common/services/modeService';
import { ITextFileService } from 'vs/workbench/services/textfile/common/textfiles';
import { IViewlet } from 'vs/workbench/common/viewlet';

/**
 * Explorer viewlet id.
 */
export const VIEWLET_ID = 'workbench.view.explorer';

export interface IExplorerViewlet extends IViewlet {
	getExplorerView(): IExplorerView;
}

export interface IExplorerView {
	select(resource: URI, reveal?: boolean): TPromise<void>;
}

/**
 * Context Keys to use with keybindings for the Explorer and Open Editors view
 */
const explorerViewletVisibleId = 'explorerViewletVisible';
const filesExplorerFocusId = 'filesExplorerFocus';
const openEditorsVisibleId = 'openEditorsVisible';
const openEditorsFocusId = 'openEditorsFocus';
const explorerViewletFocusId = 'explorerViewletFocus';
const explorerResourceIsFolderId = 'explorerResourceIsFolder';

export const ExplorerViewletVisibleContext = new RawContextKey<boolean>(explorerViewletVisibleId, true);
export const ExplorerFolderContext = new RawContextKey<boolean>(explorerResourceIsFolderId, false);
export const FilesExplorerFocusedContext = new RawContextKey<boolean>(filesExplorerFocusId, true);
export const OpenEditorsVisibleContext = new RawContextKey<boolean>(openEditorsVisibleId, false);
export const OpenEditorsFocusedContext = new RawContextKey<boolean>(openEditorsFocusId, true);
export const ExplorerFocusedContext = new RawContextKey<boolean>(explorerViewletFocusId, true);

export const OpenEditorsVisibleCondition = ContextKeyExpr.has(openEditorsVisibleId);
export const FilesExplorerFocusCondition = ContextKeyExpr.and(ContextKeyExpr.has(explorerViewletVisibleId), ContextKeyExpr.has(filesExplorerFocusId));
export const ExplorerFocusCondition = ContextKeyExpr.and(ContextKeyExpr.has(explorerViewletVisibleId), ContextKeyExpr.has(explorerViewletFocusId));

/**
 * File editor input id.
 */
export const FILE_EDITOR_INPUT_ID = 'workbench.editors.files.fileEditorInput';

/**
 * Text file editor id.
 */
export const TEXT_FILE_EDITOR_ID = 'workbench.editors.files.textFileEditor';

/**
 * Binary file editor id.
 */
export const BINARY_FILE_EDITOR_ID = 'workbench.editors.files.binaryFileEditor';

export interface IFilesConfiguration extends IFilesConfiguration, IWorkbenchEditorConfiguration {
	explorer: {
		openEditors: {
			visible: number;
			dynamicHeight: boolean;
		};
		autoReveal: boolean;
		enableDragAndDrop: boolean;
		confirmDelete: boolean;
		sortOrder: SortOrder;
		decorations: {
			colors: boolean;
			badges: boolean;
		};
	};
	editor: IEditorOptions;
}

export interface IFileResource {
	resource: URI;
	isDirectory?: boolean;
}

/**
 * Helper to get an explorer item from an object.
 */
export function explorerItemToFileResource(obj: FileStat | OpenEditor): IFileResource {
	if (obj instanceof FileStat) {
		const stat = obj as FileStat;

		return {
			resource: stat.resource,
			isDirectory: stat.isDirectory
		};
	}

	if (obj instanceof OpenEditor) {
		const editor = obj as OpenEditor;
		const resource = editor.getResource();
		if (resource) {
			return {
				resource
			};
		}
	}

	return null;
}

export const SortOrderConfiguration = {
	DEFAULT: 'default',
	MIXED: 'mixed',
	FILES_FIRST: 'filesFirst',
	TYPE: 'type',
	MODIFIED: 'modified'
};

export type SortOrder = 'default' | 'mixed' | 'filesFirst' | 'type' | 'modified';

export class FileOnDiskContentProvider implements ITextModelContentProvider {
	private fileWatcher: IDisposable;

	constructor(
		@ITextFileService private textFileService: ITextFileService,
		@IFileService private fileService: IFileService,
		@IModeService private modeService: IModeService,
		@IModelService private modelService: IModelService
	) {
	}

	public provideTextContent(resource: URI): TPromise<IModel> {
		const fileOnDiskResource = URI.file(resource.fsPath);

		// Make sure our file from disk is resolved up to date
		return this.resolveEditorModel(resource).then(codeEditorModel => {

			// Make sure to keep contents on disk up to date when it changes
			if (!this.fileWatcher) {
				this.fileWatcher = this.fileService.onFileChanges(changes => {
					if (changes.contains(fileOnDiskResource, FileChangeType.UPDATED)) { //
						this.resolveEditorModel(resource, false /* do not create if missing */).done(null, onUnexpectedError); // update model when resource changes
					}
				});

				const disposeListener = codeEditorModel.onWillDispose(() => {
					disposeListener.dispose();
					this.fileWatcher = dispose(this.fileWatcher);
				});
			}

			return codeEditorModel;
		});
	}

	private resolveEditorModel(resource: URI, createAsNeeded = true): TPromise<IModel> {
		const fileOnDiskResource = URI.file(resource.fsPath);

		return this.textFileService.resolveTextContent(fileOnDiskResource).then(content => {
			let codeEditorModel = this.modelService.getModel(resource);
			if (codeEditorModel) {
				this.modelService.updateModel(codeEditorModel, content.value);
			} else if (createAsNeeded) {
				const fileOnDiskModel = this.modelService.getModel(fileOnDiskResource);

				let mode: TPromise<IMode>;
				if (fileOnDiskModel) {
					mode = this.modeService.getOrCreateMode(fileOnDiskModel.getModeId());
				} else {
					mode = this.modeService.getOrCreateModeByFilenameOrFirstLine(fileOnDiskResource.fsPath);
				}

				codeEditorModel = this.modelService.createModel(content.value, mode, resource);
			}

			return codeEditorModel;
		});
	}

	public dispose(): void {
		this.fileWatcher = dispose(this.fileWatcher);
	}
}
