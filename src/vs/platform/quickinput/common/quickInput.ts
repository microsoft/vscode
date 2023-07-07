/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from 'vs/base/common/cancellation';
import { Event } from 'vs/base/common/event';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IQuickAccessController } from 'vs/platform/quickinput/common/quickAccess';
import { IMatch } from 'vs/base/common/filters';
import { IItemAccessor } from 'vs/base/common/fuzzyScorer';
import { ResolvedKeybinding } from 'vs/base/common/keybindings';
import { IDisposable } from 'vs/base/common/lifecycle';
import { Schemas } from 'vs/base/common/network';
import Severity from 'vs/base/common/severity';
import { URI } from 'vs/base/common/uri';
import { IMarkdownString } from 'vs/base/common/htmlContent';

export interface IQuickPickItemHighlights {
	label?: IMatch[];
	description?: IMatch[];
	detail?: IMatch[];
}

export type QuickPickItem = IQuickPickSeparator | IQuickPickItem;

export interface IQuickPickItem {
	type?: 'item';
	id?: string;
	label: string;
	ariaLabel?: string;
	description?: string;
	detail?: string;
	tooltip?: string | IMarkdownString;
	/**
	 * Allows to show a keybinding next to the item to indicate
	 * how the item can be triggered outside of the picker using
	 * keyboard shortcut.
	 */
	keybinding?: ResolvedKeybinding;
	iconClasses?: readonly string[];
	iconPath?: { dark: URI; light?: URI };
	iconClass?: string;
	italic?: boolean;
	strikethrough?: boolean;
	highlights?: IQuickPickItemHighlights;
	buttons?: readonly IQuickInputButton[];
	picked?: boolean;
	alwaysShow?: boolean;
}

export interface IQuickPickSeparator {
	type: 'separator';
	id?: string;
	label?: string;
	ariaLabel?: string;
	buttons?: readonly IQuickInputButton[];
	tooltip?: string | IMarkdownString;
}

export interface IKeyMods {
	readonly ctrlCmd: boolean;
	readonly alt: boolean;
}

export const NO_KEY_MODS: IKeyMods = { ctrlCmd: false, alt: false };

export interface IQuickNavigateConfiguration {
	keybindings: readonly ResolvedKeybinding[];
}

export interface IPickOptions<T extends IQuickPickItem> {

	/**
	 * an optional string to show as the title of the quick input
	 */
	title?: string;

	/**
	 * an optional string to show as placeholder in the input box to guide the user what she picks on
	 */
	placeHolder?: string;

	/**
	 * an optional flag to include the description when filtering the picks
	 */
	matchOnDescription?: boolean;

	/**
	 * an optional flag to include the detail when filtering the picks
	 */
	matchOnDetail?: boolean;

	/**
	 * an optional flag to filter the picks based on label. Defaults to true.
	 */
	matchOnLabel?: boolean;

	/**
	 * an option flag to control whether focus is always automatically brought to a list item. Defaults to true.
	 */
	autoFocusOnList?: boolean;

	/**
	 * an optional flag to not close the picker on focus lost
	 */
	ignoreFocusLost?: boolean;

	/**
	 * an optional flag to make this picker multi-select
	 */
	canPickMany?: boolean;

	/**
	 * enables quick navigate in the picker to open an element without typing
	 */
	quickNavigate?: IQuickNavigateConfiguration;

	/**
	 * Hides the input box from the picker UI. This is typically used
	 * in combination with quick-navigation where no search UI should
	 * be presented.
	 */
	hideInput?: boolean;

	/**
	 * a context key to set when this picker is active
	 */
	contextKey?: string;

	/**
	 * an optional property for the item to focus initially.
	 */
	activeItem?: Promise<T> | T;

	onKeyMods?: (keyMods: IKeyMods) => void;
	onDidFocus?: (entry: T) => void;
	onDidTriggerItemButton?: (context: IQuickPickItemButtonContext<T>) => void;
	onDidTriggerSeparatorButton?: (context: IQuickPickSeparatorButtonEvent) => void;
}

export interface IInputOptions {

	/**
	 * an optional string to show as the title of the quick input
	 */
	title?: string;

	/**
	 * the value to prefill in the input box
	 */
	value?: string;

	/**
	 * the selection of value, default to the whole prefilled value
	 */
	valueSelection?: readonly [number, number];

	/**
	 * the text to display underneath the input box
	 */
	prompt?: string;

	/**
	 * an optional string to show as placeholder in the input box to guide the user what to type
	 */
	placeHolder?: string;

	/**
	 * Controls if a password input is shown. Password input hides the typed text.
	 */
	password?: boolean;

	/**
	 * an optional flag to not close the input on focus lost
	 */
	ignoreFocusLost?: boolean;

	/**
	 * an optional function that is used to validate user input.
	 */
	validateInput?: (input: string) => Promise<string | null | undefined | { content: string; severity: Severity }>;
}

export enum QuickInputHideReason {

	/**
	 * Focus moved away from the quick input.
	 */
	Blur = 1,

