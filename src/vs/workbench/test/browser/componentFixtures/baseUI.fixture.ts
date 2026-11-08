/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $ } from '../../../../base/browser/dom.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { Action, Separator } from '../../../../base/common/actions.js';

// UI Components
import { Button, ButtonBar, ButtonWithDescription } from '../../../../base/browser/ui/button/button.js';
import { Toggle, Checkbox, unthemedToggleStyles } from '../../../../base/browser/ui/toggle/toggle.js';
import { InputBox, MessageType } from '../../../../base/browser/ui/inputbox/inputBox.js';
import { CountBadge } from '../../../../base/browser/ui/countBadge/countBadge.js';
import { ActionBar } from '../../../../base/browser/ui/actionbar/actionbar.js';
import { ProgressBar } from '../../../../base/browser/ui/progressbar/progressbar.js';
import { HighlightedLabel } from '../../../../base/browser/ui/highlightedlabel/highlightedLabel.js';
import { ContextView, ContextViewDOMPosition } from '../../../../base/browser/ui/contextview/contextview.js';
import { IconLabel } from '../../../../base/browser/ui/iconLabel/iconLabel.js';
import { KeybindingLabel } from '../../../../base/browser/ui/keybindingLabel/keybindingLabel.js';
import { createPixelSpinner } from '../../../../base/browser/ui/pixelSpinner/pixelSpinner.js';
import { Radio } from '../../../../base/browser/ui/radio/radio.js';
import { SelectBox, unthemedSelectBoxStyles } from '../../../../base/browser/ui/selectBox/selectBox.js';
import { Switch } from '../../../../base/browser/ui/toggle/switch.js';
import { KeyCode } from '../../../../base/common/keyCodes.js';
import { KeyCodeChord } from '../../../../base/common/keybindings.js';
import { OperatingSystem } from '../../../../base/common/platform.js';
import { USLayoutResolvedKeybinding } from '../../../../platform/keybinding/common/usLayoutResolvedKeybinding.js';
import { defaultButtonStyles as themedButtonStyles, defaultInputBoxStyles as themedInputBoxStyles } from '../../../../platform/theme/browser/defaultStyles.js';

import { ComponentFixtureContext, defineComponentFixture, defineThemedFixtureGroup } from './fixtureUtils.js';


export default defineThemedFixtureGroup({ labels: { primitive: true } }, {
	Buttons: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: renderButtons,
	}),

	ButtonBar: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: renderButtonBar,
	}),

	Toggles: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: renderToggles,
	}),

	KeyboardFocusedToggle: defineComponentFixture({
		labels: { kind: 'screenshot', blocksCi: true },
		additionalThemes: ['darkHighContrast', 'lightHighContrast'],
		expectedVisualDescriptions: ['The checked toggle replaces its solid active border with a dashed keyboard-focus border, without an additional outline.'],
		render: renderKeyboardFocusedToggle,
	}),

	InputBoxes: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: renderInputBoxes,
	}),

	CountBadges: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: renderCountBadges,
	}),

	ActionBar: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: renderActionBar,
	}),

	ProgressBars: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: renderProgressBars,
	}),

	HighlightedLabels: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: renderHighlightedLabels,
	}),
	Checkboxes: defineComponentFixture({ labels: { kind: 'screenshot' }, render: renderCheckboxes }),
	Switches: defineComponentFixture({ labels: { kind: 'screenshot' }, render: renderSwitches }),
	Radios: defineComponentFixture({ labels: { kind: 'screenshot' }, render: renderRadios }),
	SelectBoxes: defineComponentFixture({ labels: { kind: 'screenshot' }, render: renderSelectBoxes }),
	IconToggles: defineComponentFixture({ labels: { kind: 'screenshot' }, render: renderIconToggles }),
	IconLabels: defineComponentFixture({ labels: { kind: 'screenshot' }, render: renderIconLabels }),
	KeybindingLabels: defineComponentFixture({ labels: { kind: 'screenshot' }, render: renderKeybindingLabels }),
	PixelSpinners: defineComponentFixture({ labels: { kind: 'animated' }, render: renderPixelSpinners }),
});

function primitiveRow(container: HTMLElement, label: string): HTMLElement {
	container.style.padding = '12px';
	container.style.display = 'flex';
	container.style.flexDirection = 'column';
	container.style.gap = '12px';
	const item = $('div');
	item.style.display = 'flex';
	item.style.alignItems = 'center';
	item.style.gap = '8px';
	item.appendChild($('span', undefined, label));
	container.appendChild(item);
	return item;
}

