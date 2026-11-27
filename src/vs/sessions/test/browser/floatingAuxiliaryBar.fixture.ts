/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, append } from '../../../base/browser/dom.js';
import { Codicon } from '../../../base/common/codicons.js';
import { Event } from '../../../base/common/event.js';
import { ComponentFixtureContext, createEditorServices, defineComponentFixture, defineThemedFixtureGroup } from '../../../workbench/test/browser/componentFixtures/fixtureUtils.js';
import { FloatingAuxiliaryBarController } from '../../browser/floatingAuxiliaryBarController.js';

function renderFocusedPanel({ container, disposableStore, theme, focus, overrideFocus }: ComponentFixtureContext): void {
	container.classList.add('agent-sessions-workbench', 'dock-detail-panel');
	Object.assign(container.style, { width: '420px', height: '340px', background: 'var(--vscode-editor-background)' });

	const editor = append(container, $('.part.editor'));
	Object.assign(editor.style, { position: 'relative', width: '100%', height: '100%' });
	const part = append(editor, $('.part.auxiliarybar'));
	part.style.background = 'var(--vscode-agentsDetail-background)';
	const contents = append(part, $('div', { role: 'tree', 'aria-label': 'Files', tabIndex: 0 }));
	Object.assign(contents.style, { padding: '8px 16px', lineHeight: '24px', color: 'var(--vscode-foreground)' });
	for (const label of ['workspace', '  src', '  README.md', '  package.json']) {
		append(contents, $('div', { role: 'treeitem' }, label));
	}

	const host = {
		getTitle: () => 'Files',
		getIcon: () => Codicon.files,
		isChangesViewActive: () => false,
		onDidChangeTitle: Event.None,
		getWidth: () => 300,
		setWidth: () => { },
		getHeight: () => 240,
		setHeight: () => { },
		getContentHeight: () => undefined,
		onDidChangeContentHeight: Event.None,
		setSizeToContent: () => { },
		focusEditor: () => editor.focus(),
	};
	const services = createEditorServices(disposableStore, { colorTheme: theme });
	const controller = disposableStore.add(services.createInstance(FloatingAuxiliaryBarController, editor, {
		getContainer: () => part,
		layout: () => { },
	}, host));
	controller.setPinned(true);
	controller.layout(0);

	const panel = editor.querySelector<HTMLElement>('.floating-details');
	if (!panel) {
		throw new Error('Floating details panel was not created');
	}
	focus(panel);
	if (overrideFocus && document.activeElement !== panel) {
		throw new Error('Floating details panel did not receive focus');
	}
}

export default defineThemedFixtureGroup({ path: 'sessions/floatingDetails/' }, {
	Focused: defineComponentFixture({
		labels: { kind: 'screenshot' },
		expectedVisualDescriptions: ['Keyboard focus is shown by one border that follows the rounded floating panel surface.'],
		additionalThemes: ['darkHighContrast', 'lightHighContrast'],
		render: renderFocusedPanel,
	}),
});
