/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const baseFixture = 'src/vs/workbench/test/browser/componentFixtures/baseUI.fixture.ts';

// Initial curation, not an automatic classification of the fixture registry.
export const controls = [
	{ id: 'button', name: 'Button', groups: ['baseUI/Buttons'], file: baseFixture, owner: 'src/vs/base/browser/ui/button/button.ts', reason: 'Shared action control, independent of any feature workflow.' },
	{ id: 'input', name: 'Input box', groups: ['baseUI/InputBoxes'], file: baseFixture, owner: 'src/vs/base/browser/ui/inputbox/inputBox.ts', reason: 'Shared text entry and validation states.' },
	{ id: 'toggle', name: 'Checkbox and toggle', groups: ['baseUI/Toggles', 'baseUI/KeyboardFocusedToggle'], file: baseFixture, owner: 'src/vs/base/browser/ui/toggle/toggle.ts', reason: 'Shared binary selection controls; the fixture demonstrates both.' },
	{ id: 'radio', name: 'Radio group', groups: [], owner: 'src/vs/base/browser/ui/radio/radio.ts', reason: 'Shared mutually exclusive selection primitive. A standalone fixture mapping is still needed.' },
	{ id: 'label', name: 'Label', groups: ['baseUI/HighlightedLabels'], file: baseFixture, owner: 'src/vs/base/browser/ui/highlightedlabel/highlightedLabel.ts', reason: 'Reusable text presentation and match highlighting.' },
	{ id: 'dropdown', name: 'Multi-select dropdown', groups: ['editor/multiSelectDropdown/Weekdays'], file: 'src/vs/workbench/test/browser/componentFixtures/editor/multiSelectDropdown.fixture.ts', owner: 'src/vs/platform/actionWidget/browser/multiSelectDropdown.ts', reason: 'Shared platform selection control. The editor-named fixture uses generic weekday data, not a feature workflow.' },
	{ id: 'badge', name: 'Badge', groups: ['baseUI/CountBadges'], file: baseFixture, owner: 'src/vs/base/browser/ui/countBadge/countBadge.ts', reason: 'Reusable count indicator.' },
	{ id: 'progress', name: 'Progress bar', groups: ['baseUI/ProgressBars'], file: baseFixture, owner: 'src/vs/base/browser/ui/progressbar/progressbar.ts', reason: 'Shared progress feedback, without a feature-specific task model.' },
	{ id: 'action-bar', name: 'Action bar', groups: ['baseUI/ActionBar'], file: baseFixture, owner: 'src/vs/base/browser/ui/actionbar/actionbar.ts', reason: 'Reusable action layout primitive; included as a building block, not a feature composite.' },
	{ id: 'button-bar', name: 'Button bar', groups: ['baseUI/ButtonBar'], file: baseFixture, owner: 'src/vs/base/browser/ui/button/button.ts', reason: 'Reusable grouping of button controls.' },
];

export const controlGaps = [
	{ name: 'ComboBox', note: 'No reviewed fixture mapping yet. Keep this as an audit gap rather than substitute a feature-specific picker.' },
	{ name: 'Single-select dropdown', note: 'The shared SelectBox needs a reviewed fixture mapping; the multi-select dropdown is a different control.', owner: 'src/vs/base/browser/ui/selectBox/selectBox.ts' },
];

export function curateFixtures(fixtures) {
	if (!Array.isArray(fixtures)) {
		throw new Error('Component Explorer returned an invalid fixture catalog');
	}
	return controls.map(control => ({
		...control,
		variants: fixtures.filter(fixture => Array.isArray(fixture.groupPath) && control.groups.includes(fixture.groupPath.join('/'))).map(fixture => {
			if (typeof fixture.fixtureId !== 'string' || fixture.fixtureId.length > 1024 || typeof fixture.fixtureName !== 'string') {
				throw new Error('Component Explorer returned an invalid fixture identifier');
			}
			return {
				id: fixture.fixtureId,
				name: `${fixture.groupPath.at(-1) === 'KeyboardFocusedToggle' ? 'Keyboard focus · ' : ''}${fixture.fixtureName}`,
				group: fixture.groupPath.join('/'),
				variant: fixture.fixtureName,
				background: fixture.background,
			};
		}),
	}));
}
