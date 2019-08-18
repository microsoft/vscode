/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator, ServiceIdentifier, ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { IResourceInput, IEditorOptions, ITextEditorOptions } from 'vs/platform/editor/common/editor';
import { IEditorInput, IEditor, GroupIdentifier, IEditorInputWithOptions, IUntitledResourceInput, IResourceDiffInput, IResourceSideBySideInput, ITextEditor, ITextDiffEditor, ITextSideBySideEditor } from 'vs/workbench/common/editor';
import { Event } from 'vs/base/common/event';
import { IEditor as ICodeEditor } from 'vs/editor/common/editorCommon';
import { IEditorGroup, IEditorReplacement } from 'vs/workbench/services/editor/common/editorGroupsService';
import { IDisposable } from 'vs/base/common/lifecycle';

export const IEditorService = createDecorator<IEditorService>('editorService');

export type IResourceEditor = IResourceInput | IUntitledResourceInput | IResourceDiffInput | IResourceSideBySideInput;

export interface IResourceEditorReplacement {
	editor: IResourceEditor;
	replacement: IResourceEditor;
}

export const ACTIVE_GROUP = -1;
export type ACTIVE_GROUP_TYPE = typeof ACTIVE_GROUP;

export const SIDE_GROUP = -2;
export type SIDE_GROUP_TYPE = typeof SIDE_GROUP;

export interface IOpenEditorOverrideHandler {
	(editor: IEditorInput, options: IEditorOptions | ITextEditorOptions | undefined, group: IEditorGroup): IOpenEditorOverride | undefined;
}

export interface IOpenEditorOverride {

	/**
	 * If defined, will prevent the opening of an editor and replace the resulting
	 * promise with the provided promise for the openEditor() call.
	 */
	override?: Promise<IEditor | undefined>;
}

export interface IVisibleEditor extends IEditor {
	input: IEditorInput;
	group: IEditorGroup;
}

export interface IEditorService {

	_serviceBrand: ServiceIdentifier<any>;

	/**
	 * Emitted when the currently active editor changes.
	 *
	 * @see `IEditorService.activeEditor`
	 */
	readonly onDidActiveEditorChange: Event<void>;

	/**
	 * Emitted when any of the current visible editors changes.
	 *
	 * @see `IEditorService.visibleEditors`
	 */
	readonly onDidVisibleEditorsChange: Event<void>;

	/**
	 * The currently active editor or `undefined` if none. An editor is active when it is
	 * located in the currently active editor group. It will be `undefined` if the active
	 * editor group has no editors open.
	 */
	readonly activeEditor: IEditorInput | undefined;

	/**
	 * The currently active editor control or `undefined` if none. The editor control is
	 * the workbench container for editors of any kind.
	 *
	 * @see `IEditorService.activeEditor`
	 */
	readonly activeControl: IVisibleEditor | undefined;

	/**
	 * The currently active text editor widget or `undefined` if there is currently no active
	 * editor or the active editor widget is neither a text nor a diff editor.
	 *
	 * @see `IEditorService.activeEditor`
	 */
	readonly activeTextEditorWidget: ICodeEditor | undefined;

	/**
	 * All editors that are currently visible. An editor is visible when it is opened in an
	 * editor group and active in that group. Multiple editor groups can be opened at the same time.
	 */
	readonly visibleEditors: ReadonlyArray<IEditorInput>;

	/**
	 * All editor controls that are currently visible across all editor groups.
	 */
	readonly visibleControls: ReadonlyArray<IVisibleEditor>;

	/**
	 * All text editor widgets that are currently visible across all editor groups. A text editor
	 * widget is either a text or a diff editor.
	 */
	readonly visibleTextEditorWidgets: ReadonlyArray<ICodeEditor>;

	/**
	 * All editors that are opened across all editor groups. This includes active as well as inactive
	 * editors in each editor group.
	 */
	readonly editors: ReadonlyArray<IEditorInput>;

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
	openEditor(editor: IEditorInput, options?: IEditorOptions | ITextEditorOptions, group?: IEditorGroup | GroupIdentifier | SIDE_GROUP_TYPE | ACTIVE_GROUP_TYPE): Promise<IEditor | undefined>;
	openEditor(editor: IResourceInput | IUntitledResourceInput, group?: IEditorGroup | GroupIdentifier | SIDE_GROUP_TYPE | ACTIVE_GROUP_TYPE): Promise<ITextEditor | undefined>;
	openEditor(editor: IResourceDiffInput, group?: IEditorGroup | GroupIdentifier | SIDE_GROUP_TYPE | ACTIVE_GROUP_TYPE): Promise<ITextDiffEditor | undefined>;
	openEditor(editor: IResourceSideBySideInput, group?: IEditorGroup | GroupIdentifier | SIDE_GROUP_TYPE | ACTIVE_GROUP_TYPE): Promise<ITextSideBySideEditor | undefined>;

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
	openEditors(editors: IEditorInputWithOptions[], group?: IEditorGroup | GroupIdentifier | SIDE_GROUP_TYPE | ACTIVE_GROUP_TYPE): Promise<ReadonlyArray<IEditor>>;
	openEditors(editors: IResourceEditor[], group?: IEditorGroup | GroupIdentifier | SIDE_GROUP_TYPE | ACTIVE_GROUP_TYPE): Promise<ReadonlyArray<IEditor>>;

	/**
	 * Replaces editors in an editor group with the provided replacement.
	 *
	 * @param editors the editors to replace
	 *
	 * @returns a promise that is resolved when the replaced active
	 * editor (if any) has finished loading.
	 */
	replaceEditors(editors: IResourceEditorReplacement[], group: IEditorGroup | GroupIdentifier): Promise<void>;
	replaceEditors(editors: IEditorReplacement[], group: IEditorGroup | GroupIdentifier): Promise<void>;

	/**
	 * Find out if the provided editor (or resource of an editor) is opened in any or
	 * a specific editor group.
	 *
	 * Note: An editor can be opened but not actively visible.
	 *
	 * @param group optional to specify a group to check for the editor being opened
	 */
	isOpen(editor: IEditorInput | IResourceInput | IUntitledResourceInput, group?: IEditorGroup | GroupIdentifier): boolean;

	/**
	 * Get the actual opened editor input in any or a specific editor group based on the resource.
	 *
	 * Note: An editor can be opened but not actively visible.
	 *
	 * @param group optional to specify a group to check for the editor
	 */
	getOpened(editor: IResourceInput | IUntitledResourceInput, group?: IEditorGroup | GroupIdentifier): IEditorInput | undefined;

	/**
	 * Allows to override the opening of editors by installing a handler that will
	 * be called each time an editor is about to open allowing to override the
	 * operation to open a different editor.
	 */
	overrideOpenEditor(handler: IOpenEditorOverrideHandler): IDisposable;

	/**
	 * Invoke a function in the context of the services of the active editor.
	 */
	invokeWithinEditorContext<T>(fn: (accessor: ServicesAccessor) => T): T;

	/**
	 * Converts a lightweight input to a workbench editor input.
	 */
	createInput(input: IResourceEditor): IEditorInput | null;
}
