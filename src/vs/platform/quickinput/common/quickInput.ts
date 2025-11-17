/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../base/common/cancellation.js';
import { Event } from '../../../base/common/event.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import { IQuickAccessController } from './quickAccess.js';
import { IMatch } from '../../../base/common/filters.js';
import { IItemAccessor } from '../../../base/common/fuzzyScorer.js';
import { ResolvedKeybinding } from '../../../base/common/keybindings.js';
import { IDisposable } from '../../../base/common/lifecycle.js';
import { Schemas } from '../../../base/common/network.js';
import Severity from '../../../base/common/severity.js';
import { URI } from '../../../base/common/uri.js';
import { IMarkdownString } from '../../../base/common/htmlContent.js';

export interface IQuickItemHighlights {
	label?: IMatch[];
	description?: IMatch[];
}

export interface IQuickPickItemHighlights extends IQuickItemHighlights {
	detail?: IMatch[];
}

export type QuickPickItem = IQuickPickSeparator | IQuickPickItem;

/**
 * Base properties for a quick pick and quick tree item.
 */
export interface IQuickItem {
	id?: string;
	label: string;
	ariaLabel?: string;
	description?: string;
	/**
	 * Whether the item is displayed in italics.
	 */
	italic?: boolean;
	/**
	 * Whether the item is displayed with a strikethrough.
	 */
	strikethrough?: boolean;
	/**
	 * Icon classes to be passed on as `IIconLabelValueOptions`
	 * to the underlying `IconLabel` widget.
	 */
	iconClasses?: readonly string[];
	iconPath?: { dark: URI; light?: URI };
	/**
	 * Icon class to be assigned to the quick item container
	 * directly.
	 */
	iconClass?: string;
	highlights?: IQuickItemHighlights;
	buttons?: readonly IQuickInputButton[];
	/**
	 * Used when we're in multi-select mode. Renders a disabled checkbox.
	 */
	disabled?: boolean;
}

/**
 * Represents a quick pick item used in the quick pick UI.
 */
export interface IQuickPickItem extends IQuickItem {
	/**
	 * The type of the quick pick item. Used to distinguish between 'item' and 'separator'
	 */
	type?: 'item';
	/**
	 * The detail text of the quick pick item. Shown as the second line.
	 */
	detail?: string;
	/**
	 * The tooltip for the quick pick item.
	 */
	tooltip?: string | IMarkdownString;
	highlights?: IQuickPickItemHighlights;
	/**
	 * Allows to show a keybinding next to the item to indicate
	 * how the item can be triggered outside of the picker using
	 * keyboard shortcut.
	 */
	keybinding?: ResolvedKeybinding;
	/**
	 * Whether the item is picked by default when the Quick Pick is shown.
	 */
	picked?: boolean;
	/**
	 * Whether the item is always shown in the Quick Pick regardless of filtering.
	 */
	alwaysShow?: boolean;
	/**
	 * Defaults to true with `IQuickPick.canSelectMany`, can be false to disable picks for a single item
	 */
	pickable?: boolean;
}

export interface IQuickPickSeparator {
	/**
	 * The type of the quick pick item. Used to distinguish between 'item' and 'separator'
	 */
	type: 'separator';
	id?: string;
	label?: string;
	description?: string;
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
	 * the value to prefill in the input box
	 */
	value?: string;

	/**
	 * an optional string to show as placeholder in the input box to guide the user what she picks on
	 */
	placeHolder?: string;

	/**
	 * the text to display underneath the input box
	 */
	prompt?: string;

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
	 * an optional flag to sort the picks based by the label.
	 */
	sortByLabel?: boolean;

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

/**
 * A collection of the different types of QuickInput
 */
export const enum QuickInputType {
	QuickPick = 'quickPick',
	InputBox = 'inputBox',
	QuickWidget = 'quickWidget',
	QuickTree = 'quickTree'
}

/**
 * Represents a quick input control that allows users to make selections or provide input quickly.
 */
export interface IQuickInput extends IDisposable {

	/**
	 * The type of the quick input.
	 */
	readonly type: QuickInputType;

	/**
	 * An event that is fired when the quick input is hidden.
	 */
	readonly onDidHide: Event<IQuickInputHideEvent>;

	/**
	 * An event that is fired when the quick input will be hidden.
	 */
	readonly onWillHide: Event<IQuickInputHideEvent>;

	/**
	 * An event that is fired when the quick input is disposed.
	 */
	readonly onDispose: Event<void>;

	/**
	 * The title of the quick input.
	 */
	title: string | undefined;