function renderCheckboxes({ container, disposableStore }: ComponentFixtureContext): void {
	for (const [label, checked, disabled] of [['Include source files', true, false], ['Include tests', false, false], ['Unavailable option', false, true]] as const) {
		const item = primitiveRow(container, label);
		const checkbox = disposableStore.add(new Checkbox(label, checked, themedCheckboxStyles));
		if (disabled) { checkbox.disable(); }
		item.prepend(checkbox.domNode);
	}
}

function renderSwitches({ container, disposableStore }: ComponentFixtureContext): void {
	for (const [label, checked, disabled] of [['Auto save', false, false], ['Show guides', true, false], ['Unavailable setting', false, true]] as const) {
		const item = primitiveRow(container, label);
		const control = disposableStore.add(new Switch({ ariaLabel: label, checked, disabled }));
		item.prepend(control.domNode);
	}
}

function renderRadios({ container, disposableStore }: ComponentFixtureContext): void {
	for (const segmented of [false, true]) {
		const item = primitiveRow(container, segmented ? 'Segmented selection' : 'Single selection');
		const control = disposableStore.add(new Radio({
			ariaLabel: segmented ? 'Segmented view' : 'View',
			className: segmented ? 'segmented' : undefined,
			items: [{ text: 'List', isActive: true }, { text: 'Grid' }, { text: 'Unavailable', disabled: true }],
		}));
		item.style.flexWrap = 'wrap';
		item.appendChild(control.domNode);
	}
}

function renderSelectBoxes({ container, disposableStore }: ComponentFixtureContext): void {
	const context = disposableStore.add(new ContextView(container, ContextViewDOMPosition.ABSOLUTE));
	for (const enabled of [true, false]) {
		const item = primitiveRow(container, enabled ? 'Indentation' : 'Unavailable setting');
		const select = disposableStore.add(new SelectBox(
			[{ text: 'Spaces: 2' }, { text: 'Spaces: 4' }, { text: 'Tabs' }], 0,
			{ showContextView: delegate => context.show(delegate), hideContextView: () => context.hide(), layout: () => context.layout() },
			{
				...unthemedSelectBoxStyles,
				selectBackground: 'var(--vscode-dropdown-background)',
				selectForeground: 'var(--vscode-dropdown-foreground)',
				selectBorder: 'var(--vscode-dropdown-border)',
				selectListBackground: 'var(--vscode-dropdown-listBackground)',
				focusBorder: 'var(--vscode-focusBorder)',
				listActiveSelectionBackground: 'var(--vscode-list-activeSelectionBackground)',
				listActiveSelectionForeground: 'var(--vscode-list-activeSelectionForeground)',
				listFocusBackground: 'var(--vscode-list-focusBackground)',
				listFocusForeground: 'var(--vscode-list-focusForeground)',
			},
			{ useCustomDrawn: true, ariaLabel: enabled ? 'Indentation' : 'Unavailable setting' },
		));
		select.render(item);
		select.setEnabled(enabled);
	}
}

function renderIconToggles({ container, disposableStore }: ComponentFixtureContext): void {
	const item = primitiveRow(container, 'Search modes');
	for (const [title, icon, isChecked] of [['Match case', Codicon.caseSensitive, false], ['Match whole word', Codicon.wholeWord, true]] as const) {
		const toggle = disposableStore.add(new Toggle({ ...themedToggleStyles, title, icon, isChecked }));
		item.appendChild(toggle.domNode);
	}
}

function renderIconLabels({ container, disposableStore }: ComponentFixtureContext): void {
	const item = primitiveRow(container, 'Name and description');
	const label = disposableStore.add(new IconLabel(item, { supportIcons: true, supportHighlights: true }));
	label.setLabel('$(file-code) settings.ts', 'src/config', { matches: [{ start: 13, end: 21 }] });
}

