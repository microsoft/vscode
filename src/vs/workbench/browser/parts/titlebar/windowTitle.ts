/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { dirname, basename } from 'vs/base/common/resources';
import { ITitleProperties } from 'vs/workbench/services/title/common/titleService';
import { IConfigurationService, IConfigurationChangeEvent } from 'vs/platform/configuration/common/configuration';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { Disposable, DisposableStore } from 'vs/base/common/lifecycle';
import { EditorResourceAccessor, Verbosity, SideBySideEditor } from 'vs/workbench/common/editor';
import { IBrowserWorkbenchEnvironmentService } from 'vs/workbench/services/environment/browser/environmentService';
import { IWorkspaceContextService, WorkbenchState, IWorkspaceFolder } from 'vs/platform/workspace/common/workspace';
import { isWindows, isWeb } from 'vs/base/common/platform';
import { URI } from 'vs/base/common/uri';
import { trim } from 'vs/base/common/strings';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { template } from 'vs/base/common/labels';
import { ILabelService } from 'vs/platform/label/common/label';
import { Emitter } from 'vs/base/common/event';
import { RunOnceScheduler } from 'vs/base/common/async';
import { IProductService } from 'vs/platform/product/common/productService';
import { Schemas } from 'vs/base/common/network';
import { withNullAsUndefined } from 'vs/base/common/types';
import { getVirtualWorkspaceLocation } from 'vs/platform/workspace/common/virtualWorkspace';

export class WindowTitle extends Disposable {

	private static readonly NLS_UNSUPPORTED = localize('patchedWindowTitle', "[Unsupported]");
	private static readonly NLS_USER_IS_ADMIN = isWindows ? localize('userIsAdmin', "[Administrator]") : localize('userIsSudo', "[Superuser]");
	private static readonly NLS_EXTENSION_HOST = localize('devExtensionWindowTitlePrefix', "[Extension Development Host]");
	private static readonly TITLE_DIRTY = '\u25cf ';

	private readonly properties: ITitleProperties = { isPure: true, isAdmin: false, prefix: undefined };
	private readonly activeEditorListeners = this._register(new DisposableStore());
	private readonly titleUpdater = this._register(new RunOnceScheduler(() => this.doUpdateTitle(), 0));

	private readonly onDidChangeEmitter = new Emitter<void>();
	readonly onDidChange = this.onDidChangeEmitter.event;

	private title: string | undefined;

	constructor(
		@IConfigurationService protected readonly configurationService: IConfigurationService,
		@IEditorService private readonly editorService: IEditorService,
		@IBrowserWorkbenchEnvironmentService protected readonly environmentService: IBrowserWorkbenchEnvironmentService,
		@IWorkspaceContextService private readonly contextService: IWorkspaceContextService,
		@IInstantiationService protected readonly instantiationService: IInstantiationService,
		@ILabelService private readonly labelService: ILabelService,
		@IProductService private readonly productService: IProductService
	) {
		super();
		this.registerListeners();
	}

	get value() {
		return this.title ?? '';
	}

	private registerListeners(): void {
		this._register(this.configurationService.onDidChangeConfiguration(e => this.onConfigurationChanged(e)));
		this._register(this.editorService.onDidActiveEditorChange(() => this.onActiveEditorChange()));
		this._register(this.contextService.onDidChangeWorkspaceFolders(() => this.titleUpdater.schedule()));
		this._register(this.contextService.onDidChangeWorkbenchState(() => this.titleUpdater.schedule()));
		this._register(this.contextService.onDidChangeWorkspaceName(() => this.titleUpdater.schedule()));
		this._register(this.labelService.onDidChangeFormatters(() => this.titleUpdater.schedule()));
	}

	private onConfigurationChanged(event: IConfigurationChangeEvent): void {
		if (event.affectsConfiguration('window.title') || event.affectsConfiguration('window.titleSeparator')) {
			this.titleUpdater.schedule();
		}
	}

	private onActiveEditorChange(): void {

		// Dispose old listeners
		this.activeEditorListeners.clear();

		// Calculate New Window Title
		this.titleUpdater.schedule();

		// Apply listener for dirty and label changes
		const activeEditor = this.editorService.activeEditor;
		if (activeEditor) {
			this.activeEditorListeners.add(activeEditor.onDidChangeDirty(() => this.titleUpdater.schedule()));
			this.activeEditorListeners.add(activeEditor.onDidChangeLabel(() => this.titleUpdater.schedule()));
		}
	}

	private doUpdateTitle(): void {
		const title = this.getWindowTitle();
		if (title !== this.title) {
			// Always set the native window title to identify us properly to the OS
			let nativeTitle = title;
			if (!trim(nativeTitle)) {
				nativeTitle = this.productService.nameLong;
			}
			window.document.title = nativeTitle;
			this.title = title;
			this.onDidChangeEmitter.fire();
		}
	}

	private getWindowTitle(): string {
		let title = this.doGetWindowTitle();

		if (this.properties.prefix) {
			title = `${this.properties.prefix} ${title || this.productService.nameLong}`;
		}

		if (this.properties.isAdmin) {
			title = `${title || this.productService.nameLong} ${WindowTitle.NLS_USER_IS_ADMIN}`;
		}

		if (!this.properties.isPure) {
			title = `${title || this.productService.nameLong} ${WindowTitle.NLS_UNSUPPORTED}`;
		}

		if (this.environmentService.isExtensionDevelopment) {
			title = `${WindowTitle.NLS_EXTENSION_HOST} - ${title || this.productService.nameLong}`;
		}

		// Replace non-space whitespace
		title = title.replace(/[^\S ]/g, ' ');

		return title;
	}