	/**
	 * The description of the quick input. This is rendered right below the input box.
	 */
	description: string | undefined;

	/**
	 * An HTML widget rendered below the input.
	 * @deprecated Use an IQuickWidget instead.
	 */
	widget: any | undefined;

	/**
	 * The current step of the quick input rendered in the titlebar.
	 */
	step: number | undefined;

	/**
	 * The total number of steps in the quick input rendered in the titlebar.
	 */
	totalSteps: number | undefined;

	/**
	 * The buttons displayed in the quick input titlebar.
	 */
	buttons: ReadonlyArray<IQuickInputButton>;

	/**
	 * An event that is fired when a button in the quick input is triggered.
	 */
	readonly onDidTriggerButton: Event<IQuickInputButton>;

	/**
	 * Indicates whether the input is enabled.
	 */
	enabled: boolean;

	/**
	 * The context key associated with the quick input.
	 */
	contextKey: string | undefined;

	/**
	 * Indicates whether the quick input is busy. Renders a progress bar if true.
	 */
	busy: boolean;

	/**
	 * Indicates whether the quick input should be hidden when it loses focus.
	 */
	ignoreFocusOut: boolean;

	/**
	 * The toggle buttons to be added to the input box.
	 */
	toggles: IQuickInputToggle[] | undefined;

	/**
	 * Shows the quick input.
	 */
	show(): void;

	/**
	 * Hides the quick input.
	 */
	hide(): void;

	/**
	 * Notifies that the quick input has been hidden.
	 * @param reason The reason why the quick input was hidden.
	 */
	didHide(reason?: QuickInputHideReason): void;

	/**
	 * Notifies that the quick input will be hidden.
	 * @param reason The reason why the quick input will be hidden.
	 */
	willHide(reason?: QuickInputHideReason): void;
}

export interface IQuickWidget extends IQuickInput {

	/**
	 * The type of the quick input.
	 */
	readonly type: QuickInputType.QuickWidget;

	/**
	 * Should be an HTMLElement (TODO: move this entire file into browser)
	 * @override
	 */
	widget: any | undefined;
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

/**
 * Represents the activation behavior for items in a quick input. This means which item will be
 * "active" (aka focused).
 */
export enum ItemActivation {
	/**
	 * No item will be active.
	 */
	NONE,
	/**
	 * First item will be active.
	 */
	FIRST,
	/**
	 * Second item will be active.
	 */
	SECOND,
	/**
	 * Last item will be active.
	 */
	LAST
}

/**
 * Represents the focus options for a quick pick.
 */
export enum QuickPickFocus {
	/**
	 * Focus the first item in the list.
	 */
	First = 1,
	/**
	 * Focus the second item in the list.
	 */
	Second,
	/**
	 * Focus the last item in the list.
	 */
	Last,
	/**
	 * Focus the next item in the list.
	 */
	Next,
	/**
	 * Focus the previous item in the list.
	 */
	Previous,
	/**
	 * Focus the next page in the list.
	 */
	NextPage,
	/**
	 * Focus the previous page in the list.
	 */
	PreviousPage,
	/**
	 * Focus the first item under the next separator.
	 */
	NextSeparator,
	/**
	 * Focus the first item under the current separator.
	 */
	PreviousSeparator
}

/**
 * Represents a quick pick control that allows the user to select an item from a list of options.
 */
export interface IQuickPick<T extends IQuickPickItem, O extends { useSeparators: boolean } = { useSeparators: false }> extends IQuickInput {

	/**
	 * The type of the quick input.
	 */
	readonly type: QuickInputType.QuickPick;

	/**
	 * The current value of the quick pick input.
	 */
	value: string;

	/**
	 * A method that allows to massage the value used for filtering, e.g, to remove certain parts.
	 * @param value The value to be filtered.
	 * @returns The filtered value.
	 */
	filterValue: (value: string) => string;

	/**
	 * The ARIA label for the quick pick input.
	 */
	ariaLabel: string | undefined;

	/**
	 * The placeholder text for the quick pick input.
	 */
	placeholder: string | undefined;

	/**
	 * Text shown below the quick pick input.
	 */
	prompt: string | undefined;

	/**
	 * An event that is fired when the value of the quick pick input changes.
	 */
	readonly onDidChangeValue: Event<string>;

	/**
	 * An event that is fired when the quick pick is about to accept the selected item.
	 */
	readonly onWillAccept: Event<IQuickPickWillAcceptEvent>;

	/**
	 * An event that is fired when the quick pick has accepted the selected item.
	 */
	readonly onDidAccept: Event<IQuickPickDidAcceptEvent>;