function renderKeybindingLabels({ container, disposableStore }: ComponentFixtureContext): void {
	for (const os of [OperatingSystem.Windows, OperatingSystem.Macintosh]) {
		const item = primitiveRow(container, os === OperatingSystem.Macintosh ? 'macOS' : 'Windows / Linux');
		const label = disposableStore.add(new KeybindingLabel(item, os, {
			keybindingLabelBackground: 'var(--vscode-keybindingLabel-background)',
			keybindingLabelForeground: 'var(--vscode-keybindingLabel-foreground)',
			keybindingLabelBorder: 'var(--vscode-keybindingLabel-border)',
			keybindingLabelBottomBorder: 'var(--vscode-keybindingLabel-bottomBorder)',
			keybindingLabelShadow: undefined,
		}));
		label.set(new USLayoutResolvedKeybinding([new KeyCodeChord(os !== OperatingSystem.Macintosh, true, false, os === OperatingSystem.Macintosh, KeyCode.KeyP)], os));
	}
}

function renderPixelSpinners({ container, disposableStore }: ComponentFixtureContext): void {
	for (const variant of ['grid', 'ring'] as const) {
		const item = primitiveRow(container, variant === 'grid' ? 'Loading files' : 'Checking changes');
		disposableStore.add(createPixelSpinner(item, { variant }));
	}
}


// ============================================================================
// Styles (themed versions for fixture display)
// ============================================================================

const themedToggleStyles = {
	...unthemedToggleStyles,
	inputActiveOptionBorder: 'var(--vscode-inputOption-activeBorder)',
	inputActiveOptionForeground: 'var(--vscode-inputOption-activeForeground)',
	inputActiveOptionBackground: 'var(--vscode-inputOption-activeBackground)',
};

const themedCheckboxStyles = {
	checkboxBackground: 'var(--vscode-checkbox-background)',
	checkboxBorder: 'var(--vscode-checkbox-border)',
	checkboxForeground: 'var(--vscode-checkbox-foreground)',
	checkboxDisabledBackground: undefined,
	checkboxDisabledForeground: undefined,
};

const themedBadgeStyles = {
	badgeBackground: 'var(--vscode-badge-background)',
	badgeForeground: 'var(--vscode-badge-foreground)',
	badgeBorder: undefined,
};

const themedProgressBarOptions = {
	progressBarBackground: 'var(--vscode-progressBar-background)',
};


// ============================================================================
// Buttons
// ============================================================================

function renderButtons({ container, disposableStore }: ComponentFixtureContext): void {
	container.style.padding = '16px';
	container.style.display = 'flex';
	container.style.flexDirection = 'column';
	container.style.gap = '12px';

	// Section: Primary Buttons
	const primarySection = $('div');
	primarySection.style.display = 'flex';
	primarySection.style.flexWrap = 'wrap';
	primarySection.style.gap = '8px';
	primarySection.style.alignItems = 'center';
	container.appendChild(primarySection);

	const primaryButton = disposableStore.add(new Button(primarySection, { ...themedButtonStyles, title: 'Primary button' }));
	primaryButton.label = 'Primary Button';

	const primaryIconButton = disposableStore.add(new Button(primarySection, { ...themedButtonStyles, title: 'With Icon', supportIcons: true }));
	primaryIconButton.label = '$(add) Add Item';

	const smallButton = disposableStore.add(new Button(primarySection, { ...themedButtonStyles, title: 'Small button', small: true }));
	smallButton.label = 'Small';

	// Section: Secondary Buttons
	const secondarySection = $('div');
	secondarySection.style.display = 'flex';
	secondarySection.style.flexWrap = 'wrap';
	secondarySection.style.gap = '8px';
	secondarySection.style.alignItems = 'center';
	container.appendChild(secondarySection);

	const secondaryButton = disposableStore.add(new Button(secondarySection, { ...themedButtonStyles, secondary: true, title: 'Secondary button' }));
	secondaryButton.label = 'Secondary Button';

	const secondaryIconButton = disposableStore.add(new Button(secondarySection, { ...themedButtonStyles, secondary: true, title: 'Cancel', supportIcons: true }));
	secondaryIconButton.label = '$(close) Cancel';

	// Section: Disabled Buttons
	const disabledSection = $('div');
	disabledSection.style.display = 'flex';
	disabledSection.style.flexWrap = 'wrap';
	disabledSection.style.gap = '8px';
	disabledSection.style.alignItems = 'center';
	container.appendChild(disabledSection);

	const disabledButton = disposableStore.add(new Button(disabledSection, { ...themedButtonStyles, title: 'Disabled', disabled: true }));
	disabledButton.label = 'Disabled';
	disabledButton.enabled = false;

	const disabledSecondary = disposableStore.add(new Button(disabledSection, { ...themedButtonStyles, secondary: true, title: 'Disabled Secondary', disabled: true }));
	disabledSecondary.label = 'Disabled Secondary';
	disabledSecondary.enabled = false;
}