	updateProperties(properties: ITitleProperties): void {
		const isAdmin = typeof properties.isAdmin === 'boolean' ? properties.isAdmin : this.properties.isAdmin;
		const isPure = typeof properties.isPure === 'boolean' ? properties.isPure : this.properties.isPure;
		const prefix = typeof properties.prefix === 'string' ? properties.prefix : this.properties.prefix;

		if (isAdmin !== this.properties.isAdmin || isPure !== this.properties.isPure || prefix !== this.properties.prefix) {
			this.properties.isAdmin = isAdmin;
			this.properties.isPure = isPure;
			this.properties.prefix = prefix;

			this.titleUpdater.schedule();
		}
	}

	/**
	 * Possible template values:
	 *
	 * {activeEditorLong}: e.g. /Users/Development/myFolder/myFileFolder/myFile.txt
	 * {activeEditorMedium}: e.g. myFolder/myFileFolder/myFile.txt
	 * {activeEditorShort}: e.g. myFile.txt
	 * {activeFolderLong}: e.g. /Users/Development/myFolder/myFileFolder
	 * {activeFolderMedium}: e.g. myFolder/myFileFolder
	 * {activeFolderShort}: e.g. myFileFolder
	 * {rootName}: e.g. myFolder1, myFolder2, myFolder3
	 * {rootPath}: e.g. /Users/Development
	 * {folderName}: e.g. myFolder
	 * {folderPath}: e.g. /Users/Development/myFolder
	 * {appName}: e.g. VS Code
	 * {remoteName}: e.g. SSH
	 * {dirty}: indicator
	 * {separator}: conditional separator
	 */
	private doGetWindowTitle(): string {
		const editor = this.editorService.activeEditor;
		const workspace = this.contextService.getWorkspace();

		// Compute root
		let root: URI | undefined;
		if (workspace.configuration) {
			root = workspace.configuration;
		} else if (workspace.folders.length) {
			root = workspace.folders[0].uri;
		}

		// Compute active editor folder
		const editorResource = EditorResourceAccessor.getOriginalUri(editor, { supportSideBySide: SideBySideEditor.PRIMARY });
		let editorFolderResource = editorResource ? dirname(editorResource) : undefined;
		if (editorFolderResource?.path === '.') {
			editorFolderResource = undefined;
		}

		// Compute folder resource
		// Single Root Workspace: always the root single workspace in this case
		// Otherwise: root folder of the currently active file if any
		let folder: IWorkspaceFolder | undefined = undefined;
		if (this.contextService.getWorkbenchState() === WorkbenchState.FOLDER) {
			folder = workspace.folders[0];
		} else if (editorResource) {
			folder = withNullAsUndefined(this.contextService.getWorkspaceFolder(editorResource));
		}

		// Compute remote
		// vscode-remtoe: use as is
		// otherwise figure out if we have a virtual folder opened
		let remoteName: string | undefined = undefined;
		if (this.environmentService.remoteAuthority && !isWeb) {
			remoteName = this.labelService.getHostLabel(Schemas.vscodeRemote, this.environmentService.remoteAuthority);
		} else {
			const virtualWorkspaceLocation = getVirtualWorkspaceLocation(workspace);
			if (virtualWorkspaceLocation) {
				remoteName = this.labelService.getHostLabel(virtualWorkspaceLocation.scheme, virtualWorkspaceLocation.authority);
			}
		}

		// Variables
		const activeEditorShort = editor ? editor.getTitle(Verbosity.SHORT) : '';
		const activeEditorMedium = editor ? editor.getTitle(Verbosity.MEDIUM) : activeEditorShort;
		const activeEditorLong = editor ? editor.getTitle(Verbosity.LONG) : activeEditorMedium;
		const activeFolderShort = editorFolderResource ? basename(editorFolderResource) : '';
		const activeFolderMedium = editorFolderResource ? this.labelService.getUriLabel(editorFolderResource, { relative: true }) : '';
		const activeFolderLong = editorFolderResource ? this.labelService.getUriLabel(editorFolderResource) : '';
		const rootName = this.labelService.getWorkspaceLabel(workspace);
		const rootPath = root ? this.labelService.getUriLabel(root) : '';
		const folderName = folder ? folder.name : '';
		const folderPath = folder ? this.labelService.getUriLabel(folder.uri) : '';
		const dirty = editor?.isDirty() && !editor.isSaving() ? WindowTitle.TITLE_DIRTY : '';
		const appName = this.productService.nameLong;
		const separator = this.configurationService.getValue<string>('window.titleSeparator');
		const titleTemplate = this.configurationService.getValue<string>('window.title');

		return template(titleTemplate, {
			activeEditorShort,
			activeEditorLong,
			activeEditorMedium,
			activeFolderShort,
			activeFolderMedium,
			activeFolderLong,
			rootName,
			rootPath,
			folderName,
			folderPath,
			dirty,
			appName,
			remoteName,
			separator: { label: separator }
		});
	}
}
