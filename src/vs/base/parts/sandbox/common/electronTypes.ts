/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/


// #######################################################################
// ###                                                                 ###
// ###      electron.d.ts types we need in a common layer for reuse    ###
// ###                    (copied from Electron 29.x)                  ###
// ###                                                                 ###
// #######################################################################

export interface MessageBoxOptions {
	/**
	 * Content of the message box.
	 */
	message: string;
	/**
	 * Can be `none`, `info`, `error`, `question` or `warning`. On Windows, `question`
	 * displays the same icon as `info`, unless you set an icon using the `icon`
	 * option. On macOS, both `warning` and `error` display the same warning icon.
	 */
	type?: ('none' | 'info' | 'error' | 'question' | 'warning');
	/**
	 * Array of texts for buttons. On Windows, an empty array will result in one button
	 * labeled "OK".
	 */
	buttons?: string[];
	/**
	 * Index of the button in the buttons array which will be selected by default when
	 * the message box opens.
	 */
	defaultId?: number;
	/**
	 * Pass an instance of AbortSignal to optionally close the message box, the message
	 * box will behave as if it was cancelled by the user. On macOS, `signal` does not
	 * work with message boxes that do not have a parent window, since those message
	 * boxes run synchronously due to platform limitations.
	 */
	signal?: AbortSignal;
	/**
	 * Title of the message box, some platforms will not show it.
	 */
	title?: string;
	/**
	 * Extra information of the message.
	 */
	detail?: string;
	/**
	 * If provided, the message box will include a checkbox with the given label.
	 */
	checkboxLabel?: string;
	/**
	 * Initial checked state of the checkbox. `false` by default.
	 */
	checkboxChecked?: boolean;
	/**
	 * Custom width of the text in the message box.
	 *
	 * @platform darwin
	 */
	textWidth?: number;
	/**
	 * The index of the button to be used to cancel the dialog, via the `Esc` key. By
	 * default this is assigned to the first button with "cancel" or "no" as the label.
	 * If no such labeled buttons exist and this option is not set, `0` will be used as
	 * the return value.
	 */
	cancelId?: number;
	/**
	 * On Windows Electron will try to figure out which one of the `buttons` are common
	 * buttons (like "Cancel" or "Yes"), and show the others as command links in the
	 * dialog. This can make the dialog appear in the style of modern Windows apps. If
	 * you don't like this behavior, you can set `noLink` to `true`.
	 */
	noLink?: boolean;
	/**
	 * Normalize the keyboard access keys across platforms. Default is `false`.
	 * Enabling this assumes `&` is used in the button labels for the placement of the
	 * keyboard shortcut access key and labels will be converted so they work correctly
	 * on each platform, `&` characters are removed on macOS, converted to `_` on
	 * Linux, and left untouched on Windows. For example, a button label of `Vie&w`
	 * will be converted to `Vie_w` on Linux and `View` on macOS and can be selected
	 * via `Alt-W` on Windows and Linux.
	 */
	normalizeAccessKeys?: boolean;
}

export interface MessageBoxReturnValue {
	/**
	 * The index of the clicked button.
	 */
	response: number;
	/**
	 * The checked state of the checkbox if `checkboxLabel` was set. Otherwise `false`.
	 */
	checkboxChecked: boolean;
}

export interface SaveDialogOptions {
	/**
	 * The dialog title. Cannot be displayed on some _Linux_ desktop environments.
	 */
	title?: string;
	/**
	 * Absolute directory path, absolute file path, or file name to use by default.
	 */
	defaultPath?: string;
	/**
	 * Custom label for the confirmation button, when left empty the default label will
	 * be used.
	 */
	buttonLabel?: string;
	filters?: FileFilter[];
	/**
	 * Message to display above text fields.
	 *
	 * @platform darwin
	 */
	message?: string;
	/**
	 * Custom label for the text displayed in front of the filename text field.
	 *
	 * @platform darwin
	 */
	nameFieldLabel?: string;
	/**
	 * Show the tags input box, defaults to `true`.
	 *
	 * @platform darwin
	 */
	showsTagField?: boolean;
	properties?: Array<'showHiddenFiles' | 'createDirectory' | 'treatPackageAsDirectory' | 'showOverwriteConfirmation' | 'dontAddToRecent'>;
	/**
	 * Create a security scoped bookmark when packaged for the Mac App Store. If this
	 * option is enabled and the file doesn't already exist a blank file will be
	 * created at the chosen path.
	 *
	 * @platform darwin,mas
	 */
	securityScopedBookmarks?: boolean;
}

export interface SaveDialogReturnValue {
	/**
	 * whether or not the dialog was canceled.
	 */
	canceled: boolean;
	/**
	 * If the dialog is canceled, this will be an empty string.
	 */
	filePath: string;
	/**
	 * Base64 encoded string which contains the security scoped bookmark data for the
	 * saved file. `securityScopedBookmarks` must be enabled for this to be present.
	 * (For return values, see table here.)
	 *
	 * @platform darwin,mas
	 */
	bookmark?: string;
}

export interface OpenDialogOptions {
	title?: string;
	defaultPath?: string;
	/**
	 * Custom label for the confirmation button, when left empty the default label will
	 * be used.
	 */
	buttonLabel?: string;
	filters?: FileFilter[];
	/**
	 * Contains which features the dialog should use. The following values are
	 * supported:
	 */
	properties?: Array<'openFile' | 'openDirectory' | 'multiSelections' | 'showHiddenFiles' | 'createDirectory' | 'promptToCreate' | 'noResolveAliases' | 'treatPackageAsDirectory' | 'dontAddToRecent'>;
	/**
	 * Message to display above input boxes.
	 *
	 * @platform darwin
	 */
	message?: string;
	/**
	 * Create security scoped bookmarks when packaged for the Mac App Store.
	 *
	 * @platform darwin,mas
	 */
	securityScopedBookmarks?: boolean;
}

