/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { equals } from '../../../base/common/arrays.js';
import { IDisposable } from '../../../base/common/lifecycle.js';
import { URI } from '../../../base/common/uri.js';
import { IUriIdentityService } from '../../uriIdentity/common/uriIdentity.js';
import { IRectangle } from '../../window/common/window.js';

export interface IResolvableEditorModel extends IDisposable {

	/**
	 * Resolves the model.
	 */
	resolve(): Promise<void>;

	/**
	 * Find out if the editor model was resolved or not.
	 */
	isResolved(): boolean;
}

export function isResolvedEditorModel(model: IDisposable | undefined | null): model is IResolvableEditorModel {
	const candidate = model as IResolvableEditorModel | undefined | null;

	return typeof candidate?.resolve === 'function'
		&& typeof candidate?.isResolved === 'function';
}

export interface IBaseUntypedEditorInput {

	/**
	 * Optional options to use when opening the input.
	 */
	options?: IEditorOptions;

	/**
	 * Label to show for the input.
	 */
	readonly label?: string;

	/**
	 * Description to show for the input.
	 */
	readonly description?: string;
}

export interface IBaseResourceEditorInput extends IBaseUntypedEditorInput {

	/**
	 * Hint to indicate that this input should be treated as a
	 * untitled file.
	 *
	 * Without this hint, the editor service will make a guess by
	 * looking at the scheme of the resource(s).
	 *
	 * Use `forceUntitled: true` when you pass in a `resource` that
	 * does not use the `untitled` scheme. The `resource` will then
	 * be used as associated path when saving the untitled file.
	 */
	readonly forceUntitled?: boolean;
}

export interface IBaseTextResourceEditorInput extends IBaseResourceEditorInput {

	/**
	 * Optional options to use when opening the text input.
	 */
	options?: ITextEditorOptions;

	/**
	 * The contents of the text input if known. If provided,
	 * the input will not attempt to load the contents from
	 * disk and may appear dirty.
	 */
	contents?: string;

	/**
	 * The encoding of the text input if known.
	 */
	encoding?: string;

	/**
	 * The identifier of the language id of the text input
	 * if known to use when displaying the contents.
	 */
	languageId?: string;
}

export interface IResourceEditorInput extends IBaseResourceEditorInput {

	/**
	 * The resource URI of the resource to open.
	 */
	readonly resource: URI;
}

export interface ITextResourceEditorInput extends IResourceEditorInput, IBaseTextResourceEditorInput {

	/**
	 * Optional options to use when opening the text input.
	 */
	options?: ITextEditorOptions;
}

/**
 * This identifier allows to uniquely identify an editor with a
 * resource, type and editor identifier.
 */
export interface IResourceEditorInputIdentifier {

	/**
	 * The type of the editor.
	 */
	readonly typeId: string;

	/**
	 * The identifier of the editor if provided.
	 */
	readonly editorId: string | undefined;

	/**
	 * The resource URI of the editor.
	 */
	readonly resource: URI;
}

export enum EditorActivation {

	/**
	 * Activate the editor after it opened. This will automatically restore
	 * the editor if it is minimized.
	 */
	ACTIVATE = 1,

	/**
	 * Only restore the editor if it is minimized but do not activate it.
	 *
	 * Note: will only work in combination with the `preserveFocus: true` option.
	 * Otherwise, if focus moves into the editor, it will activate and restore
	 * automatically.
	 */
	RESTORE,

	/**
	 * Preserve the current active editor.
	 *
	 * Note: will only work in combination with the `preserveFocus: true` option.
	 * Otherwise, if focus moves into the editor, it will activate and restore
	 * automatically.
	 */
	PRESERVE
}

export enum EditorResolution {

	/**
	 * Displays a picker and allows the user to decide which editor to use.
	 */
	PICK,

	/**
	 * Only exclusive editors are considered.
	 */
	EXCLUSIVE_ONLY
}

export enum EditorOpenSource {

	/**
	 * Default: the editor is opening via a programmatic call
	 * to the editor service API.
	 */
	API,

	/**
	 * Indicates that a user action triggered the opening, e.g.
	 * via mouse or keyboard use.
	 */
	USER
}

export interface IEditorOptions {

	/**
	 * Tells the editor to not receive keyboard focus when the editor is being opened.
	 *
	 * Will also not activate the group the editor opens in unless the group is already
	 * the active one. This behaviour can be overridden via the `activation` option.
	 */
	preserveFocus?: boolean;

	/**
	 * This option is only relevant if an editor is opened into a group that is not active
	 * already and allows to control if the inactive group should become active, restored
	 * or preserved.
	 *
	 * By default, the editor group will become active unless `preserveFocus` or `inactive`
	 * is specified.
	 */
	activation?: EditorActivation;

	/**
	 * Tells the editor to reload the editor input in the editor even if it is identical to the one
	 * already showing. By default, the editor will not reload the input if it is identical to the
	 * one showing.
	 */
	forceReload?: boolean;

	/**
	 * Will reveal the editor if it is already opened and visible in any of the opened editor groups.
	 *
	 * Note that this option is just a hint that might be ignored if the user wants to open an editor explicitly
	 * to the side of another one or into a specific editor group.
	 */
	revealIfVisible?: boolean;

	/**
	 * Will reveal the editor if it is already opened (even when not visible) in any of the opened editor groups.
	 *
	 * Note that this option is just a hint that might be ignored if the user wants to open an editor explicitly
	 * to the side of another one or into a specific editor group.
	 */
	revealIfOpened?: boolean;

	/**
	 * An editor that is pinned remains in the editor stack even when another editor is being opened.
	 * An editor that is not pinned will always get replaced by another editor that is not pinned.
	 */
	pinned?: boolean;

