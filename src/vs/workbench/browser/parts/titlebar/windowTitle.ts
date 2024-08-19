/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { dirname, basename } from 'vs/base/common/resources';
import { ITitleProperties, ITitleVariable } from 'vs/workbench/browser/parts/titlebar/titlebarPart';
import { IConfigurationService, IConfigurationChangeEvent } from 'vs/platform/configuration/common/configuration';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { Disposable, DisposableStore } from 'vs/base/common/lifecycle';
import { EditorResourceAccessor, Verbosity, SideBySideEditor } from 'vs/workbench/common/editor';
import { IBrowserWorkbenchEnvironmentService } from 'vs/workbench/services/environment/browser/environmentService';
import { IWorkspaceContextService, WorkbenchState, IWorkspaceFolder } from 'vs/platform/workspace/common/workspace';
import { isWindows, isWeb, isMacintosh, isNative } from 'vs/base/common/platform';
import { URI } from 'vs/base/common/uri';
import { trim } from 'vs/base/common/strings';
import { IEditorGroupsContainer } from 'vs/workbench/services/editor/common/editorGroupsService';
import { template } from 'vs/base/common/labels';
import { ILabelService, Verbosity as LabelVerbosity } from 'vs/platform/label/common/label';
import { Emitter } from 'vs/base/common/event';
import { RunOnceScheduler } from 'vs/base/common/async';
import { IProductService } from 'vs/platform/product/common/productService';
import { Schemas } from 'vs/base/common/network';
import { getVirtualWorkspaceLocation } from 'vs/platform/workspace/common/virtualWorkspace';
import { IUserDataProfileService } from 'vs/workbench/services/userDataProfile/common/userDataProfile';
import { IViewsService } from 'vs/workbench/services/views/common/viewsService';
import { ICodeEditor, isCodeEditor, isDiffEditor } from 'vs/editor/browser/editorBrowser';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { getWindowById } from 'vs/base/browser/dom';
import { CodeWindow } from 'vs/base/browser/window';

const enum WindowSettingNames {
	titleSeparator = 'window.titleSeparator',
	title = 'window.title'
}

export const defaultWindowTitle = (() => {
	if (isMacintosh && isNative) {
		return '${activeEditorShort}${separator}${rootName}${separator}${profileName}'; // macOS has native dirty indicator
	}

	const base = '${dirty}${activeEditorShort}${separator}${rootName}${separator}${profileName}${separator}${appName}';
	if (isWeb) {
		return base + '${separator}${remoteName}'; // Web: always show remote name
	}

	return base;
})();
export const defaultWindowTitleSeparator = isMacintosh ? ' \u2014 ' : ' - ';

export class WindowTitle extends Disposable {

	private static readonly NLS_USER_IS_ADMIN = isWindows ? localize('userIsAdmin', "[Administrator]") : localize('userIsSudo', "[Superuser]");
	private static readonly NLS_EXTENSION_HOST = localize('devExtensionWindowTitlePrefix', "[Extension Development Host]");
	private static readonly TITLE_DIRTY = '\u25cf ';

	private readonly properties: ITitleProperties = { isPure: true, isAdmin: false, prefix: undefined };
	private readonly variables = new Map<string /* context key */, string /* name */>();

	private readonly activeEditorListeners = this._register(new DisposableStore());
	private readonly titleUpdater = this._register(new RunOnceScheduler(() => this.doUpdateTitle(), 0));

	private readonly onDidChangeEmitter = new Emitter<void>();
	readonly onDidChange = this.onDidChangeEmitter.event;

	get value() { return this.title ?? ''; }
	get workspaceName() { return this.labelService.getWorkspaceLabel(this.contextService.getWorkspace()); }
	get fileName() {
		const activeEditor = this.editorService.activeEditor;
		if (!activeEditor) {
			return undefined;
		}
		const fileName = activeEditor.getTitle(Verbosity.SHORT);
		const dirty = activeEditor?.isDirty() && !activeEditor.isSaving() ? WindowTitle.TITLE_DIRTY : '';
		return `${dirty}${fileName}`;
	}

