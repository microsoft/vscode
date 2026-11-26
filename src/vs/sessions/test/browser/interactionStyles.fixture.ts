/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import '../../browser/media/style.css';
import '../../../base/browser/ui/button/button.css';
import * as DOM from '../../../base/browser/dom.js';
import { Button } from '../../../base/browser/ui/button/button.js';
import { defaultButtonStyles } from '../../../platform/theme/browser/defaultStyles.js';
import { ComponentFixtureContext, defineComponentFixture, defineThemedFixtureGroup } from '../../../workbench/test/browser/componentFixtures/fixtureUtils.js';

type InteractionState = 'rest' | 'hovered' | 'focus-visible' | 'disabled';

function renderControl(container: HTMLElement, label: string, classes: readonly string[], state: InteractionState): void {
	const control = DOM.append(container, DOM.$('button', { type: 'button' }, label)) as HTMLButtonElement;
	control.classList.add(...classes, state);
	control.disabled = state === 'disabled';
	control.style.padding = '4px 8px';
	control.style.border = 'var(--vscode-strokeThickness) solid var(--vscode-contrastBorder, transparent)';
	control.style.background = 'transparent';
	control.style.color = 'inherit';
}

function renderStateColumn(context: ComponentFixtureContext, state: InteractionState): void {
	const { container, disposableStore } = context;
	const column = DOM.append(container, DOM.$('.interaction-state-column'));
	column.style.display = 'flex';
	column.style.flexDirection = 'column';
	column.style.gap = '8px';
	DOM.append(column, DOM.$('strong', undefined, state));
	renderControl(column, 'Toolbar control', ['agent-sessions-interactive'], state);
	renderControl(column, 'List control', ['agent-sessions-interactive', 'agent-sessions-interactive-list'], state);
	const button = disposableStore.add(new Button(column, defaultButtonStyles));
	button.label = 'Standard button';
	button.enabled = state !== 'disabled';
	button.element.classList.add(state);
}

function renderInteractionStyles(context: ComponentFixtureContext): void {
	const { container } = context;
	container.classList.add('monaco-workbench', 'agent-sessions-workbench');
	container.style.display = 'grid';
	container.style.gridTemplateColumns = 'repeat(4, minmax(0, 1fr))';
	container.style.gap = '16px';
	container.style.width = '760px';
	container.style.padding = '24px';
	container.style.boxSizing = 'border-box';
	container.style.background = 'var(--vscode-agentsPanel-background)';
	container.style.color = 'var(--vscode-foreground)';

	for (const state of ['rest', 'hovered', 'focus-visible', 'disabled'] as const) {
		renderStateColumn(context, state);
	}
}

export default defineThemedFixtureGroup({ path: 'sessions/interactionStyles/' }, {
	StateMatrix: defineComponentFixture({
		labels: { kind: 'screenshot' },
		additionalThemes: ['darkHighContrast', 'lightHighContrast'],
		render: renderInteractionStyles,
	}),
});