	/**
	 * An editor that is sticky moves to the beginning of the editors list within the group and will remain
	 * there unless explicitly closed. Operations such as "Close All" will not close sticky editors.
	 */
	sticky?: boolean;

	/**
	 * The index in the document stack where to insert the editor into when opening.
	 */
	index?: number;

	/**
	 * An active editor that is opened will show its contents directly. Set to true to open an editor
	 * in the background without loading its contents.
	 *
	 * Will also not activate the group the editor opens in unless the group is already
	 * the active one. This behaviour can be overridden via the `activation` option.
	 */
	inactive?: boolean;

	/**
	 * In case of an error opening the editor, will not present this error to the user (e.g. by showing
	 * a generic placeholder in the editor area). So it is up to the caller to provide error information
	 * in that case.
	 *
	 * By default, an error when opening an editor will result in a placeholder editor that shows the error.
	 * In certain cases a modal dialog may be presented to ask the user for further action.
	 */
	ignoreError?: boolean;

	/**
	 * Allows to override the editor that should be used to display the input:
	 * - `undefined`: let the editor decide for itself
	 * - `string`: specific override by id
	 * - `EditorResolution`: specific override handling
	 */
	override?: string | EditorResolution;

	/**
	 * A optional hint to signal in which context the editor opens.
	 *
	 * If configured to be `EditorOpenSource.USER`, this hint can be
	 * used in various places to control the experience. For example,
	 * if the editor to open fails with an error, a notification could
	 * inform about this in a modal dialog. If the editor opened through
	 * some background task, the notification would show in the background,
	 * not as a modal dialog.
	 */
	source?: EditorOpenSource;

	/**
	 * An optional property to signal that certain view state should be
	 * applied when opening the editor.
	 */
	viewState?: object;

	/**
	 * A transient editor will attempt to appear as preview and certain components
	 * (such as history tracking) may decide to ignore the editor when it becomes
	 * active.
	 * This option is meant to be used only when the editor is used for a short
	 * period of time, for example when opening a preview of the editor from a
	 * picker control in the background while navigating through results of the picker.
	 *
	 * Note: an editor that is already opened in a group that is not transient, will
	 * not turn transient.
	 */
	transient?: boolean;

	/**
	 * Options that only apply when `AUX_WINDOW_GROUP` is used for opening.
	 */
	auxiliary?: {

		/**
		 * Define the bounds of the editor window.
		 */
		bounds?: Partial<IRectangle>;

		/**
		 * Show editor compact, hiding unnecessary elements.
		 */
		compact?: boolean;

		/**
		 * Show the editor always on top of other windows.
		 */
		alwaysOnTop?: boolean;
	};
}

export interface ITextEditorSelection {
	readonly startLineNumber: number;
	readonly startColumn: number;
	readonly endLineNumber?: number;
	readonly endColumn?: number;
}

export const enum TextEditorSelectionRevealType {
	/**
	 * Option to scroll vertically or horizontally as necessary and reveal a range centered vertically.
	 */
	Center = 0,

	/**
	 * Option to scroll vertically or horizontally as necessary and reveal a range centered vertically only if it lies outside the viewport.
	 */
	CenterIfOutsideViewport = 1,

	/**
	 * Option to scroll vertically or horizontally as necessary and reveal a range close to the top of the viewport, but not quite at the top.
	 */
	NearTop = 2,

	/**
	 * Option to scroll vertically or horizontally as necessary and reveal a range close to the top of the viewport, but not quite at the top.
	 * Only if it lies outside the viewport
	 */
	NearTopIfOutsideViewport = 3,
}

export const enum TextEditorSelectionSource {

	/**
	 * Programmatic source indicates a selection change that
	 * was not triggered by the user via keyboard or mouse
	 * but through text editor APIs.
	 */
	PROGRAMMATIC = 'api',

	/**
	 * Navigation source indicates a selection change that
	 * was caused via some command or UI component such as
	 * an outline tree.
	 */
	NAVIGATION = 'code.navigation',

	/**
	 * Jump source indicates a selection change that
	 * was caused from within the text editor to another
	 * location in the same or different text editor such
	 * as "Go to definition".
	 */
	JUMP = 'code.jump'
}

export interface ITextEditorOptions extends IEditorOptions {

	/**
	 * Text editor selection.
	 */
	selection?: ITextEditorSelection;

	/**
	 * Option to control the text editor selection reveal type.
	 * Defaults to TextEditorSelectionRevealType.Center
	 */
	selectionRevealType?: TextEditorSelectionRevealType;

	/**
	 * Source of the call that caused the selection.
	 */
	selectionSource?: TextEditorSelectionSource | string;
}

export type ITextEditorChange = [
	originalStartLineNumber: number,
	originalEndLineNumberExclusive: number,
	modifiedStartLineNumber: number,
	modifiedEndLineNumberExclusive: number
];

export interface ITextEditorDiffInformation {
	readonly documentVersion: number;
	readonly original: URI | undefined;
	readonly modified: URI;
	readonly changes: readonly ITextEditorChange[];
}

export function isTextEditorDiffInformationEqual(
	uriIdentityService: IUriIdentityService,
	diff1: ITextEditorDiffInformation | undefined,
	diff2: ITextEditorDiffInformation | undefined): boolean {
	return diff1?.documentVersion === diff2?.documentVersion &&
		uriIdentityService.extUri.isEqual(diff1?.original, diff2?.original) &&
		uriIdentityService.extUri.isEqual(diff1?.modified, diff2?.modified) &&
		equals<ITextEditorChange>(diff1?.changes, diff2?.changes, (a, b) => {
			return a[0] === b[0] && a[1] === b[1] && a[2] === b[2] && a[3] === b[3];
		});
}
