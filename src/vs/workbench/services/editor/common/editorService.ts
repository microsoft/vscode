/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IResourceEditorInput, IEditorOptions, IResourceEditorInputIdentifier, ITextResourceEditorInput } from 'vs/platform/editor/common/editor';
import { IEditorPane, GroupIdentifier, IUntitledTextResourceEditorInput, IResourceDiffEditorInput, ITextDiffEditorPane, IEditorIdentifier, ISaveOptions, IRevertOptions, EditorsOrder, IVisibleEditorPane, IEditorCloseEvent, IUntypedEditorInput, IFindEditorOptions, IEditorWillOpenEvent } from 'vs/workbench/common/editor';
import { EditorInput } from 'vs/workbench/common/editor/editorInput';
import { Event } from 'vs/base/common/event';
import { IEditor, IDiffEditor } from 'vs/editor/common/editorCommon';
import { ICloseEditorOptions, IEditorGroup, IEditorGroupsContainer, isEditorGroup } from 'vs/workbench/services/editor/common/editorGroupsService';
import { URI } from 'vs/base/common/uri';
import { IGroupModelChangeEvent } from 'vs/workbench/common/editor/editorGroupModel';
import { DisposableStore } from 'vs/base/common/lifecycle';

export const IEditorService = createDecorator<IEditorService>('editorService');

/**
 * Open an editor in the currently active group.
 */
export const ACTIVE_GROUP = -1;
export type ACTIVE_GROUP_TYPE = typeof ACTIVE_GROUP;

/**
 * Open an editor to the side of the active group.
 */
export const SIDE_GROUP = -2;
export type SIDE_GROUP_TYPE = typeof SIDE_GROUP;

/**
 * Open an editor in a new auxiliary window.
 */
export const AUX_WINDOW_GROUP = -3;
export type AUX_WINDOW_GROUP_TYPE = typeof AUX_WINDOW_GROUP;

export type PreferredGroup = IEditorGroup | GroupIdentifier | SIDE_GROUP_TYPE | ACTIVE_GROUP_TYPE | AUX_WINDOW_GROUP_TYPE;

export function isPreferredGroup(obj: unknown): obj is PreferredGroup {
	const candidate = obj as PreferredGroup | undefined;

	return typeof obj === 'number' || isEditorGroup(candidate);
}

export interface ISaveEditorsOptions extends ISaveOptions {

	/**
	 * If true, will ask for a location of the editor to save to.
	 */
	readonly saveAs?: boolean;
}

export interface ISaveEditorsResult {

	/**
	 * Whether the save operation was successful.
	 */
	readonly success: boolean;

	/**
	 * Resulting editors after the save operation.
	 */
	readonly editors: Array<EditorInput | IUntypedEditorInput>;
}

export interface IUntypedEditorReplacement {

	/**
	 * The editor to replace.
	 */
	readonly editor: EditorInput;

	/**
	 * The replacement for the editor.
	 */
	readonly replacement: IUntypedEditorInput;

	/**
	 * Skips asking the user for confirmation and doesn't
	 * save the document. Only use this if you really need to!
	*/
	forceReplaceDirty?: boolean;
}

export interface IBaseSaveRevertAllEditorOptions {

	/**
	 * Whether to include untitled editors as well.
	 */
	readonly includeUntitled?: {

		/**
		 * Whether to include scratchpad editors.
		 * Scratchpads are not included if not specified.
		 */
		readonly includeScratchpad: boolean;

	} | boolean;

	/**
	 * Whether to exclude sticky editors.
	 */
	readonly excludeSticky?: boolean;
}

export interface ISaveAllEditorsOptions extends ISaveEditorsOptions, IBaseSaveRevertAllEditorOptions { }

export interface IRevertAllEditorsOptions extends IRevertOptions, IBaseSaveRevertAllEditorOptions { }

export interface IOpenEditorsOptions {

	/**
	 * Whether to validate trust when opening editors
	 * that are potentially not inside the workspace.
	 */
	readonly validateTrust?: boolean;
}

export interface IEditorsChangeEvent {
	/**
	 * The group which had the editor change
	 */
	groupId: GroupIdentifier;
	/*
	 * The event fired from the model
	 */
	event: IGroupModelChangeEvent;
}

export interface IEditorService {

	readonly _serviceBrand: undefined;

	/**
	 * Emitted when the currently active editor changes.
	 *
	 * @see {@link IEditorService.activeEditorPane}
	 */
	readonly onDidActiveEditorChange: Event<void>;