export interface OpenDialogReturnValue {
	/**
	 * whether or not the dialog was canceled.
	 */
	canceled: boolean;
	/**
	 * An array of file paths chosen by the user. If the dialog is cancelled this will
	 * be an empty array.
	 */
	filePaths: string[];
	/**
	 * An array matching the `filePaths` array of base64 encoded strings which contains
	 * security scoped bookmark data. `securityScopedBookmarks` must be enabled for
	 * this to be populated. (For return values, see table here.)
	 *
	 * @platform darwin,mas
	 */
	bookmarks?: string[];
}

export interface FileFilter {

	// Docs: https://electronjs.org/docs/api/structures/file-filter

	extensions: string[];
	name: string;
}

export interface OpenDevToolsOptions {
	/**
	 * Opens the devtools with specified dock state, can be `left`, `right`, `bottom`,
	 * `undocked`, `detach`. Defaults to last used dock state. In `undocked` mode it's
	 * possible to dock back. In `detach` mode it's not.
	 */
	mode: ('left' | 'right' | 'bottom' | 'undocked' | 'detach');
	/**
	 * Whether to bring the opened devtools window to the foreground. The default is
	 * `true`.
	 */
	activate?: boolean;
	/**
	 * A title for the DevTools window (only in `undocked` or `detach` mode).
	 */
	title?: string;
}

interface InputEvent {

	// Docs: https://electronjs.org/docs/api/structures/input-event

	/**
	 * An array of modifiers of the event, can be `shift`, `control`, `ctrl`, `alt`,
	 * `meta`, `command`, `cmd`, `isKeypad`, `isAutoRepeat`, `leftButtonDown`,
	 * `middleButtonDown`, `rightButtonDown`, `capsLock`, `numLock`, `left`, `right`.
	 */
	modifiers?: Array<'shift' | 'control' | 'ctrl' | 'alt' | 'meta' | 'command' | 'cmd' | 'isKeypad' | 'isAutoRepeat' | 'leftButtonDown' | 'middleButtonDown' | 'rightButtonDown' | 'capsLock' | 'numLock' | 'left' | 'right'>;
	/**
	 * Can be `undefined`, `mouseDown`, `mouseUp`, `mouseMove`, `mouseEnter`,
	 * `mouseLeave`, `contextMenu`, `mouseWheel`, `rawKeyDown`, `keyDown`, `keyUp`,
	 * `char`, `gestureScrollBegin`, `gestureScrollEnd`, `gestureScrollUpdate`,
	 * `gestureFlingStart`, `gestureFlingCancel`, `gesturePinchBegin`,
	 * `gesturePinchEnd`, `gesturePinchUpdate`, `gestureTapDown`, `gestureShowPress`,
	 * `gestureTap`, `gestureTapCancel`, `gestureShortPress`, `gestureLongPress`,
	 * `gestureLongTap`, `gestureTwoFingerTap`, `gestureTapUnconfirmed`,
	 * `gestureDoubleTap`, `touchStart`, `touchMove`, `touchEnd`, `touchCancel`,
	 * `touchScrollStarted`, `pointerDown`, `pointerUp`, `pointerMove`,
	 * `pointerRawUpdate`, `pointerCancel` or `pointerCausedUaAction`.
	 */
	type: ('undefined' | 'mouseDown' | 'mouseUp' | 'mouseMove' | 'mouseEnter' | 'mouseLeave' | 'contextMenu' | 'mouseWheel' | 'rawKeyDown' | 'keyDown' | 'keyUp' | 'char' | 'gestureScrollBegin' | 'gestureScrollEnd' | 'gestureScrollUpdate' | 'gestureFlingStart' | 'gestureFlingCancel' | 'gesturePinchBegin' | 'gesturePinchEnd' | 'gesturePinchUpdate' | 'gestureTapDown' | 'gestureShowPress' | 'gestureTap' | 'gestureTapCancel' | 'gestureShortPress' | 'gestureLongPress' | 'gestureLongTap' | 'gestureTwoFingerTap' | 'gestureTapUnconfirmed' | 'gestureDoubleTap' | 'touchStart' | 'touchMove' | 'touchEnd' | 'touchCancel' | 'touchScrollStarted' | 'pointerDown' | 'pointerUp' | 'pointerMove' | 'pointerRawUpdate' | 'pointerCancel' | 'pointerCausedUaAction');
}

export interface MouseInputEvent extends InputEvent {

	// Docs: https://electronjs.org/docs/api/structures/mouse-input-event

	/**
	 * The button pressed, can be `left`, `middle`, `right`.
	 */
	button?: ('left' | 'middle' | 'right');
	clickCount?: number;
	globalX?: number;
	globalY?: number;
	movementX?: number;
	movementY?: number;
	/**
	 * The type of the event, can be `mouseDown`, `mouseUp`, `mouseEnter`,
	 * `mouseLeave`, `contextMenu`, `mouseWheel` or `mouseMove`.
	 */
	type: ('mouseDown' | 'mouseUp' | 'mouseEnter' | 'mouseLeave' | 'contextMenu' | 'mouseWheel' | 'mouseMove');
	x: number;
	y: number;
}