	/**
	 * If enabled, the `onDidAccept` event will be fired when pressing the arrow-right key to accept the selected item without closing the picker.
	 */
	canAcceptInBackground: boolean;

	/**
	 * The OK button state. It can be a boolean value or the string 'default'.
	 */
	ok: boolean | 'default';

	/**
	 * The OK button label.
	 */
	okLabel: string | undefined;

	/**
	 * An event that is fired when the custom button is triggered. The custom button is a button with text rendered to the right of the input.
	 */
	readonly onDidCustom: Event<void>;

	/**
	 * Whether to show the custom button. The custom button is a button with text rendered to the right of the input.
	 */
	customButton: boolean;

	/**
	 * The label for the custom button. The custom button is a button with text rendered to the right of the input.
	 */
	customLabel: string | undefined;

	/**
	 * The hover text for the custom button. The custom button is a button with text rendered to the right of the input.
	 */
	customHover: string | undefined;

	/**
	 * An event that is fired when an item button is triggered.
	 */
	readonly onDidTriggerItemButton: Event<IQuickPickItemButtonEvent<T>>;

	/**
	 * An event that is fired when a separator button is triggered.
	 */
	readonly onDidTriggerSeparatorButton: Event<IQuickPickSeparatorButtonEvent>;

	/**
	 * The items to be displayed in the quick pick.
	 */
	items: O extends { useSeparators: true } ? ReadonlyArray<T | IQuickPickSeparator> : ReadonlyArray<T>;

	/**
	 * Whether multiple items can be selected. If so, checkboxes will be rendered.
	 */
	canSelectMany: boolean;

	/**
	 * Whether to match on the description of the items.
	 */
	matchOnDescription: boolean;

	/**
	 * Whether to match on the detail of the items.
	 */
	matchOnDetail: boolean;

	/**
	 * Whether to match on the label of the items.
	 */
	matchOnLabel: boolean;

	/**
	 * The mode to filter the label with. It can be 'fuzzy' or 'contiguous'. Defaults to 'fuzzy'.
	 */
	matchOnLabelMode: 'fuzzy' | 'contiguous';

	/**
	 * Whether to sort the items by label.
	 */
	sortByLabel: boolean;

	/**
	 * Whether to keep the scroll position when the quick pick input is updated.
	 */
	keepScrollPosition: boolean;

	/**
	 * The configuration for quick navigation.
	 */
	quickNavigate: IQuickNavigateConfiguration | undefined;

	/**
	 * The currently active items.
	 */
	activeItems: ReadonlyArray<T>;

	/**
	 * An event that is fired when the active items change.
	 */
	readonly onDidChangeActive: Event<T[]>;

	/**
	 * The item activation behavior for the next time `items` is set. Item activation means which
	 * item is "active" (aka focused) when the quick pick is opened or when `items` is set.
	 */
	itemActivation: ItemActivation;

	/**
	 * The currently selected items.
	 */
	selectedItems: ReadonlyArray<T>;

	/**
	 * An event that is fired when the selected items change.
	 */
	readonly onDidChangeSelection: Event<T[]>;

	/**
	 * The key modifiers.
	 */
	readonly keyMods: IKeyMods;

	/**
	 * The selection range for the value in the input.
	 */
	valueSelection: Readonly<[number, number]> | undefined;

	/**
	 * The validation message for the quick pick. This is rendered below the input.
	 */
	validationMessage: string | undefined;

	/**
	 * The severity of the validation message.
	 */
	severity: Severity;

	/**
	 * Checks if the quick pick input has focus.
	 * @returns `true` if the quick pick input has focus, `false` otherwise.
	 */
	inputHasFocus(): boolean;

	/**
	 * Focuses on the quick pick input.
	 */
	focusOnInput(): void;

	/**
	 * Hides the input box from the picker UI. This is typically used in combination with quick-navigation where no search UI should be presented.
	 */
	hideInput: boolean;

	/**
	 * Controls whether the count for the items should be shown.
	 */
	hideCountBadge: boolean;

	/**
	 * Whether to hide the "Check All" checkbox.
	 */
	hideCheckAll: boolean;

	/**
	 * Focus a particular item in the list. Used internally for keyboard navigation.
	 * @param focus The focus behavior.
	 */
	focus(focus: QuickPickFocus): void;

