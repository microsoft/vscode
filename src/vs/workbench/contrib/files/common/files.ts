/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from 'vs/base/common/uri';
import { IEditorOptions } from 'vs/editor/common/config/editorOptions';
import { IWorkbenchEditorConfiguration, IEditorIdentifier, IEditorInput, toResource, SideBySideEditor } from 'vs/workbench/common/editor';
import { IFilesConfiguration, FileChangeType, IFileService } from 'vs/platform/files/common/files';
import { ContextKeyExpr, RawContextKey } from 'vs/platform/contextkey/common/contextkey';
import { ITextModelContentProvider } from 'vs/editor/common/services/resolverService';
import { Disposable, MutableDisposable } from 'vs/base/common/lifecycle';
import { ITextModel } from 'vs/editor/common/model';
import { Event } from 'vs/base/common/event';
import { IModelService } from 'vs/editor/common/services/modelService';
import { IModeService, ILanguageSelection } from 'vs/editor/common/services/modeService';
import { ITextFileService } from 'vs/workbench/services/textfile/common/textfiles';
import { InputFocusedContextKey } from 'vs/platform/contextkey/common/contextkeys';
import { Registry } from 'vs/platform/registry/common/platform';
import { IViewContainersRegistry, Extensions as ViewContainerExtensions, ViewContainer } from 'vs/workbench/common/views';
import { Schemas } from 'vs/base/common/network';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IEditorGroup } from 'vs/workbench/services/editor/common/editorGroupsService';
import { ExplorerItem } from 'vs/workbench/contrib/files/common/explorerModel';
import { once } from 'vs/base/common/functional';
import { ITextEditorOptions } from 'vs/platform/editor/common/editor';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';

/**
 * Explorer viewlet id.
 */
export const VIEWLET_ID = 'workbench.view.explorer';
/**
 * Explorer viewlet container.
 */
export const VIEW_CONTAINER: ViewContainer = Registry.as<IViewContainersRegistry>(ViewContainerExtensions.ViewContainersRegistry).registerViewContainer(VIEWLET_ID);

export interface IEditableData {
	validationMessage: (value: string) => string | null;
	onFinish: (value: string, success: boolean) => void;
}

export interface IExplorerService {
	_serviceBrand: any;
	readonly roots: ExplorerItem[];
	readonly sortOrder: SortOrder;
	readonly onDidChangeRoots: Event<void>;
	readonly onDidChangeItem: Event<{ item?: ExplorerItem, recursive: boolean }>;
	readonly onDidChangeEditable: Event<ExplorerItem>;
	readonly onDidSelectResource: Event<{ resource?: URI, reveal?: boolean }>;
	readonly onDidCopyItems: Event<{ items: ExplorerItem[], cut: boolean, previouslyCutItems: ExplorerItem[] | undefined }>;

	setEditable(stat: ExplorerItem, data: IEditableData | null): void;
	getEditableData(stat: ExplorerItem): IEditableData | undefined;
	// If undefined is passed checks if any element is currently being edited.
	isEditable(stat: ExplorerItem | undefined): boolean;
	findClosest(resource: URI): ExplorerItem | null;
	refresh(): void;
	setToCopy(stats: ExplorerItem[], cut: boolean): void;
	isCut(stat: ExplorerItem): boolean;

	/**
	 * Selects and reveal the file element provided by the given resource if its found in the explorer.
	 * Will try to resolve the path in case the explorer is not yet expanded to the file yet.
	 */
	select(resource: URI, reveal?: boolean): Promise<void>;
}
export const IExplorerService = createDecorator<IExplorerService>('explorerService');

/**
 * Context Keys to use with keybindings for the Explorer and Open Editors view
 */
export const ExplorerViewletVisibleContext = new RawContextKey<boolean>('explorerViewletVisible', true);
export const ExplorerFolderContext = new RawContextKey<boolean>('explorerResourceIsFolder', false);
export const ExplorerResourceReadonlyContext = new RawContextKey<boolean>('explorerResourceReadonly', false);
export const ExplorerResourceNotReadonlyContext = ExplorerResourceReadonlyContext.toNegated();
export const ExplorerRootContext = new RawContextKey<boolean>('explorerResourceIsRoot', false);
export const ExplorerResourceCut = new RawContextKey<boolean>('explorerResourceCut', false);
export const ExplorerResourceMoveableToTrash = new RawContextKey<boolean>('explorerResourceMoveableToTrash', false);
export const FilesExplorerFocusedContext = new RawContextKey<boolean>('filesExplorerFocus', true);
export const OpenEditorsVisibleContext = new RawContextKey<boolean>('openEditorsVisible', false);
export const OpenEditorsFocusedContext = new RawContextKey<boolean>('openEditorsFocus', true);
export const ExplorerFocusedContext = new RawContextKey<boolean>('explorerViewletFocus', true);

export const FilesExplorerFocusCondition = ContextKeyExpr.and(ExplorerViewletVisibleContext, FilesExplorerFocusedContext, ContextKeyExpr.not(InputFocusedContextKey));
export const ExplorerFocusCondition = ContextKeyExpr.and(ExplorerViewletVisibleContext, ExplorerFocusedContext, ContextKeyExpr.not(InputFocusedContextKey));