	/**
	 * An explicit user gesture, e.g. pressing Escape key.
	 */
	Gesture,

	/**
	 * Anything else.
	 */
	Other
}

export interface IQuickInputHideEvent {
	reason: QuickInputHideReason;
}

export interface IQuickInput extends IDisposable {

	readonly onDidHide: Event<IQuickInputHideEvent>;
	readonly onDispose: Event<void>;

	title: string | undefined;

	description: string | undefined;

	/**
	 * Should be an HTMLElement (TODO: move this entire file into browser)
	 */
	widget: any | undefined;

	step: number | undefined;

	totalSteps: number | undefined;

	enabled: boolean;

	contextKey: string | undefined;

	busy: boolean;

	ignoreFocusOut: boolean;

	show(): void;

	hide(): void;
}

export interface IQuickPickWillAcceptEvent {

	/**
	 * Allows to disable the default accept handling
	 * of the picker. If `veto` is called, the picker
	 * will not trigger the `onDidAccept` event.
	 */
	veto(): void;
}

export interface IQuickPickDidAcceptEvent {

	/**
	 * Signals if the picker item is to be accepted
	 * in the background while keeping the picker open.
	 */
	inBackground: boolean;
}

export enum ItemActivation {
	NONE,
	FIRST,
	SECOND,
	LAST
}

export interface IQuickPick<T extends IQuickPickItem> extends IQuickInput {

	value: string;

	/**
	 * A method that allows to massage the value used
	 * for filtering, e.g, to remove certain parts.
	 */
	filterValue: (value: string) => string;

	ariaLabel: string | undefined;

	placeholder: string | undefined;

	readonly onDidChangeValue: Event<string>;

	readonly onWillAccept: Event<IQuickPickWillAcceptEvent>;
	readonly onDidAccept: Event<IQuickPickDidAcceptEvent>;

	/**
	 * If enabled, will fire the `onDidAccept` event when
	 * pressing the arrow-right key with the idea of accepting
	 * the selected item without closing the picker.
	 */
	canAcceptInBackground: boolean;

	ok: boolean | 'default';

	readonly onDidCustom: Event<void>;

	customButton: boolean;

	customLabel: string | undefined;

	customHover: string | undefined;

	buttons: ReadonlyArray<IQuickInputButton>;

	readonly onDidTriggerButton: Event<IQuickInputButton>;

	readonly onDidTriggerItemButton: Event<IQuickPickItemButtonEvent<T>>;

	readonly onDidTriggerSeparatorButton: Event<IQuickPickSeparatorButtonEvent>;

	items: ReadonlyArray<T | IQuickPickSeparator>;

	scrollTop: number; // used in tests

	canSelectMany: boolean;

	matchOnDescription: boolean;

	matchOnDetail: boolean;

	matchOnLabel: boolean;

	/**
	 * The mode to filter label with. Fuzzy will use fuzzy searching and
	 * contiguous will make filter entries that do not contain the exact string
	 * (including whitespace). This defaults to `'fuzzy'`.
	 */
	matchOnLabelMode: 'fuzzy' | 'contiguous';

	sortByLabel: boolean;

	autoFocusOnList: boolean;

	keepScrollPosition: boolean;

	quickNavigate: IQuickNavigateConfiguration | undefined;

	activeItems: ReadonlyArray<T>;

	readonly onDidChangeActive: Event<T[]>;

	/**
	 * Allows to control which entry should be activated by default.
	 */
	itemActivation: ItemActivation;

	selectedItems: ReadonlyArray<T>;

	readonly onDidChangeSelection: Event<T[]>;

	readonly keyMods: IKeyMods;

	valueSelection: Readonly<[number, number]> | undefined;

	validationMessage: string | undefined;

	inputHasFocus(): boolean;

	focusOnInput(): void;

	/**
	 * Hides the input box from the picker UI. This is typically used
	 * in combination with quick-navigation where no search UI should
	 * be presented.
	 */
	hideInput: boolean;

	hideCheckAll: boolean;

	/**
	 * A set of `Toggle` objects to add to the input box.
	 */
	toggles: IQuickInputToggle[] | undefined;
}

export interface IQuickInputToggle {
	onChange: Event<boolean /* via keyboard */>;
}

export interface IInputBox extends IQuickInput {

	/**
	 * Value shown in the input box.
	 */
	value: string;

	/**
	 * Provide start and end values to be selected in the input box.
	 */
	valueSelection: Readonly<[number, number]> | undefined;

	/**
	 * Value shown as example for input.
	 */
	placeholder: string | undefined;

	/**
	 * Determines if the input value should be hidden while typing.
	 */
	password: boolean;

	/**
	 * Event called when the input value changes.
	 */
	readonly onDidChangeValue: Event<string>;

	/**
	 * Event called when the user submits the input.
	 */
	readonly onDidAccept: Event<void>;

	/**
	 * Buttons to show in addition to user input submission.
	 */
	buttons: ReadonlyArray<IQuickInputButton>;