	private title: string | undefined;
	private titleIncludesFocusedView: boolean = false;

	private readonly editorService: IEditorService;

	private readonly windowId: number;

	constructor(
		targetWindow: CodeWindow,
		editorGroupsContainer: IEditorGroupsContainer | 'main',
		@IConfigurationService protected readonly configurationService: IConfigurationService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IEditorService editorService: IEditorService,
		@IBrowserWorkbenchEnvironmentService protected readonly environmentService: IBrowserWorkbenchEnvironmentService,
		@IWorkspaceContextService private readonly contextService: IWorkspaceContextService,
		@ILabelService private readonly labelService: ILabelService,
		@IUserDataProfileService private readonly userDataProfileService: IUserDataProfileService,
		@IProductService private readonly productService: IProductService,
		@IViewsService private readonly viewsService: IViewsService
	) {
		super();

		this.editorService = editorService.createScoped(editorGroupsContainer, this._store);
		this.windowId = targetWindow.vscodeWindowId;

		this.updateTitleIncludesFocusedView();
		this.registerListeners();
	}

	private registerListeners(): void {
		this._register(this.configurationService.onDidChangeConfiguration(e => this.onConfigurationChanged(e)));
		this._register(this.editorService.onDidActiveEditorChange(() => this.onActiveEditorChange()));
		this._register(this.contextService.onDidChangeWorkspaceFolders(() => this.titleUpdater.schedule()));
		this._register(this.contextService.onDidChangeWorkbenchState(() => this.titleUpdater.schedule()));
		this._register(this.contextService.onDidChangeWorkspaceName(() => this.titleUpdater.schedule()));
		this._register(this.labelService.onDidChangeFormatters(() => this.titleUpdater.schedule()));
		this._register(this.userDataProfileService.onDidChangeCurrentProfile(() => this.titleUpdater.schedule()));
		this._register(this.viewsService.onDidChangeFocusedView(() => {
			if (this.titleIncludesFocusedView) {
				this.titleUpdater.schedule();
			}
		}));
		this._register(this.contextKeyService.onDidChangeContext(e => {
			if (e.affectsSome(this.variables)) {
				this.titleUpdater.schedule();
			}
		}));
	}

	private onConfigurationChanged(event: IConfigurationChangeEvent): void {
		if (event.affectsConfiguration(WindowSettingNames.title)) {
			this.updateTitleIncludesFocusedView();
		}

		if (event.affectsConfiguration(WindowSettingNames.title) || event.affectsConfiguration(WindowSettingNames.titleSeparator)) {
			this.titleUpdater.schedule();
		}
	}

	private updateTitleIncludesFocusedView(): void {
		const titleTemplate = this.configurationService.getValue<unknown>(WindowSettingNames.title);
		this.titleIncludesFocusedView = typeof titleTemplate === 'string' && titleTemplate.includes('${focusedView}');
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

		// Apply listeners for tracking focused code editor
		if (this.titleIncludesFocusedView) {
			const activeTextEditorControl = this.editorService.activeTextEditorControl;
			const textEditorControls: ICodeEditor[] = [];
			if (isCodeEditor(activeTextEditorControl)) {
				textEditorControls.push(activeTextEditorControl);
			} else if (isDiffEditor(activeTextEditorControl)) {
				textEditorControls.push(activeTextEditorControl.getOriginalEditor(), activeTextEditorControl.getModifiedEditor());
			}

			for (const textEditorControl of textEditorControls) {
				this.activeEditorListeners.add(textEditorControl.onDidBlurEditorText(() => this.titleUpdater.schedule()));
				this.activeEditorListeners.add(textEditorControl.onDidFocusEditorText(() => this.titleUpdater.schedule()));
			}
		}
	}

