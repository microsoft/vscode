/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../base/browser/dom.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { createBrowserWelcome } from '../../../../contrib/browserView/browser/browserWelcome.js';
import { IEditorGroup } from '../../../../services/editor/common/editorGroupsService.js';
import { ComponentFixtureContext, createEditorServices, defineComponentFixture, defineThemedFixtureGroup } from '../fixtureUtils.js';

// eslint-disable-next-line local/code-import-patterns
import { EmptyFileEditor } from '../../../../../sessions/contrib/editor/browser/emptyFileEditor.js';
// eslint-disable-next-line local/code-import-patterns
import { renderSessionsEmptyState } from '../../../../../sessions/browser/parts/sessionsEmptyState.js';
// eslint-disable-next-line local/code-import-patterns
import '../../../../../sessions/browser/parts/media/editorPart.css';

const FIXTURE_WIDTH = 600;
const FIXTURE_HEIGHT = 360;

function createMockEditorGroup(): IEditorGroup {
	return new class extends mock<IEditorGroup>() {
		override windowId = mainWindow.vscodeWindowId;
	}();
}

function prepareContainer(container: HTMLElement): HTMLElement {
	container.style.width = `${FIXTURE_WIDTH}px`;
	container.style.height = `${FIXTURE_HEIGHT}px`;
	container.classList.add('agent-sessions-workbench', 'dock-detail-panel');

	const editorPart = dom.append(container, dom.$('.part.editor'));
	editorPart.style.width = '100%';
	editorPart.style.height = '100%';
	return editorPart;
}

function renderFilesEmptyState({ container, disposableStore, theme }: ComponentFixtureContext): void {
	const instantiationService = createEditorServices(disposableStore, { colorTheme: theme });
	const editor = disposableStore.add(instantiationService.createInstance(EmptyFileEditor, createMockEditorGroup()));
	editor.create(prepareContainer(container));
	editor.layout(new dom.Dimension(FIXTURE_WIDTH, FIXTURE_HEIGHT));
}

function renderBrowserEmptyState({ container }: ComponentFixtureContext): void {
	const browserRoot = dom.append(prepareContainer(container), dom.$('.browser-root'));
	browserRoot.style.position = 'relative';
	browserRoot.style.width = '100%';
	browserRoot.style.height = '100%';
	browserRoot.appendChild(createBrowserWelcome('Browser', 'Use Add Element to Chat to reference UI elements in chat prompts.'));
}

function renderChangesEmptyState({ container }: ComponentFixtureContext): void {
	const editorPart = prepareContainer(container);
	editorPart.style.display = 'flex';
	editorPart.style.alignItems = 'center';
	editorPart.style.justifyContent = 'center';
	renderSessionsEmptyState(editorPart, 'Changes', 'No changed files');
}

export default defineThemedFixtureGroup({ path: 'sessions/emptyStates/' }, {
	Files: defineComponentFixture({
		labels: { kind: 'screenshot' },
		additionalThemes: ['darkHighContrast'],
		expectedVisualDescriptions: ['A centered Files empty state has a semibold "Files" title, a secondary "Select a file from the Files view" description directly below it, no icon, and a Search Files button separated beneath the message.'],
		render: renderFilesEmptyState,
	}),
	Browser: defineComponentFixture({
		labels: { kind: 'screenshot' },
		additionalThemes: ['darkHighContrast'],
		expectedVisualDescriptions: ['A centered Browser empty state has a semibold "Browser" title directly above a secondary two-line description, with no globe icon.'],
		render: renderBrowserEmptyState,
	}),
	Changes: defineComponentFixture({
		labels: { kind: 'screenshot' },
		additionalThemes: ['darkHighContrast'],
		expectedVisualDescriptions: ['A centered Changes empty state has a semibold "Changes" title directly above the secondary text "No changed files", with no icon.'],
		render: renderChangesEmptyState,
	}),
});