/**
 * Text file editor id.
 */
export const TEXT_FILE_EDITOR_ID = 'workbench.editors.files.textFileEditor';

/**
 * File editor input id.
 */
export const FILE_EDITOR_INPUT_ID = 'workbench.editors.files.fileEditorInput';

/**
 * Binary file editor id.
 */
export const BINARY_FILE_EDITOR_ID = 'workbench.editors.files.binaryFileEditor';


export interface IFilesConfiguration extends IFilesConfiguration, IWorkbenchEditorConfiguration {
	explorer: {
		openEditors: {
			visible: number;
		};
		autoReveal: boolean;
		enableDragAndDrop: boolean;
		confirmDelete: boolean;
		sortOrder: SortOrder;
		decorations: {
			colors: boolean;
			badges: boolean;
		};
		incrementalNaming: 'simple' | 'smart';
	};
	editor: IEditorOptions;
}

export interface IFileResource {
	resource: URI;
	isDirectory?: boolean;
}

export const SortOrderConfiguration = {
	DEFAULT: 'default',
	MIXED: 'mixed',
	FILES_FIRST: 'filesFirst',
	TYPE: 'type',
	MODIFIED: 'modified'
};

export type SortOrder = 'default' | 'mixed' | 'filesFirst' | 'type' | 'modified';

export class TextFileContentProvider extends Disposable implements ITextModelContentProvider {
	private readonly fileWatcherDisposable = this._register(new MutableDisposable());

	constructor(
		@ITextFileService private readonly textFileService: ITextFileService,
		@IFileService private readonly fileService: IFileService,
		@IModeService private readonly modeService: IModeService,
		@IModelService private readonly modelService: IModelService
	) {
		super();
	}

	static async open(resource: URI, scheme: string, label: string, editorService: IEditorService, options?: ITextEditorOptions): Promise<void> {
		await editorService.openEditor({
			leftResource: TextFileContentProvider.resourceToTextFile(scheme, resource),
			rightResource: resource,
			label,
			options
		});
	}

	private static resourceToTextFile(scheme: string, resource: URI): URI {
		return resource.with({ scheme, query: JSON.stringify({ scheme: resource.scheme }) });
	}

	private static textFileToResource(resource: URI): URI {
		return resource.with({ scheme: JSON.parse(resource.query)['scheme'], query: null });
	}

	async provideTextContent(resource: URI): Promise<ITextModel> {
		const savedFileResource = TextFileContentProvider.textFileToResource(resource);

		// Make sure our text file is resolved up to date
		const codeEditorModel = await this.resolveEditorModel(resource);

		// Make sure to keep contents up to date when it changes
		if (!this.fileWatcherDisposable.value) {
			this.fileWatcherDisposable.value = this.fileService.onFileChanges(changes => {
				if (changes.contains(savedFileResource, FileChangeType.UPDATED)) {
					this.resolveEditorModel(resource, false /* do not create if missing */); // update model when resource changes
				}
			});

			if (codeEditorModel) {
				once(codeEditorModel.onWillDispose)(() => this.fileWatcherDisposable.clear());
			}
		}

		return codeEditorModel;
	}

	private resolveEditorModel(resource: URI, createAsNeeded?: true): Promise<ITextModel>;
	private resolveEditorModel(resource: URI, createAsNeeded?: boolean): Promise<ITextModel | null>;
	private async resolveEditorModel(resource: URI, createAsNeeded: boolean = true): Promise<ITextModel | null> {
		const savedFileResource = TextFileContentProvider.textFileToResource(resource);

		const content = await this.textFileService.readStream(savedFileResource);

		let codeEditorModel = this.modelService.getModel(resource);
		if (codeEditorModel) {
			this.modelService.updateModel(codeEditorModel, content.value);
		} else if (createAsNeeded) {
			const textFileModel = this.modelService.getModel(savedFileResource);

			let languageSelector: ILanguageSelection;
			if (textFileModel) {
				languageSelector = this.modeService.create(textFileModel.getModeId());
			} else {
				languageSelector = this.modeService.createByFilepathOrFirstLine(savedFileResource);
			}

			codeEditorModel = this.modelService.createModel(content.value, languageSelector, resource);
		}

		return codeEditorModel;
	}
}

export class OpenEditor implements IEditorIdentifier {

	constructor(private _editor: IEditorInput, private _group: IEditorGroup) {
		// noop
	}

	public get editor() {
		return this._editor;
	}

	public get editorIndex() {
		return this._group.getIndexOfEditor(this.editor);
	}

	public get group() {
		return this._group;
	}

	public get groupId() {
		return this._group.id;
	}

	public getId(): string {
		return `openeditor:${this.groupId}:${this.editorIndex}:${this.editor.getName()}:${this.editor.getDescription()}`;
	}

	public isPreview(): boolean {
		return this._group.previewEditor === this.editor;
	}

	public isUntitled(): boolean {
		return !!toResource(this.editor, { supportSideBySide: SideBySideEditor.MASTER, filterByScheme: Schemas.untitled });
	}

	public isDirty(): boolean {
		return this.editor.isDirty();
	}

	public getResource(): URI | undefined {
		return toResource(this.editor, { supportSideBySide: SideBySideEditor.MASTER });
	}
}