function renderButtonBar({ container, disposableStore }: ComponentFixtureContext): void {
	container.style.padding = '16px';
	container.style.display = 'flex';
	container.style.flexDirection = 'column';
	container.style.gap = '16px';

	// Button Bar
	const barContainer = $('div');
	container.appendChild(barContainer);

	const buttonBar = new ButtonBar(barContainer);
	disposableStore.add(buttonBar);

	const okButton = buttonBar.addButton({ ...themedButtonStyles, title: 'OK' });
	okButton.label = 'OK';

	const cancelButton = buttonBar.addButton({ ...themedButtonStyles, secondary: true, title: 'Cancel' });
	cancelButton.label = 'Cancel';

	// Button with Description
	const descContainer = $('div');
	descContainer.style.width = '300px';
	container.appendChild(descContainer);

	const buttonWithDesc = disposableStore.add(new ButtonWithDescription(descContainer, { ...themedButtonStyles, title: 'Install Extension', supportIcons: true }));
	buttonWithDesc.label = '$(extensions) Install Extension';
	buttonWithDesc.description = 'This will install the extension and enable it globally';
}


// ============================================================================
// Toggles and Checkboxes
// ============================================================================

function renderKeyboardFocusedToggle(context: ComponentFixtureContext): void {
	const { container, disposableStore } = context;
	container.style.padding = '16px';

	const toggle = disposableStore.add(new Toggle({
		...themedToggleStyles,
		title: 'Match Case',
		isChecked: true,
		icon: Codicon.caseSensitive,
	}));
	container.appendChild(toggle.domNode);
	context.focus(toggle);
}

function renderToggles({ container, disposableStore }: ComponentFixtureContext): void {
	container.style.padding = '16px';
	container.style.display = 'flex';
	container.style.flexDirection = 'column';
	container.style.gap = '12px';

	// Toggles
	const toggleSection = $('div');
	toggleSection.style.display = 'flex';
	toggleSection.style.gap = '16px';
	toggleSection.style.alignItems = 'center';
	container.appendChild(toggleSection);

	const toggle1 = disposableStore.add(new Toggle({
		...themedToggleStyles,
		title: 'Case Sensitive',
		isChecked: false,
		icon: Codicon.caseSensitive,
	}));
	toggleSection.appendChild(toggle1.domNode);

	const toggle2 = disposableStore.add(new Toggle({
		...themedToggleStyles,
		title: 'Whole Word',
		isChecked: true,
		icon: Codicon.wholeWord,
	}));
	toggleSection.appendChild(toggle2.domNode);

	const toggle3 = disposableStore.add(new Toggle({
		...themedToggleStyles,
		title: 'Use Regular Expression',
		isChecked: false,
		icon: Codicon.regex,
	}));
	toggleSection.appendChild(toggle3.domNode);

	// Checkboxes
	const checkboxSection = $('div');
	checkboxSection.style.display = 'flex';
	checkboxSection.style.flexDirection = 'column';
	checkboxSection.style.gap = '8px';
	container.appendChild(checkboxSection);

	const createCheckboxRow = (label: string, checked: boolean) => {
		const row = $('div');
		row.style.display = 'flex';
		row.style.alignItems = 'center';
		row.style.gap = '8px';

		const checkbox = disposableStore.add(new Checkbox(label, checked, themedCheckboxStyles));
		row.appendChild(checkbox.domNode);

		const labelEl = $('span');
		labelEl.textContent = label;
		labelEl.style.color = 'var(--vscode-foreground)';
		row.appendChild(labelEl);

		return row;
	};

	checkboxSection.appendChild(createCheckboxRow('Enable auto-save', true));
	checkboxSection.appendChild(createCheckboxRow('Show line numbers', true));
	checkboxSection.appendChild(createCheckboxRow('Word wrap', false));
}


// ============================================================================
// Input Boxes
// ============================================================================