	private doUpdateTitle(): void {
		const title = this.getFullWindowTitle();
		if (title !== this.title) {

			// Always set the native window title to identify us properly to the OS
			let nativeTitle = title;
			if (!trim(nativeTitle)) {
				nativeTitle = this.productService.nameLong;
			}

			const window = getWindowById(this.windowId, true).window;
			if (!window.document.title && isMacintosh && nativeTitle === this.productService.nameLong) {
				// TODO@electron macOS: if we set a window title for
				// the first time and it matches the one we set in
				// `windowImpl.ts` somehow the window does not appear
				// in the "Windows" menu. As such, we set the title
				// briefly to something different to ensure macOS
				// recognizes we have a window.
				// See: https://github.com/microsoft/vscode/issues/191288
				window.document.title = `${this.productService.nameLong} ${WindowTitle.TITLE_DIRTY}`;
			}

			window.document.title = nativeTitle;
			this.title = title;

			this.onDidChangeEmitter.fire();
		}
	}

	private getFullWindowTitle(): string {
		const { prefix, suffix } = this.getTitleDecorations();

		let title = this.getWindowTitle() || this.productService.nameLong;
		if (prefix) {
			title = `${prefix} ${title}`;
		}

		if (suffix) {
			title = `${title} ${suffix}`;
		}

		// Replace non-space whitespace
		return title.replace(/[^\S ]/g, ' ');
	}

	getTitleDecorations() {
		let prefix: string | undefined;
		let suffix: string | undefined;

		if (this.properties.prefix) {
			prefix = this.properties.prefix;
		}

		if (this.environmentService.isExtensionDevelopment) {
			prefix = !prefix
				? WindowTitle.NLS_EXTENSION_HOST
				: `${WindowTitle.NLS_EXTENSION_HOST} - ${prefix}`;
		}

		if (this.properties.isAdmin) {
			suffix = WindowTitle.NLS_USER_IS_ADMIN;
		}

		return { prefix, suffix };
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

	registerVariables(variables: ITitleVariable[]): void {
		let changed = false;

		for (const { name, contextKey } of variables) {
			if (!this.variables.has(contextKey)) {
				this.variables.set(contextKey, name);

				changed = true;
			}
		}

		if (changed) {
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
	 * {focusedView}: e.g. Terminal
	 * {separator}: conditional separator
	 */
	getWindowTitle(): string {
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
			folder = this.contextService.getWorkspaceFolder(editorResource) ?? undefined;
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
		const rootNameShort = this.labelService.getWorkspaceLabel(workspace, { verbose: LabelVerbosity.SHORT });
		const rootPath = root ? this.labelService.getUriLabel(root) : '';
		const folderName = folder ? folder.name : '';
		const folderPath = folder ? this.labelService.getUriLabel(folder.uri) : '';
		const dirty = editor?.isDirty() && !editor.isSaving() ? WindowTitle.TITLE_DIRTY : '';
		const appName = this.productService.nameLong;
		const profileName = this.userDataProfileService.currentProfile.isDefault ? '' : this.userDataProfileService.currentProfile.name;
		const focusedView: string = this.viewsService.getFocusedViewName();
		const variables: Record<string, string> = {};
		for (const [contextKey, name] of this.variables) {
			variables[name] = this.contextKeyService.getContextKeyValue(contextKey) ?? '';
		}

		let titleTemplate = this.configurationService.getValue<string>(WindowSettingNames.title);
		if (typeof titleTemplate !== 'string') {
			titleTemplate = defaultWindowTitle;
		}

		let separator = this.configurationService.getValue<string>(WindowSettingNames.titleSeparator);
		if (typeof separator !== 'string') {
			separator = defaultWindowTitleSeparator;
		}

		return template(titleTemplate, {
			...variables,
			activeEditorShort,
			activeEditorLong,
			activeEditorMedium,
			activeFolderShort,
			activeFolderMedium,
			activeFolderLong,
			rootName,
			rootPath,
			rootNameShort,
			folderName,
			folderPath,
			dirty,
			appName,
			remoteName,
			profileName,
			focusedView,
			separator: { label: separator }
		});
	}

	isCustomTitleFormat(): boolean {
		const title = this.configurationService.inspect<string>(WindowSettingNames.title);
		const titleSeparator = this.configurationService.inspect<string>(WindowSettingNames.titleSeparator);

		return title.value !== title.defaultValue || titleSeparator.value !== titleSeparator.defaultValue;
	}
}