	/**
	 * Event called when a button is selected.
	 */
	readonly onDidTriggerButton: Event<IQuickInputButton>;

	/**
	 * Text show below the input box.
	 */
	prompt: string | undefined;

	/**
	 * An optional validation message indicating a problem with the current input value.
	 * Returning undefined clears the validation message.
	 */
	validationMessage: string | undefined;

	/**
	 * Severity of the input validation message.
	 */
	severity: Severity;
}

export interface IQuickInputButton {
	/** iconPath or iconClass required */
	iconPath?: { dark: URI; light?: URI };
	/** iconPath or iconClass required */
	iconClass?: string;
	tooltip?: string;
	/**
	 * Whether to always show the button. By default buttons
	 * are only visible when hovering over them with the mouse
	 */
	alwaysVisible?: boolean;
}

export interface IQuickPickItemButtonEvent<T extends IQuickPickItem> {
	button: IQuickInputButton;
	item: T;
}

export interface IQuickPickSeparatorButtonEvent {
	button: IQuickInputButton;
	separator: IQuickPickSeparator;
}

export interface IQuickPickItemButtonContext<T extends IQuickPickItem> extends IQuickPickItemButtonEvent<T> {
	removeItem(): void;
}

export type QuickPickInput<T = IQuickPickItem> = T | IQuickPickSeparator;


//#region Fuzzy Scorer Support

export type IQuickPickItemWithResource = IQuickPickItem & { resource?: URI };

export class QuickPickItemScorerAccessor implements IItemAccessor<IQuickPickItemWithResource> {

	constructor(private options?: { skipDescription?: boolean; skipPath?: boolean }) { }

	getItemLabel(entry: IQuickPickItemWithResource): string {
		return entry.label;
	}

	getItemDescription(entry: IQuickPickItemWithResource): string | undefined {
		if (this.options?.skipDescription) {
			return undefined;
		}

		return entry.description;
	}

	getItemPath(entry: IQuickPickItemWithResource): string | undefined {
		if (this.options?.skipPath) {
			return undefined;
		}

		if (entry.resource?.scheme === Schemas.file) {
			return entry.resource.fsPath;
		}

		return entry.resource?.path;
	}
}

export const quickPickItemScorerAccessor = new QuickPickItemScorerAccessor();

//#endregion

export const IQuickInputService = createDecorator<IQuickInputService>('quickInputService');

export type Omit<T, K extends keyof T> = Pick<T, Exclude<keyof T, K>>;

export interface IQuickInputService {

	readonly _serviceBrand: undefined;

	/**
	 * Provides access to the back button in quick input.
	 */
	readonly backButton: IQuickInputButton;

	/**
	 * Provides access to the quick access providers.
	 */
	readonly quickAccess: IQuickAccessController;

	/**
	 * Allows to register on the event that quick input is showing.
	 */
	readonly onShow: Event<void>;

	/**
	 * Allows to register on the event that quick input is hiding.
	 */
	readonly onHide: Event<void>;

	/**
	 * Opens the quick input box for selecting items and returns a promise
	 * with the user selected item(s) if any.
	 */
	pick<T extends IQuickPickItem>(picks: Promise<QuickPickInput<T>[]> | QuickPickInput<T>[], options?: IPickOptions<T> & { canPickMany: true }, token?: CancellationToken): Promise<T[] | undefined>;
	pick<T extends IQuickPickItem>(picks: Promise<QuickPickInput<T>[]> | QuickPickInput<T>[], options?: IPickOptions<T> & { canPickMany: false }, token?: CancellationToken): Promise<T | undefined>;
	pick<T extends IQuickPickItem>(picks: Promise<QuickPickInput<T>[]> | QuickPickInput<T>[], options?: Omit<IPickOptions<T>, 'canPickMany'>, token?: CancellationToken): Promise<T | undefined>;

	/**
	 * Opens the quick input box for text input and returns a promise with the user typed value if any.
	 */
	input(options?: IInputOptions, token?: CancellationToken): Promise<string | undefined>;

	/**
	 * Provides raw access to the quick pick controller.
	 */
	createQuickPick<T extends IQuickPickItem>(): IQuickPick<T>;

	/**
	 * Provides raw access to the quick input controller.
	 */
	createInputBox(): IInputBox;

	/**
	 * Moves focus into quick input.
	 */
	focus(): void;

	/**
	 * Toggle the checked state of the selected item.
	 */
	toggle(): void;

	/**
	 * Navigate inside the opened quick input list.
	 */
	navigate(next: boolean, quickNavigate?: IQuickNavigateConfiguration): void;

	/**
	 * Navigate back in a multi-step quick input.
	 */
	back(): Promise<void>;

	/**
	 * Accept the selected item.
	 *
	 * @param keyMods allows to override the state of key
	 * modifiers that should be present when invoking.
	 */
	accept(keyMods?: IKeyMods): Promise<void>;

	/**
	 * Cancels quick input and closes it.
	 */
	cancel(): Promise<void>;
}