function renderInputBoxes({ container, disposableStore }: ComponentFixtureContext): void {
	container.style.padding = '16px';
	container.style.display = 'flex';
	container.style.flexDirection = 'column';
	container.style.gap = '16px';
	container.style.width = '100%';
	container.style.maxWidth = '350px';
	container.style.boxSizing = 'border-box';

	// Input with value
	const filledInput = disposableStore.add(new InputBox(container, undefined, {
		placeholder: 'File path',
		inputBoxStyles: themedInputBoxStyles,
	}));
	filledInput.value = '/src/vs/editor/browser';

	// Input with info validation
	const infoInput = disposableStore.add(new InputBox(container, undefined, {
		placeholder: 'Username',
		inputBoxStyles: themedInputBoxStyles,
		validationOptions: {
			validation: (value) => value.length < 3 ? { content: 'Username must be at least 3 characters', type: MessageType.INFO } : null
		}
	}));
	infoInput.value = 'ab';
	infoInput.validate();

	// Input with warning validation
	const warningInput = disposableStore.add(new InputBox(container, undefined, {
		placeholder: 'Password',
		inputBoxStyles: themedInputBoxStyles,
		validationOptions: {
			validation: (value) => value.length < 8 ? { content: 'Password should be at least 8 characters for security', type: MessageType.WARNING } : null
		}
	}));
	warningInput.value = 'pass';
	warningInput.validate();

	// Input with error validation
	const errorInput = disposableStore.add(new InputBox(container, undefined, {
		placeholder: 'Email address',
		inputBoxStyles: themedInputBoxStyles,
		validationOptions: {
			validation: (value) => !value.includes('@') ? { content: 'Please enter a valid email address', type: MessageType.ERROR } : null
		}
	}));
	errorInput.value = 'invalid-email';
	errorInput.validate();
}


// ============================================================================
// Count Badges
// ============================================================================

function renderCountBadges({ container, disposableStore }: ComponentFixtureContext): void {
	container.style.padding = '16px';
	container.style.display = 'flex';
	container.style.gap = '12px';
	container.style.alignItems = 'center';

	// Various badge counts
	const counts = [1, 5, 12, 99, 999];

	for (const count of counts) {
		const badgeContainer = $('div');
		badgeContainer.style.display = 'flex';
		badgeContainer.style.alignItems = 'center';
		badgeContainer.style.gap = '8px';

		const label = $('span');
		label.textContent = 'Issues';
		label.style.color = 'var(--vscode-foreground)';
		badgeContainer.appendChild(label);

		disposableStore.add(new CountBadge(badgeContainer, { count }, themedBadgeStyles));
		container.appendChild(badgeContainer);
	}
}


// ============================================================================
// Action Bar
// ============================================================================

function renderActionBar({ container, disposableStore }: ComponentFixtureContext): void {
	container.style.padding = '16px';
	container.style.display = 'flex';
	container.style.flexDirection = 'column';
	container.style.gap = '16px';

	// Horizontal action bar
	const horizontalLabel = $('div');
	horizontalLabel.textContent = 'Horizontal Actions:';
	horizontalLabel.style.color = 'var(--vscode-foreground)';
	horizontalLabel.style.marginBottom = '4px';
	container.appendChild(horizontalLabel);

	const horizontalContainer = $('div');
	container.appendChild(horizontalContainer);

	const horizontalBar = disposableStore.add(new ActionBar(horizontalContainer, {
		ariaLabel: 'Editor Actions',
	}));

	horizontalBar.push([
		disposableStore.add(new Action('editor.action.save', 'Save', ThemeIcon.asClassName(Codicon.save), true, async () => console.log('Save'))),
		disposableStore.add(new Action('editor.action.undo', 'Undo', ThemeIcon.asClassName(Codicon.discard), true, async () => console.log('Undo'))),
		disposableStore.add(new Action('editor.action.redo', 'Redo', ThemeIcon.asClassName(Codicon.redo), true, async () => console.log('Redo'))),
		new Separator(),
		disposableStore.add(new Action('editor.action.find', 'Find', ThemeIcon.asClassName(Codicon.search), true, async () => console.log('Find'))),
		disposableStore.add(new Action('editor.action.replace', 'Replace', ThemeIcon.asClassName(Codicon.replaceAll), true, async () => console.log('Replace'))),
	]);

	// Action bar with disabled items
	const mixedLabel = $('div');
	mixedLabel.textContent = 'Mixed States:';
	mixedLabel.style.color = 'var(--vscode-foreground)';
	mixedLabel.style.marginBottom = '4px';
	container.appendChild(mixedLabel);

	const mixedContainer = $('div');
	container.appendChild(mixedContainer);

	const mixedBar = disposableStore.add(new ActionBar(mixedContainer, {
		ariaLabel: 'Mixed Actions',
	}));

	mixedBar.push([
		disposableStore.add(new Action('action.enabled', 'Enabled', ThemeIcon.asClassName(Codicon.play), true, async () => { })),
		disposableStore.add(new Action('action.disabled', 'Disabled', ThemeIcon.asClassName(Codicon.debugPause), false, async () => { })),
		disposableStore.add(new Action('action.enabled2', 'Enabled', ThemeIcon.asClassName(Codicon.debugStop), true, async () => { })),
	]);
}


