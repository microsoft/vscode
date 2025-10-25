/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../base/common/uri.js';
import { IEditorOptions } from '../../../../editor/common/config/editorOptions.js';
import { IWorkbenchEditorConfiguration, IEditorIdentifier, EditorResourceAccessor, SideBySideEditor } from '../../../common/editor.js';
import { EditorInput } from '../../../common/editor/editorInput.js';
import { IFilesConfiguration as PlatformIFilesConfiguration, FileChangeType, IFileService } from '../../../../platform/files/common/files.js';
import { ContextKeyExpr, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { ITextModelContentProvider } from '../../../../editor/common/services/resolverService.js';
import { Disposable, DisposableStore, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { ITextModel } from '../../../../editor/common/model.js';
import { IModelService } from '../../../../editor/common/services/model.js';
import { ILanguageService, ILanguageSelection } from '../../../../editor/common/languages/language.js';
import { ITextFileService } from '../../../services/textfile/common/textfiles.js';
import { InputFocusedContextKey } from '../../../../platform/contextkey/common/contextkeys.js';
import { IEditorGroup } from '../../../services/editor/common/editorGroupsService.js';
import { Event } from '../../../../base/common/event.js';
import { ITextEditorOptions } from '../../../../platform/editor/common/editor.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { localize } from '../../../../nls.js';
import { IExpression } from '../../../../base/common/glob.js';

/**
 * Explorer viewlet id.
 */
export const VIEWLET_ID = 'workbench.view.explorer';

/**
 * Explorer file view id.
 */
export const VIEW_ID = 'workbench.explorer.fileView';

/**
 * Context Keys to use with keybindings for the Explorer and Open Editors view
 */
export const ExplorerViewletVisibleContext = new RawContextKey<boolean>('explorerViewletVisible', true, { type: 'boolean', description: localize('explorerViewletVisible', "True when the EXPLORER viewlet is visible.") });
export const FoldersViewVisibleContext = new RawContextKey<boolean>('foldersViewVisible', true, { type: 'boolean', description: localize('foldersViewVisible', "True when the FOLDERS view (the file tree within the explorer view container) is visible.") });
export const ExplorerFolderContext = new RawContextKey<boolean>('explorerResourceIsFolder', false, { type: 'boolean', description: localize('explorerResourceIsFolder', "True when the focused item in the EXPLORER is a folder.") });
export const ExplorerResourceReadonlyContext = new RawContextKey<boolean>('explorerResourceReadonly', false, { type: 'boolean', description: localize('explorerResourceReadonly', "True when the focused item in the EXPLORER is read-only.") });
export const ExplorerResourceWritableContext = ExplorerResourceReadonlyContext.toNegated();
export const ExplorerResourceParentReadOnlyContext = new RawContextKey<boolean>('explorerResourceParentReadonly', false, { type: 'boolean', description: localize('explorerResourceParentReadonly', "True when the focused item in the EXPLORER's parent is read-only.") });

/**
 * Comma separated list of editor ids that can be used for the selected explorer resource.
 */
export const ExplorerResourceAvailableEditorIdsContext = new RawContextKey<string>('explorerResourceAvailableEditorIds', '');
export const ExplorerRootContext = new RawContextKey<boolean>('explorerResourceIsRoot', false, { type: 'boolean', description: localize('explorerResourceIsRoot', "True when the focused item in the EXPLORER is a root folder.") });
export const ExplorerResourceCut = new RawContextKey<boolean>('explorerResourceCut', false, { type: 'boolean', description: localize('explorerResourceCut', "True when an item in the EXPLORER has been cut for cut and paste.") });
export const ExplorerResourceMoveableToTrash = new RawContextKey<boolean>('explorerResourceMoveableToTrash', false, { type: 'boolean', description: localize('explorerResourceMoveableToTrash', "True when the focused item in the EXPLORER can be moved to trash.") });
export const FilesExplorerFocusedContext = new RawContextKey<boolean>('filesExplorerFocus', true, { type: 'boolean', description: localize('filesExplorerFocus', "True when the focus is inside the EXPLORER view.") });
export const OpenEditorsFocusedContext = new RawContextKey<boolean>('openEditorsFocus', true, { type: 'boolean', description: localize('openEditorsFocus', "True when the focus is inside the OPEN EDITORS view.") });
export const ExplorerFocusedContext = new RawContextKey<boolean>('explorerViewletFocus', true, { type: 'boolean', description: localize('explorerViewletFocus', "True when the focus is inside the EXPLORER viewlet.") });
export const ExplorerFindProviderActive = new RawContextKey<boolean>('explorerFindProviderActive', false, { type: 'boolean', description: localize('explorerFindProviderActive', "True when the explorer tree is using the explorer find provider.") });

// compressed nodes
export const ExplorerCompressedFocusContext = new RawContextKey<boolean>('explorerViewletCompressedFocus', true, { type: 'boolean', description: localize('explorerViewletCompressedFocus', "True when the focused item in the EXPLORER view is a compact item.") });
export const ExplorerCompressedFirstFocusContext = new RawContextKey<boolean>('explorerViewletCompressedFirstFocus', true, { type: 'boolean', description: localize('explorerViewletCompressedFirstFocus', "True when the focus is inside a compact item's first part in the EXPLORER view.") });
export const ExplorerCompressedLastFocusContext = new RawContextKey<boolean>('explorerViewletCompressedLastFocus', true, { type: 'boolean', description: localize('explorerViewletCompressedLastFocus', "True when the focus is inside a compact item's last part in the EXPLORER view.") });

export const ViewHasSomeCollapsibleRootItemContext = new RawContextKey<boolean>('viewHasSomeCollapsibleItem', false, { type: 'boolean', description: localize('viewHasSomeCollapsibleItem', "True when a workspace in the EXPLORER view has some collapsible root child.") });

export const FilesExplorerFocusCondition = ContextKeyExpr.and(FoldersViewVisibleContext, FilesExplorerFocusedContext, ContextKeyExpr.not(InputFocusedContextKey));
export const ExplorerFocusCondition = ContextKeyExpr.and(FoldersViewVisibleContext, ExplorerFocusedContext, ContextKeyExpr.not(InputFocusedContextKey));

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

/**
 * Language identifier for binary files opened as text.
 */
export const BINARY_TEXT_FILE_MODE = 'code-text-binary';

export interface IFilesConfiguration extends PlatformIFilesConfiguration, IWorkbenchEditorConfiguration {
	explorer: {
		openEditors: {
			visible: number;
			sortOrder: 'editorOrder' | 'alphabetical' | 'fullPath';
		};
		autoReveal: boolean | 'focusNoScroll';
		autoRevealExclude: IExpression;
		enableDragAndDrop: boolean;
		confirmDelete: boolean;
		enableUndo: boolean;
		confirmUndo: UndoConfirmLevel;
		expandSingleFolderWorkspaces: boolean;
		sortOrder: SortOrder;
		sortOrderLexicographicOptions: LexicographicOptions;
		sortOrderReverse: boolean;
		decorations: {
			colors: boolean;
			badges: boolean;
		};
		incrementalNaming: 'simple' | 'smart' | 'disabled';
		excludeGitIgnore: boolean;
		fileNesting: {
			enabled: boolean;
			expand: boolean;
			patterns: { [parent: string]: string };
		};
		autoOpenDroppedFile: boolean;
	};
	editor: IEditorOptions;
}

export interface IFileResource {
	resource: URI;
	isDirectory?: boolean;
}

export const enum SortOrder {
	Default = 'default',
	Mixed = 'mixed',
	FilesFirst = 'filesFirst',
	Type = 'type',
	Modified = 'modified',
	FoldersNestsFiles = 'foldersNestsFiles',
}

export const enum UndoConfirmLevel {
	Verbose = 'verbose',
	Default = 'default',
	Light = 'light',
}

export const enum LexicographicOptions {
	Default = 'default',
	Upper = 'upper',
	Lower = 'lower',
	Unicode = 'unicode',
}

export interface ISortOrderConfiguration {
	sortOrder: SortOrder;
	lexicographicOptions: LexicographicOptions;
	reverse: boolean;
}

export class TextFileContentProvider extends Disposable implements ITextModelContentProvider {
	private readonly fileWatcherDisposable = this._register(new MutableDisposable());

	constructor(
		@ITextFileService private readonly textFileService: ITextFileService,
		@IFileService private readonly fileService: IFileService,
		@ILanguageService private readonly languageService: ILanguageService,
		@IModelService private readonly modelService: IModelService
	) {
		super();
	}

	static async open(resource: URI, scheme: string, label: string, editorService: IEditorService, options?: ITextEditorOptions): Promise<void> {
		await editorService.openEditor({
			original: { resource: TextFileContentProvider.resourceToTextFile(scheme, resource) },
			modified: { resource },
			label,
			options
		});
	}

	private static resourceToTextFile(scheme: string, resource: URI): URI {
		return resource.with({ scheme, query: JSON.stringify({ scheme: resource.scheme, query: resource.query }) });
	}

	private static textFileToResource(resource: URI): URI {
		const { scheme, query } = JSON.parse(resource.query);

		return resource.with({ scheme, query });
	}

	async provideTextContent(resource: URI): Promise<ITextModel | null> {
		if (!resource.query) {
			// We require the URI to use the `query` to transport the original scheme and query
			// as done by `resourceToTextFile`
			return null;
		}

		const savedFileResource = TextFileContentProvider.textFileToResource(resource);

		// Make sure our text file is resolved up to date
		const codeEditorModel = await this.resolveEditorModel(resource);

		// Make sure to keep contents up to date when it changes
		if (!this.fileWatcherDisposable.value) {
			const disposables = new DisposableStore();
			this.fileWatcherDisposable.value = disposables;
			disposables.add(this.fileService.onDidFilesChange(changes => {
				if (changes.contains(savedFileResource, FileChangeType.UPDATED)) {
					this.resolveEditorModel(resource, false /* do not create if missing */); // update model when resource changes
				}
			}));

			if (codeEditorModel) {
				disposables.add(Event.once(codeEditorModel.onWillDispose)(() => this.fileWatcherDisposable.clear()));
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
				languageSelector = this.languageService.createById(textFileModel.getLanguageId());
			} else {
				languageSelector = this.languageService.createByFilepathOrFirstLine(savedFileResource);
			}

			codeEditorModel = this.modelService.createModel(content.value, languageSelector, resource);
		}

		return codeEditorModel;
	}
}

export class OpenEditor implements IEditorIdentifier {

	private id: number;
	private static COUNTER = 0;

	constructor(private _editor: EditorInput, private _group: IEditorGroup) {
		this.id = OpenEditor.COUNTER++;
	}

	get editor() {
		return this._editor;
	}

	get group() {
		return this._group;
	}

	get groupId() {
		return this._group.id;
	}

	getId(): string {
		return `openeditor:${this.groupId}:${this.id}`;
	}

	isPreview(): boolean {
		return !this._group.isPinned(this.editor);
	}

	isSticky(): boolean {
		return this._group.isSticky(this.editor);
	}

	getResource(): URI | undefined {
		return EditorResourceAccessor.getOriginalUri(this.editor, { supportSideBySide: SideBySideEditor.PRIMARY });
	}
}