	/**
	 * Emitted when any of the current visible editors changes.
	 *
	 * @see {@link IEditorService.visibleEditorPanes}
	 */
	readonly onDidVisibleEditorsChange: Event<void>;

	/**
	 * An aggregated event for any change to any editor across
	 * all groups.
	 */
	readonly onDidEditorsChange: Event<IEditorsChangeEvent>;

	/**
	 * Emitted when an editor is about to open.
	 */
	readonly onWillOpenEditor: Event<IEditorWillOpenEvent>;

	/**
	 * Emitted when an editor is closed.
	 */
	readonly onDidCloseEditor: Event<IEditorCloseEvent>;

	/**
	 * The currently active editor pane or `undefined` if none. The editor pane is
	 * the workbench container for editors of any kind.
	 *
	 * @see {@link IEditorService.activeEditor} for access to the active editor input
	 */
	readonly activeEditorPane: IVisibleEditorPane | undefined;

	/**
	 * The currently active editor or `undefined` if none. An editor is active when it is
	 * located in the currently active editor group. It will be `undefined` if the active
	 * editor group has no editors open.
	 */
	readonly activeEditor: EditorInput | undefined;

	/**
	 * The currently active text editor control or `undefined` if there is currently no active
	 * editor or the active editor widget is neither a text nor a diff editor.
	 *
	 * @see {@link IEditorService.activeEditor}
	 */
	readonly activeTextEditorControl: IEditor | IDiffEditor | undefined;

	/**
	 * The currently active text editor language id or `undefined` if there is currently no active
	 * editor or the active editor control is neither a text nor a diff editor. If the active
	 * editor is a diff editor, the modified side's language id will be taken.
	 */
	readonly activeTextEditorLanguageId: string | undefined;

	/**
	 * All editor panes that are currently visible across all editor groups.
	 *
	 * @see {@link IEditorService.visibleEditors} for access to the visible editor inputs
	 */
	readonly visibleEditorPanes: readonly IVisibleEditorPane[];

	/**
	 * All editors that are currently visible. An editor is visible when it is opened in an
	 * editor group and active in that group. Multiple editor groups can be opened at the same time.
	 */
	readonly visibleEditors: readonly EditorInput[];

	/**
	 * All text editor widgets that are currently visible across all editor groups. A text editor
	 * widget is either a text or a diff editor.
	 *
	 * This property supports side-by-side editors as well, by returning both sides if they are
	 * text editor widgets.
	 */
	readonly visibleTextEditorControls: readonly (IEditor | IDiffEditor)[];

	/**
	 * All editors that are opened across all editor groups in sequential order
	 * of appearance.
	 *
	 * This includes active as well as inactive editors in each editor group.
	 */
	readonly editors: readonly EditorInput[];

	/**
	 * The total number of editors that are opened either inactive or active.
	 */
	readonly count: number;

	/**
	 * All editors that are opened across all editor groups with their group
	 * identifier.
	 *
	 * @param order the order of the editors to use
	 * @param options whether to exclude sticky editors or not
	 */
	getEditors(order: EditorsOrder, options?: { excludeSticky?: boolean }): readonly IEditorIdentifier[];

	/**
	 * Open an editor in an editor group.
	 *
	 * @param editor the editor to open
	 * @param options the options to use for the editor
	 * @param group the target group. If unspecified, the editor will open in the currently
	 * active group. Use `SIDE_GROUP` to open the editor in a new editor group to the side
	 * of the currently active group.
	 *
	 * @returns the editor that opened or `undefined` if the operation failed or the editor was not
	 * opened to be active.
	 */
	openEditor(editor: IResourceEditorInput, group?: IEditorGroup | GroupIdentifier | SIDE_GROUP_TYPE | ACTIVE_GROUP_TYPE | AUX_WINDOW_GROUP_TYPE): Promise<IEditorPane | undefined>;
	openEditor(editor: ITextResourceEditorInput | IUntitledTextResourceEditorInput, group?: IEditorGroup | GroupIdentifier | SIDE_GROUP_TYPE | ACTIVE_GROUP_TYPE | AUX_WINDOW_GROUP_TYPE): Promise<IEditorPane | undefined>;
	openEditor(editor: IResourceDiffEditorInput, group?: IEditorGroup | GroupIdentifier | SIDE_GROUP_TYPE | ACTIVE_GROUP_TYPE | AUX_WINDOW_GROUP_TYPE): Promise<ITextDiffEditorPane | undefined>;
	openEditor(editor: IUntypedEditorInput, group?: IEditorGroup | GroupIdentifier | SIDE_GROUP_TYPE | ACTIVE_GROUP_TYPE | AUX_WINDOW_GROUP_TYPE): Promise<IEditorPane | undefined>;