// ============================================================================
// Progress Bar
// ============================================================================

function renderProgressBars({ container, disposableStore }: ComponentFixtureContext): void {
	container.style.padding = '16px';
	container.style.display = 'flex';
	container.style.flexDirection = 'column';
	container.style.gap = '24px';
	container.style.width = '400px';

	const createSection = (label: string) => {
		const section = $('div');
		const labelEl = $('div');
		labelEl.textContent = label;
		labelEl.style.color = 'var(--vscode-foreground)';
		labelEl.style.marginBottom = '8px';
		labelEl.style.fontSize = '12px';
		section.appendChild(labelEl);

		// Progress bar container with proper constraints
		const barContainer = $('div');
		barContainer.style.position = 'relative';
		barContainer.style.width = '100%';
		barContainer.style.height = '4px';
		barContainer.style.overflow = 'hidden';
		section.appendChild(barContainer);

		container.appendChild(section);
		return barContainer;
	};

	// Discrete progress - 30%
	const progress30Section = createSection('Discrete Progress - 30%');
	const progress30Bar = disposableStore.add(new ProgressBar(progress30Section, themedProgressBarOptions));
	progress30Bar.total(100);
	progress30Bar.worked(30);

	// Discrete progress - 60%
	const progress60Section = createSection('Discrete Progress - 60%');
	const progress60Bar = disposableStore.add(new ProgressBar(progress60Section, themedProgressBarOptions));
	progress60Bar.total(100);
	progress60Bar.worked(60);

	// Discrete progress - 90%
	const progress90Section = createSection('Discrete Progress - 90%');
	const progress90Bar = disposableStore.add(new ProgressBar(progress90Section, themedProgressBarOptions));
	progress90Bar.total(100);
	progress90Bar.worked(90);

	// Completed progress
	const doneSection = createSection('Completed (100%)');
	const doneBar = disposableStore.add(new ProgressBar(doneSection, themedProgressBarOptions));
	doneBar.total(100);
	doneBar.worked(100);
}


// ============================================================================
// Highlighted Label
// ============================================================================

function renderHighlightedLabels({ container, disposableStore }: ComponentFixtureContext): void {
	container.style.padding = '16px';
	container.style.display = 'flex';
	container.style.flexDirection = 'column';
	container.style.gap = '8px';
	container.style.color = 'var(--vscode-foreground)';

	const createHighlightedLabel = (text: string, highlights: { start: number; end: number }[]) => {
		const row = $('div');
		row.style.display = 'flex';
		row.style.alignItems = 'center';
		row.style.gap = '8px';

		const labelContainer = $('div');
		const label = disposableStore.add(new HighlightedLabel(labelContainer));
		label.set(text, highlights);
		row.appendChild(labelContainer);

		const queryLabel = $('span');
		queryLabel.style.color = 'var(--vscode-descriptionForeground)';
		queryLabel.style.fontSize = '12px';
		queryLabel.textContent = `(matches highlighted)`;
		row.appendChild(queryLabel);

		return row;
	};

	// File search examples
	container.appendChild(createHighlightedLabel('codeEditorWidget.ts', [{ start: 0, end: 4 }])); // "code"
	container.appendChild(createHighlightedLabel('inlineCompletionsController.ts', [{ start: 6, end: 10 }])); // "Comp"
	container.appendChild(createHighlightedLabel('diffEditorViewModel.ts', [{ start: 0, end: 4 }, { start: 10, end: 14 }])); // "diff" and "View"
	container.appendChild(createHighlightedLabel('workbenchTestServices.ts', [{ start: 9, end: 13 }])); // "Test"
}
