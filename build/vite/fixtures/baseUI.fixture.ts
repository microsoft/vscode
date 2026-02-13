/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $ } from '../../../src/vs/base/browser/dom';
import { Codicon } from '../../../src/vs/base/common/codicons';
import { ThemeIcon } from '../../../src/vs/base/common/themables';
import { Action, Separator } from '../../../src/vs/base/common/actions';

// UI Components
import { Button, ButtonBar, ButtonWithDescription, unthemedButtonStyles } from '../../../src/vs/base/browser/ui/button/button';
import { Toggle, Checkbox, unthemedToggleStyles } from '../../../src/vs/base/browser/ui/toggle/toggle';
import { InputBox, MessageType, unthemedInboxStyles } from '../../../src/vs/base/browser/ui/inputbox/inputBox';
import { CountBadge } from '../../../src/vs/base/browser/ui/countBadge/countBadge';
import { ActionBar } from '../../../src/vs/base/browser/ui/actionbar/actionbar';
import { ProgressBar } from '../../../src/vs/base/browser/ui/progressbar/progressbar';
import { HighlightedLabel } from '../../../src/vs/base/browser/ui/highlightedlabel/highlightedLabel';

import { ComponentFixtureContext, defineComponentFixture, defineThemedFixtureGroup } from './fixtureUtils';


// ============================================================================
// Styles (themed versions for fixture display)
// ============================================================================

const themedButtonStyles = {
	...unthemedButtonStyles,
	buttonBackground: 'var(--vscode-button-background)',
	buttonHoverBackground: 'var(--vscode-button-hoverBackground)',
	buttonForeground: 'var(--vscode-button-foreground)',
	buttonSecondaryBackground: 'var(--vscode-button-secondaryBackground)',
	buttonSecondaryHoverBackground: 'var(--vscode-button-secondaryHoverBackground)',
	buttonSecondaryForeground: 'var(--vscode-button-secondaryForeground)',
	buttonBorder: 'var(--vscode-button-border)',
};

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

const themedInputBoxStyles = {
	...unthemedInboxStyles,
	inputBackground: 'var(--vscode-input-background)',
	inputForeground: 'var(--vscode-input-foreground)',
	inputBorder: 'var(--vscode-input-border)',
	inputValidationInfoBackground: 'var(--vscode-inputValidation-infoBackground)',
	inputValidationInfoBorder: 'var(--vscode-inputValidation-infoBorder)',
	inputValidationWarningBackground: 'var(--vscode-inputValidation-warningBackground)',
	inputValidationWarningBorder: 'var(--vscode-inputValidation-warningBorder)',
	inputValidationErrorBackground: 'var(--vscode-inputValidation-errorBackground)',
	inputValidationErrorBorder: 'var(--vscode-inputValidation-errorBorder)',
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

function renderButtons({ container, disposableStore }: ComponentFixtureContext): HTMLElement {
	container.style.padding = '16px';
	container.style.display = 'flex';
	container.style.flexDirection = 'column';
	container.style.gap = '12px';

	// Section: Primary Buttons
	const primarySection = $('div');
	primarySection.style.display = 'flex';
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
	disabledSection.style.gap = '8px';
	disabledSection.style.alignItems = 'center';
	container.appendChild(disabledSection);

	const disabledButton = disposableStore.add(new Button(disabledSection, { ...themedButtonStyles, title: 'Disabled', disabled: true }));
	disabledButton.label = 'Disabled';
	disabledButton.enabled = false;

	const disabledSecondary = disposableStore.add(new Button(disabledSection, { ...themedButtonStyles, secondary: true, title: 'Disabled Secondary', disabled: true }));
	disabledSecondary.label = 'Disabled Secondary';
	disabledSecondary.enabled = false;

	return container;
}

function renderButtonBar({ container, disposableStore }: ComponentFixtureContext): HTMLElement {
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

	return container;
}


// ============================================================================
// Toggles and Checkboxes
// ============================================================================

function renderToggles({ container, disposableStore }: ComponentFixtureContext): HTMLElement {
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

	return container;
}


// ============================================================================
// Input Boxes
// ============================================================================

function renderInputBoxes({ container, disposableStore }: ComponentFixtureContext): HTMLElement {
	container.style.padding = '16px';
	container.style.display = 'flex';
	container.style.flexDirection = 'column';
	container.style.gap = '16px';
	container.style.width = '350px';

	// Normal input
	const normalInput = disposableStore.add(new InputBox(container, undefined, {
		placeholder: 'Enter search query...',
		inputBoxStyles: themedInputBoxStyles,
	}));

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

	return container;
}


// ============================================================================
// Count Badges
// ============================================================================

function renderCountBadges({ container }: ComponentFixtureContext): HTMLElement {
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

		new CountBadge(badgeContainer, { count }, themedBadgeStyles);
		container.appendChild(badgeContainer);
	}

	return container;
}


// ============================================================================
// Action Bar
// ============================================================================

function renderActionBar({ container, disposableStore }: ComponentFixtureContext): HTMLElement {
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
		new Action('editor.action.save', 'Save', ThemeIcon.asClassName(Codicon.save), true, async () => console.log('Save')),
		new Action('editor.action.undo', 'Undo', ThemeIcon.asClassName(Codicon.discard), true, async () => console.log('Undo')),
		new Action('editor.action.redo', 'Redo', ThemeIcon.asClassName(Codicon.redo), true, async () => console.log('Redo')),
		new Separator(),
		new Action('editor.action.find', 'Find', ThemeIcon.asClassName(Codicon.search), true, async () => console.log('Find')),
		new Action('editor.action.replace', 'Replace', ThemeIcon.asClassName(Codicon.replaceAll), true, async () => console.log('Replace')),
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
		new Action('action.enabled', 'Enabled', ThemeIcon.asClassName(Codicon.play), true, async () => { }),
		new Action('action.disabled', 'Disabled', ThemeIcon.asClassName(Codicon.debugPause), false, async () => { }),
		new Action('action.enabled2', 'Enabled', ThemeIcon.asClassName(Codicon.debugStop), true, async () => { }),
	]);

	return container;
}


// ============================================================================
// Progress Bar
// ============================================================================

function renderProgressBars({ container, disposableStore }: ComponentFixtureContext): HTMLElement {
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

	// Infinite progress
	const infiniteSection = createSection('Infinite Progress (loading...)');
	const infiniteBar = disposableStore.add(new ProgressBar(infiniteSection, themedProgressBarOptions));
	infiniteBar.infinite();

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

	return container;
}


// ============================================================================
// Highlighted Label
// ============================================================================

function renderHighlightedLabels({ container }: ComponentFixtureContext): HTMLElement {
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
		const label = new HighlightedLabel(labelContainer);
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

	return container;
}


// ============================================================================
// Export Fixtures
// ============================================================================

export default defineThemedFixtureGroup({
	Buttons: defineComponentFixture({
		render: renderButtons,
	}),

	ButtonBar: defineComponentFixture({
		render: renderButtonBar,
	}),

	Toggles: defineComponentFixture({
		render: renderToggles,
	}),

	InputBoxes: defineComponentFixture({
		render: renderInputBoxes,
	}),

	CountBadges: defineComponentFixture({
		render: renderCountBadges,
	}),

	ActionBar: defineComponentFixture({
		render: renderActionBar,
	}),

	ProgressBars: defineComponentFixture({
		render: renderProgressBars,
	}),

	HighlightedLabels: defineComponentFixture({
		render: renderHighlightedLabels,
	}),
});