	/**
	 * @deprecated using this method is a sign that your editor has not adopted the editor
	 * resolver yet. Please use `IEditorResolverService.registerEditor` to make your editor
	 * known to the workbench and then use untyped editor inputs for opening:
	 *
	 * ```ts
	 * editorService.openEditor({ resource });
	 * ```
	 *
	 * If you already have an `EditorInput` in hand and must use it for opening, use `group.openEditor`
	 * instead, via `IEditorGroupsService`.
	 */
	openEditor(editor: EditorInput, options?: IEditorOptions, group?: IEditorGroup | GroupIdentifier | SIDE_GROUP_TYPE | ACTIVE_GROUP_TYPE | AUX_WINDOW_GROUP_TYPE): Promise<IEditorPane | undefined>;

	/**
	 * Open editors in an editor group.
	 *
	 * @param editors the editors to open with associated options
	 * @param group the target group. If unspecified, the editor will open in the currently
	 * active group. Use `SIDE_GROUP` to open the editor in a new editor group to the side
	 * of the currently active group.
	 *
	 * @returns the editors that opened. The array can be empty or have less elements for editors
	 * that failed to open or were instructed to open as inactive.
	 */
	openEditors(editors: IUntypedEditorInput[], group?: IEditorGroup | GroupIdentifier | SIDE_GROUP_TYPE | ACTIVE_GROUP_TYPE | AUX_WINDOW_GROUP_TYPE, options?: IOpenEditorsOptions): Promise<readonly IEditorPane[]>;

	/**
	 * Replaces editors in an editor group with the provided replacement.
	 *
	 * @param replacements the editors to replace
	 * @param group the editor group
	 *
	 * @returns a promise that is resolved when the replaced active
	 * editor (if any) has finished loading.
	 */
	replaceEditors(replacements: IUntypedEditorReplacement[], group: IEditorGroup | GroupIdentifier): Promise<void>;

	/**
	 * Find out if the provided editor is opened in any editor group.
	 *
	 * Note: An editor can be opened but not actively visible.
	 *
	 * Note: This method will return `true` if a side by side editor
	 * is opened where the `primary` editor matches too.
	 */
	isOpened(editor: IResourceEditorInputIdentifier): boolean;

	/**
	 * Find out if the provided editor is visible in any editor group.
	 */
	isVisible(editor: EditorInput): boolean;

	/**
	 * Close an editor in a specific editor group.
	 */
	closeEditor(editor: IEditorIdentifier, options?: ICloseEditorOptions): Promise<void>;

	/**
	 * Close multiple editors in specific editor groups.
	 */
	closeEditors(editors: readonly IEditorIdentifier[], options?: ICloseEditorOptions): Promise<void>;

	/**
	 * This method will return an entry for each editor that reports
	 * a `resource` that matches the provided one in the group or
	 * across all groups.
	 *
	 * It is possible that multiple editors are returned in case the
	 * same resource is opened in different editors. To find the specific
	 * editor, use the `IResourceEditorInputIdentifier` as input.
	 */
	findEditors(resource: URI, options?: IFindEditorOptions): readonly IEditorIdentifier[];
	findEditors(editor: IResourceEditorInputIdentifier, options?: IFindEditorOptions): readonly IEditorIdentifier[];

	/**
	 * Save the provided list of editors.
	 */
	save(editors: IEditorIdentifier | IEditorIdentifier[], options?: ISaveEditorsOptions): Promise<ISaveEditorsResult>;

	/**
	 * Save all editors.
	 */
	saveAll(options?: ISaveAllEditorsOptions): Promise<ISaveEditorsResult>;

	/**
	 * Reverts the provided list of editors.
	 *
	 * @returns `true` if all editors reverted and `false` otherwise.
	 */
	revert(editors: IEditorIdentifier | IEditorIdentifier[], options?: IRevertOptions): Promise<boolean>;

	/**
	 * Reverts all editors.
	 *
	 * @returns `true` if all editors reverted and `false` otherwise.
	 */
	revertAll(options?: IRevertAllEditorsOptions): Promise<boolean>;

	/**
	 * Create a scoped editor service that only operates on the provided
	 * editor group container. Use `main` to create a scoped editor service
	 * to the main editor group container of the main window.
	 */
	createScoped(editorGroupsContainer: IEditorGroupsContainer | 'main', disposables: DisposableStore): IEditorService;
}
