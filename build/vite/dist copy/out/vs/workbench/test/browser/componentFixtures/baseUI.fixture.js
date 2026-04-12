/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { $ } from '../../../../base/browser/dom.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { Action, Separator } from '../../../../base/common/actions.js';
// UI Components
import { Button, ButtonBar, ButtonWithDescription, unthemedButtonStyles } from '../../../../base/browser/ui/button/button.js';
import { Toggle, Checkbox, unthemedToggleStyles } from '../../../../base/browser/ui/toggle/toggle.js';
import { InputBox, unthemedInboxStyles } from '../../../../base/browser/ui/inputbox/inputBox.js';
import { CountBadge } from '../../../../base/browser/ui/countBadge/countBadge.js';
import { ActionBar } from '../../../../base/browser/ui/actionbar/actionbar.js';
import { ProgressBar } from '../../../../base/browser/ui/progressbar/progressbar.js';
import { HighlightedLabel } from '../../../../base/browser/ui/highlightedlabel/highlightedLabel.js';
import { defineComponentFixture, defineThemedFixtureGroup } from './fixtureUtils.js';
export default defineThemedFixtureGroup({
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
});
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
function renderButtons({ container, disposableStore }) {
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
}
function renderButtonBar({ container, disposableStore }) {
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
function renderToggles({ container, disposableStore }) {
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
    const createCheckboxRow = (label, checked) => {
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
function renderInputBoxes({ container, disposableStore }) {
    container.style.padding = '16px';
    container.style.display = 'flex';
    container.style.flexDirection = 'column';
    container.style.gap = '16px';
    container.style.width = '350px';
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
            validation: (value) => value.length < 3 ? { content: 'Username must be at least 3 characters', type: 1 /* MessageType.INFO */ } : null
        }
    }));
    infoInput.value = 'ab';
    infoInput.validate();
    // Input with warning validation
    const warningInput = disposableStore.add(new InputBox(container, undefined, {
        placeholder: 'Password',
        inputBoxStyles: themedInputBoxStyles,
        validationOptions: {
            validation: (value) => value.length < 8 ? { content: 'Password should be at least 8 characters for security', type: 2 /* MessageType.WARNING */ } : null
        }
    }));
    warningInput.value = 'pass';
    warningInput.validate();
    // Input with error validation
    const errorInput = disposableStore.add(new InputBox(container, undefined, {
        placeholder: 'Email address',
        inputBoxStyles: themedInputBoxStyles,
        validationOptions: {
            validation: (value) => !value.includes('@') ? { content: 'Please enter a valid email address', type: 3 /* MessageType.ERROR */ } : null
        }
    }));
    errorInput.value = 'invalid-email';
    errorInput.validate();
}
// ============================================================================
// Count Badges
// ============================================================================
function renderCountBadges({ container }) {
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
}
// ============================================================================
// Action Bar
// ============================================================================
function renderActionBar({ container, disposableStore }) {
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
}
// ============================================================================
// Progress Bar
// ============================================================================
function renderProgressBars({ container, disposableStore }) {
    container.style.padding = '16px';
    container.style.display = 'flex';
    container.style.flexDirection = 'column';
    container.style.gap = '24px';
    container.style.width = '400px';
    const createSection = (label) => {
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
function renderHighlightedLabels({ container }) {
    container.style.padding = '16px';
    container.style.display = 'flex';
    container.style.flexDirection = 'column';
    container.style.gap = '8px';
    container.style.color = 'var(--vscode-foreground)';
    const createHighlightedLabel = (text, highlights) => {
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
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYmFzZVVJLmZpeHR1cmUuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvdGVzdC9icm93c2VyL2NvbXBvbmVudEZpeHR1cmVzL2Jhc2VVSS5maXh0dXJlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSxDQUFDLEVBQUUsTUFBTSxpQ0FBaUMsQ0FBQztBQUNwRCxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFDOUQsT0FBTyxFQUFFLFNBQVMsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ2pFLE9BQU8sRUFBRSxNQUFNLEVBQUUsU0FBUyxFQUFFLE1BQU0sb0NBQW9DLENBQUM7QUFFdkUsZ0JBQWdCO0FBQ2hCLE9BQU8sRUFBRSxNQUFNLEVBQUUsU0FBUyxFQUFFLHFCQUFxQixFQUFFLG9CQUFvQixFQUFFLE1BQU0sOENBQThDLENBQUM7QUFDOUgsT0FBTyxFQUFFLE1BQU0sRUFBRSxRQUFRLEVBQUUsb0JBQW9CLEVBQUUsTUFBTSw4Q0FBOEMsQ0FBQztBQUN0RyxPQUFPLEVBQUUsUUFBUSxFQUFlLG1CQUFtQixFQUFFLE1BQU0sa0RBQWtELENBQUM7QUFDOUcsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLHNEQUFzRCxDQUFDO0FBQ2xGLE9BQU8sRUFBRSxTQUFTLEVBQUUsTUFBTSxvREFBb0QsQ0FBQztBQUMvRSxPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0sd0RBQXdELENBQUM7QUFDckYsT0FBTyxFQUFFLGdCQUFnQixFQUFFLE1BQU0sa0VBQWtFLENBQUM7QUFFcEcsT0FBTyxFQUEyQixzQkFBc0IsRUFBRSx3QkFBd0IsRUFBRSxNQUFNLG1CQUFtQixDQUFDO0FBRzlHLGVBQWUsd0JBQXdCLENBQUM7SUFDdkMsT0FBTyxFQUFFLHNCQUFzQixDQUFDO1FBQy9CLE1BQU0sRUFBRSxF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