	/**
	 * Programmatically accepts an item. Used internally for keyboard navigation.
	 * @param inBackground Whether you are accepting an item in the background and keeping the picker open.
	 */
	accept(inBackground?: boolean): void;
}

/**
 * Represents a toggle for quick input.
 */
export interface IQuickInputToggle {
	/**
	 * Event that is fired when the toggle value changes.
	 * The boolean value indicates whether the change was triggered via keyboard.
	 */
	readonly onChange: Event<boolean>;
}

/**
 * Represents an input box in a quick input dialog.
 */
export interface IInputBox extends IQuickInput {

	/**
	 * The type of the quick input.
	 */
	readonly type: QuickInputType.InputBox;

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

	/**
	 * Programmatically accepts an item. Used internally for keyboard navigation.
	 */
	accept(): void;
}

export enum QuickInputButtonLocation {
	/**
	 * In the title bar.
	 */
	Title = 1,

	/**
	 * To the right of the input box.
	 */
	Inline = 2,

	/**
	 * At the far end inside the input box.
	 * Used by the public API to create toggles.
	 */
	Input = 3,
}

/**
 * Represents a button in the quick input UI.
 */
export interface IQuickInputButton {
	/**
	 * The path to the icon for the button.
	 * Either `iconPath` or `iconClass` is required.
	 */
	iconPath?: { dark: URI; light?: URI };
	/**
	 * The CSS class for the icon of the button.
	 * Either `iconPath` or `iconClass` is required.
	 */
	iconClass?: string;
	/**
	 * The tooltip text for the button.
	 */
	tooltip?: string;
	/**
	 * Whether to always show the button.
	 * By default, buttons are only visible when hovering over them with the mouse.
	 */
	alwaysVisible?: boolean;
	/**
	 * Where the button should be rendered. The default is {@link QuickInputButtonLocation.Title}.
	 * @note This property is ignored if the button was added to a QuickPickItem.
	 */
	location?: QuickInputButtonLocation;
}

/**
 * Represents an event that occurs when a button associated with a quick pick item is clicked.
 * @template T - The type of the quick pick item.
 */
export interface IQuickPickItemButtonEvent<T extends IQuickPickItem> {
	/**
	 * The button that was clicked.
	 */
	button: IQuickInputButton;
	/**
	 * The quick pick item associated with the button.
	 */
	item: T;
}

/**
 * Represents an event that occurs when a separator button is clicked in a quick pick.
 */
export interface IQuickPickSeparatorButtonEvent {
	/**
	 * The button that was clicked.
	 */
	button: IQuickInputButton;
	/**
	 * The separator associated with the button.
	 */
	separator: IQuickPickSeparator;
}

/**
 * Represents a context for a button associated with a quick pick item.
 * @template T - The type of the quick pick item.
 */
export interface IQuickPickItemButtonContext<T extends IQuickPickItem> extends IQuickPickItemButtonEvent<T> {
	/**
	 * Removes the associated item from the quick pick.
	 */
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
	createQuickPick<T extends IQuickPickItem>(options: { useSeparators: true }): IQuickPick<T, { useSeparators: true }>;
	createQuickPick<T extends IQuickPickItem>(options?: { useSeparators: boolean }): IQuickPick<T, { useSeparators: false }>;

	/**
	 * Provides raw access to the input box controller.
	 */
	createInputBox(): IInputBox;

	/**
	 * Provides raw access to the quick widget controller.
	 */
	createQuickWidget(): IQuickWidget;

	/**
	 * Provides raw access to the quick tree controller.
	 * @template T The type of items in the quick tree.
	 */
	createQuickTree<T extends IQuickTreeItem>(): IQuickTree<T>;

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

	/**
	 * Toggles hover for the current quick input item
	 */
	toggleHover(): void;

	/**
	 * The current quick pick that is visible. Undefined if none is open.
	 */
	currentQuickInput: IQuickInput | undefined;

	/**
	 * Set the alignment of the quick input.
	 * @param alignment either a preset or a custom alignment
	 */
	setAlignment(alignment: 'top' | 'center' | { top: number; left: number }): void;
}

//#region Quick Tree

/**
 * Represents a quick tree control that displays hierarchical data with checkboxes.
 */
export interface IQuickTree<T extends IQuickTreeItem> extends IQuickInput {

	/**
	 * The type of the quick input.
	 */
	readonly type: QuickInputType.QuickTree;

	/**
	 * The current value of the quick tree filter input.
	 */
	value: string;

	/**
	 * The ARIA label for the quick tree input.
	 */
	ariaLabel: string | undefined;

	/**
	 * The placeholder text for the quick tree filter input.
	 */
	placeholder: string | undefined;

	/**
	 * An event that is fired when the filter value changes.
	 */
	readonly onDidChangeValue: Event<string>;

