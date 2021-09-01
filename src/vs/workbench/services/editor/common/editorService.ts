/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IResourceEditorInput, IEditorOptions, IResourceEditorInputIdentifier, ITextResourceEditorInput } from 'vs/platform/editor/common/editor';
import { IEditorInput, IEditorPane, GroupIdentifier, IEditorInputWithOptions, IUntitledTextResourceEditorInput, IResourceDiffEditorInput, ITextEditorPane, ITextDiffEditorPane, IEditorIdentifier, ISaveOptions, IRevertOptions, EditorsOrder, IVisibleEditorPane, IEditorCloseEvent, IUntypedEditorInput, IFileEditorInput, IUntypedFileEditorInput } from 'vs/workbench/common/editor';
import { Event } from 'vs/base/common/event';
import { IEditor, IDiffEditor } from 'vs/editor/common/editorCommon';
import { IEditorGroup, IEditorReplacement, isEditorGroup } from 'vs/workbench/services/editor/common/editorGroupsService';
import { URI } from 'vs/base/common/uri';
import { EditorInput } from 'vs/workbench/common/editor/editorInput';

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

export type PreferredGroup = IEditorGroup | GroupIdentifier | SIDE_GROUP_TYPE | ACTIVE_GROUP_TYPE;

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

export interface IUntypedEditorReplacement {
	readonly editor: IEditorInput;
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
	readonly includeUntitled?: boolean;

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
	 * An aggregated event for a set of editor related events
	 * across all editor groups:
	 * - active editor changes
	 * - editors opening/closing
	 * - editors moving
	 * - groups moving (unless they are empty)
	 */
	readonly onDidEditorsChange: Event<void>;

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
	readonly activeEditor: IEditorInput | undefined;

	/**
	 * The currently active text editor control or `undefined` if there is currently no active
	 * editor or the active editor widget is neither a text nor a diff editor.
	 *
	 * @see {@link IEditorService.activeEditor}
	 */
	readonly activeTextEditorControl: IEditor | IDiffEditor | undefined;

	/**
	 * The currently active text editor mode or `undefined` if there is currently no active
	 * editor or the active editor control is neither a text nor a diff editor. If the active
	 * editor is a diff editor, the modified side's mode will be taken.
	 */
	readonly activeTextEditorMode: string | undefined;

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
	readonly visibleEditors: readonly IEditorInput[];

	/**
	 * All text editor widgets that are currently visible across all editor groups. A text editor
	 * widget is either a text or a diff editor.
	 */
	readonly visibleTextEditorControls: readonly (IEditor | IDiffEditor)[];

	/**
	 * All editors that are opened across all editor groups in sequential order
	 * of appearance.
	 *
	 * This includes active as well as inactive editors in each editor group.
	 */
	readonly editors: readonly IEditorInput[];

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
	 * active group. Use `SIDE_GROUP_TYPE` to open the editor in a new editor group to the side
	 * of the currently active group.
	 *
	 * @returns the editor that opened or `undefined` if the operation failed or the editor was not
	 * opened to be active.
	 */
	openEditor(editor: IEditorInput, options?: IEditorOptions, group?: IEditorGroup | GroupIdentifier | SIDE_GROUP_TYPE | ACTIVE_GROUP_TYPE): Promise<IEditorPane | undefined>;
	openEditor(editor: IResourceEditorInput, group?: IEditorGroup | GroupIdentifier | SIDE_GROUP_TYPE | ACTIVE_GROUP_TYPE): Promise<IEditorPane | undefined>;
	openEditor(editor: ITextResourceEditorInput | IUntitledTextResourceEditorInput, group?: IEditorGroup | GroupIdentifier | SIDE_GROUP_TYPE | ACTIVE_GROUP_TYPE): Promise<ITextEditorPane | undefined>;
	openEditor(editor: IResourceDiffEditorInput, group?: IEditorGroup | GroupIdentifier | SIDE_GROUP_TYPE | ACTIVE_GROUP_TYPE): Promise<ITextDiffEditorPane | undefined>;
	openEditor(editor: IUntypedEditorInput, group?: IEditorGroup | GroupIdentifier | SIDE_GROUP_TYPE | ACTIVE_GROUP_TYPE): Promise<IEditorPane | undefined>;

	/**
	 * Open editors in an editor group.
	 *
	 * @param editors the editors to open with associated options
	 * @param group the target group. If unspecified, the editor will open in the currently
	 * active group. Use `SIDE_GROUP_TYPE` to open the editor in a new editor group to the side
	 * of the currently active group.
	 *
	 * @returns the editors that opened. The array can be empty or have less elements for editors
	 * that failed to open or were instructed to open as inactive.
	 */
	openEditors(editors: IEditorInputWithOptions[], group?: IEditorGroup | GroupIdentifier | SIDE_GROUP_TYPE | ACTIVE_GROUP_TYPE, options?: IOpenEditorsOptions): Promise<readonly IEditorPane[]>;
	openEditors(editors: IUntypedEditorInput[], group?: IEditorGroup | GroupIdentifier | SIDE_GROUP_TYPE | ACTIVE_GROUP_TYPE, options?: IOpenEditorsOptions): Promise<readonly IEditorPane[]>;

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
	replaceEditors(replacements: IEditorReplacement[], group: IEditorGroup | GroupIdentifier): Promise<void>;

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
	isVisible(editor: IEditorInput): boolean;

	/**
	 * This method will return an entry for each editor that reports
	 * a `resource` that matches the provided one in the group or
	 * across all groups.
	 *
	 * It is possible that multiple editors are returned in case the
	 * same resource is opened in different editors. To find the specific
	 * editor, use the `IResourceEditorInputIdentifier` as input.
	 */
	findEditors(resource: URI): readonly IEditorIdentifier[];
	findEditors(editor: IResourceEditorInputIdentifier): readonly IEditorIdentifier[];
	findEditors(resource: URI, group: IEditorGroup | GroupIdentifier): readonly IEditorInput[];
	findEditors(editor: IResourceEditorInputIdentifier, group: IEditorGroup | GroupIdentifier): IEditorInput | undefined;

	/**
	 * Converts a lightweight input to a workbench editor input.
	 */
	createEditorInput(input: IUntypedEditorInput): EditorInput;
	createEditorInput(input: IUntypedFileEditorInput): IFileEditorInput;

	/**
	 * Save the provided list of editors.
	 *
	 * @returns `true` if all editors saved and `false` otherwise.
	 */
	save(editors: IEditorIdentifier | IEditorIdentifier[], options?: ISaveEditorsOptions): Promise<boolean>;

	/**
	 * Save all editors.
	 *
	 * @returns `true` if all editors saved and `false` otherwise.
	 */
	saveAll(options?: ISaveAllEditorsOptions): Promise<boolean>;

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
}
