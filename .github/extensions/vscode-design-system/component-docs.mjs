/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const docs = {
	button: {
		className: 'Button',
		summary: 'Runs an action through a labeled primary, secondary, or icon button.',
		usage: ['Use a clear verb for the action. Prefer a link when the purpose is navigation.', 'Keep one primary action prominent; use secondary buttons for supporting choices.', 'Register the button and its event subscriptions with the owning disposable store.'],
		accessibility: ['Enter and Space activate an enabled button.', 'Provide an accessible name for icon-only buttons. Disabled buttons must not run their action.'],
		preview: 'The existing fixture shows primary, secondary, icon, description, and disabled examples.',
		api: [
			['label', 'string | IMarkdownString', 'The visible label, assigned on the instance.', 'set label(value: string | IMarkdownString);'],
			['secondary', 'boolean?', 'Construction option for the secondary appearance.', 'readonly secondary?: boolean;'],
			['disabled', 'boolean?', 'Initial disabled state; update enabled on the instance afterwards.', 'readonly disabled?: boolean;'],
			['ariaLabel', 'string?', 'An explicit accessible name.', 'readonly ariaLabel?: string;'],
			['onDidClick', 'BaseEvent<Event | undefined>', 'Subscribe to activation, rather than adding a second DOM click path.', 'readonly onDidClick: BaseEvent<Event | undefined>;'],
		],
	},
	input: {
		className: 'InputBox',
		summary: 'A shared text-entry control with validation and optional actions.',
		usage: ['Use a visible label that explains what to enter; a placeholder is not a replacement for a label.', 'Use validation to explain how to fix an invalid value.', 'Choose the input type and validation contract for the task, not just for appearance.'],
		accessibility: ['Use ariaLabel when a separate label is not associated with the control.', 'Keep validation messages understandable without relying on color.'],
		preview: 'The existing fixture includes text-entry and validation states. Edit the fields directly.',
		api: [
			['placeholder', 'string?', 'Hint shown when the field is empty.', 'readonly placeholder?: string;'],
			['ariaLabel', 'string?', 'Accessible name for the field.', 'readonly ariaLabel?: string;'],
			['validationOptions', 'IInputValidationOptions?', 'Supplies the value-validation function.', 'readonly validationOptions?: IInputValidationOptions;'],
			['value', 'string', 'Read or update the current text on the instance.', 'public set value(newValue: string)'],
			['onDidChange', 'Event<string>', 'Receives text changes.', 'public get onDidChange(): Event<string>'],
		],
	},
	toggle: {
		className: 'Toggle',
		summary: 'Binary selection controls for independent settings or modes.',
		usage: ['Use a checkbox for an independent on/off choice; use a radio group for mutually exclusive choices.', 'Keep the state label stable as the selection changes.', 'The API below documents Toggle. The existing fixture also contains the Checkbox wrapper.'],
		accessibility: ['Expose an understandable title and checked state.', 'Space changes the state. Do not remove the control from keyboard navigation without an owning navigation model.'],
		preview: 'The shared fixture contains toggle buttons and checkboxes; a separate variant demonstrates keyboard focus.',
		api: [
			['title', 'string | IMarkdownString | HTMLElement', 'Required title in IToggleOpts.', 'readonly title: string | IMarkdownString | HTMLElement;'],
			['isChecked', 'boolean', 'Required initial checked state.', 'readonly isChecked: boolean;'],
			['notFocusable', 'boolean?', 'Lets an owning navigation model manage focus.', 'readonly notFocusable?: boolean;'],
			['checked', 'boolean', 'Updates the instance state and aria-checked.', 'set checked(newIsChecked: boolean)'],
			['onChange', 'Event<boolean>', 'The boolean reports keyboard origin; read checked for the new selection state.', 'get onChange(): Event<boolean'],
		],
	},
	radio: {
		className: 'Radio',
		apiStart: 'export interface IRadioOptions {',
		summary: 'A mutually exclusive option group, including segmented presentations.',
		usage: ['Use for one choice among related options, not independent boolean settings.', 'Radio is the shared VS Code group primitive; this is not a new React RadioButton API.', 'Choose arrow-key selection behavior based on whether selection has an immediate side effect.'],
		accessibility: ['Provide an accessible name for the group and understandable names for its items.', 'The default arrow-key behavior selects; focus-only navigation leaves selection to Enter or Space.'],
		preview: 'A standalone reviewed fixture is not mapped yet. Documentation is available without substituting a feature-specific picker.',
		api: [
			['items', 'ReadonlyArray<IRadioOptionItem>', 'The options, labels, and initial active state.', 'readonly items: ReadonlyArray<IRadioOptionItem>;'],
			['ariaLabel', 'string?', 'Accessible name of the group.', 'readonly ariaLabel?: string;'],
			['allowNoSelection', 'boolean?', 'Allows an initially unchecked group when no item is active.', 'readonly allowNoSelection?: boolean;'],
			['arrowKeyBehavior', "'select' | 'focus'?", 'Select while navigating, or move focus without selecting.', "readonly arrowKeyBehavior?: 'select' | 'focus';"],
			['onDidSelect', 'Event<number>', 'Receives the selected option index.', 'readonly onDidSelect = this._onDidSelect.event;'],
		],
	},
	label: {
		className: 'HighlightedLabel',
		summary: 'Text presentation with optional substring highlights, commonly used for filtered results.',
		usage: ['Use highlights to show matching text, not as the only way to communicate meaning.', 'Supply ranges against the same text being rendered.', 'This documents the shared HighlightedLabel widget, not a form-field label control.'],
		accessibility: ['Keep the full label readable without its visual highlight.', 'Do not make essential information available only through hover.'],
		preview: 'The existing fixture shows real labels and highlighted text.',
		api: [
			['set(...)', 'method', 'Sets text, highlight ranges, title, and optional newline/icon handling.', 'set(text: string | undefined, highlights:'],
			['IHighlight.start', 'number', 'Start of a highlighted range.', 'start: number;'],
			['IHighlight.end', 'number', 'End of a highlighted range.', 'end: number;'],
			['hoverDelegate', 'IHoverDelegate?', 'Shared hover behavior in the construction options.', 'readonly hoverDelegate?: IHoverDelegate;'],
		],
	},
	dropdown: {
		className: 'MultiSelectDropdown',
		summary: 'An anchored, sectioned menu for selecting multiple values.',
		usage: ['Use when several independent values may be selected.', 'Selections are immediate; closing the menu does not roll them back.', 'The caller owns the trigger and persists selection changes. A single-select dropdown is a different control.'],
		accessibility: ['Provide ariaLabel and meaningful section/item labels.', 'The widget manages trigger expansion state; searchable and menu presentations use different selection semantics.'],
		preview: 'The existing generic weekday fixture opens the real menu. It is not a feature-specific workflow.',
		api: [
			['anchor', 'HTMLElement', 'The element that anchors the opened menu.', 'readonly anchor: HTMLElement;'],
			['sections', 'readonly IMultiSelectDropdownSection[]', 'Labeled groups of selectable items.', 'readonly sections: readonly IMultiSelectDropdownSection[];'],
			['selectedIds', 'readonly string[]', 'Known selected item identifiers supplied to show().', 'readonly selectedIds: readonly string[];'],
			['searchable', 'boolean?', 'Adds a filterable listbox presentation.', 'readonly searchable?: boolean;'],
			['onDidChangeSelection', 'Event<readonly string[]>', 'Receives fresh selection snapshots for user toggles.', 'readonly onDidChangeSelection = this._onDidChangeSelection.event;'],
		],
	},
	badge: {
		className: 'CountBadge',
		summary: 'A compact numeric indicator attached to a meaningful label or destination.',
		usage: ['Use for a count, not as an unlabeled standalone notification.', 'Pair the number with enough surrounding context to explain what is being counted.'],
		accessibility: ['Make the meaning of the count understandable without color.', 'Avoid relying on a hover title as the only explanation.'],
		preview: 'The existing fixture shows actual count badges.',
		api: [
			['count', 'number?', 'Initial count, defaulting to zero.', 'readonly count?: number;'],
			['countFormat', 'string?', 'Formatting pattern for the visible count.', 'readonly countFormat?: string;'],
			['titleFormat', 'string?', 'Formatting pattern for the hover title.', 'readonly titleFormat?: string;'],
			['setCount(count)', 'method', 'Updates and renders the count.', 'setCount(count: number)'],
		],
	},
	progress: {
		className: 'ProgressBar',
		summary: 'Communicates measured progress or ongoing work with an unknown total.',
		usage: ['Use determinate progress only when a meaningful total is available.', 'Stop the treatment when the operation completes or no longer runs.', 'Do not use a looping treatment to represent an operation waiting for user input.'],
		accessibility: ['Supply an ariaLabel that describes the operation.', 'Keep operation state understandable without motion.'],
		preview: 'The existing fixture demonstrates progress states. This is not a proposed motion standard.',
		api: [
			['ariaLabel', 'string?', 'Accessible name in IProgressBarOptions.', 'ariaLabel?: string;'],
			['infinite()', 'ProgressBar', 'Starts indeterminate progress.', 'infinite(): ProgressBar'],
			['total(value)', 'ProgressBar', 'Sets the total work for determinate progress.', 'total(value: number): ProgressBar'],
			['worked(value)', 'ProgressBar', 'Reports work against the total.', 'worked(value: number): ProgressBar'],
			['done() / stop()', 'ProgressBar', 'Completes with a fade, or stops immediately.', 'done(): ProgressBar'],
		],
	},
	'action-bar': {
		className: 'ActionBar',
		summary: 'A reusable navigation and presentation container for actions.',
		usage: ['Use the shared action model rather than separate ad-hoc click handlers.', 'Choose orientation to match the surrounding layout.', 'Prefer workbench toolbar integrations when actions are contributed through menus.'],
		accessibility: ['Give the action group an ariaLabel.', 'Keep action names meaningful and let the container own its keyboard navigation.'],
		preview: 'The fixture renders the shared base action bar, not a feature toolbar.',
		api: [
			['orientation', 'ActionsOrientation?', 'Horizontal or vertical action layout.', 'readonly orientation?: ActionsOrientation;'],
			['ariaLabel', 'string?', 'Accessible name for the action group.', 'readonly ariaLabel?: string;'],
			['focusOnlyEnabledItems', 'boolean?', 'Controls keyboard focus behavior for unavailable items.', 'readonly focusOnlyEnabledItems?: boolean;'],
			['push(actions, options)', 'method', 'Adds one or more actions with view-item options.', 'push(arg: IAction | ReadonlyArray<IAction>'],
		],
	},
	'button-bar': {
		className: 'ButtonBar',
		summary: 'A reusable group of related button actions.',
		usage: ['Group choices that belong to the same decision.', 'Keep primary and supporting actions distinguishable.', 'Use the returned button interfaces rather than querying internal DOM.'],
		accessibility: ['Give every button a meaningful label or accessible name.', 'The group supports directional navigation between its buttons.'],
		preview: 'The existing fixture uses the shared button bar.',
		api: [
			['addButton(options)', 'IButton', 'Creates and adds a button from IButtonOptions.', 'addButton(options: IButtonOptions): IButton'],
			['addButtonWithDescription(options)', 'IButtonWithDescription', 'Adds a button with descriptive text.', 'addButtonWithDescription(options: IButtonOptions): IButtonWithDescription'],
			['buttons', 'IButton[]', 'The buttons in the group.', 'get buttons(): IButton[]'],
			['clear()', 'void', 'Disposes and removes the current buttons.', 'clear(): void'],
		],
	},
};

export function documentControl(control, read) {
	const documentation = docs[control.id];
	if (!documentation) {
		throw new Error(`Component documentation is missing for ${control.id}`);
	}
	const lines = read(control.owner).split('\n');
	const start = documentation.apiStart ? lines.findIndex(line => line.includes(documentation.apiStart)) : 0;
	if (start < 0) {
		throw new Error(`Component documentation source changed: ${control.name}`);
	}
	return {
		...control,
		docs: {
			...documentation,
			api: documentation.api.map(([name, type, description, anchor]) => {
				const index = lines.findIndex((line, index) => index >= start && line.includes(anchor));
				if (index < 0) {
					throw new Error(`Component documentation source changed: ${control.name}, ${name}`);
				}
				return { name, type, description, source: { file: control.owner, line: index + 1 } };
			}),
		},
	};
}