	/**
	 * An event that is fired when the quick tree has accepted the selected items.
	 */
	readonly onDidAccept: Event<void>;

	/**
	 * Whether to match on the description of the items.
	 */
	matchOnDescription: boolean;

	/**
	 * Whether to match on the label of the items.
	 */
	matchOnLabel: boolean;

	/**
	 * Whether to sort the items by label. Defaults to true.
	 */
	sortByLabel: boolean;

	/**
	 * The currently active items.
	 */
	activeItems: ReadonlyArray<T>;

	/**
	 * The validation message for the quick pick. This is rendered below the input.
	 */
	validationMessage: string | undefined;

	/**
	 * The severity of the validation message.
	 */
	severity: Severity;

	/**
	 * The items currently displayed in the quick tree.
	 * @note modifications to this array directly will not cause updates.
	 */
	readonly itemTree: ReadonlyArray<Readonly<T>>;

	/**
	 * The currently selected leaf items.
	 */
	readonly checkedLeafItems: ReadonlyArray<T>;

	/**
	 * Get the parent element of the element passed in
	 * @param element
	 */
	getParent(element: T): T | undefined;

	/**
	 * An event that is fired when the active items change.
	 */
	readonly onDidChangeActive: Event<ReadonlyArray<T>>;

	/**
	 * An event that is fired when the selected items change.
	 */
	readonly onDidChangeCheckedLeafItems: Event<ReadonlyArray<T>>;

	/**
	 * An event that is fired when the checkbox state of an item changes.
	 */
	readonly onDidChangeCheckboxState: Event<T>;

	/**
	 * An event that is fired when an item button is triggered.
	 */
	readonly onDidTriggerItemButton: Event<IQuickTreeItemButtonEvent<T>>;

	/**
	 * Sets the items to be displayed in the quick tree.
	 * @param itemTree The items to display.
	 */
	setItemTree(itemTree: T[]): void;

	/**
	 * Sets the checkbox state of an item.
	 * @param element The item to update.
	 * @param checked The new checkbox state.
	 */
	setCheckboxState(element: T, checked: boolean | 'mixed'): void;

	/**
	 * Expands an item.
	 * @param element The item to expand.
	 */
	expand(element: T): void;

	/**
	 * Collapses an item.
	 * @param element The item to collapse.
	 */
	collapse(element: T): void;

	/**
	 * Checks if an item is collapsed.
	 * @param element The item to check.
	 * @returns True if the item is collapsed.
	 */
	isCollapsed(element: T): boolean;

	/**
	 * Focuses on the tree input.
	 */
	focusOnInput(): void;

	/**
	 * Focus a particular item in the list. Used internally for keyboard navigation.
	 * @param focus The focus behavior.
	 */
	focus(focus: QuickPickFocus): void;

	/**
	 * Programmatically accepts an item. Used internally for keyboard navigation.
	 * @param inBackground Whether you are accepting an item in the background and keeping the picker open.
	 */
	accept(inBackground?: boolean): void;
}

/**
 * Represents a tree item in the quick tree.
 */
export interface IQuickTreeItem extends IQuickItem {
	/**
	 * The checked state of the item. Can be true, false, or 'mixed' for tri-state.
	 * When canSelectMany is false, this is ignored and the item is treated as a single selection.
	 * When canSelectMany is true, this indicates the checkbox state of the item.
	 * If undefined, the item is unchecked by default.
	 */
	checked?: boolean | 'mixed';

	/**
	 * The collapsible state of the tree item. Defaults to 'Expanded' if children are present.
	 */
	collapsed?: boolean;

	/**
	 * The children of this tree item.
	 */
	children?: readonly IQuickTreeItem[];

	/**
	 * Defaults to true, can be false to disable picks for a single item.
	 * When false, the item is not selectable and does not respond to mouse/keyboard activation.
	 */
	pickable?: boolean;
}

/**
 * Represents an event that occurs when the checkbox state of a tree item changes.
 * @template T - The type of the tree item.
 */
export interface IQuickTreeCheckboxEvent<T extends IQuickTreeItem> {
	/**
	 * The tree item whose checkbox state changed.
	 */
	item: T;

	/**
	 * The new checked state.
	 */
	checked: boolean | 'mixed';
}

/**
 * Represents an event that occurs when a button associated with a quick tree item is clicked.
 * @template T - The type of the quick tree item.
 */
export interface IQuickTreeItemButtonEvent<T extends IQuickTreeItem> {
	/**
	 * The button that was clicked.
	 */
	button: IQuickInputButton;
	/**
	 * The quick tree item associated with the button.
	 */
	item: T;
}

//#endregion
