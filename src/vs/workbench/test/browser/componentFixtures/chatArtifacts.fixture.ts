/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { Event } from '../../../../base/common/event.js';
import { observableValue } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
import { mock } from '../../../../base/test/common/mock.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { IListService, ListService } from '../../../../platform/list/browser/listService.js';
import { ChatArtifactsWidget } from '../../../contrib/chat/browser/widget/chatArtifactsWidget.js';
import { IChatArtifact, IChatArtifactsService } from '../../../contrib/chat/common/tools/chatArtifactsService.js';
import { ComponentFixtureContext, createEditorServices, defineComponentFixture, defineThemedFixtureGroup } from './fixtureUtils.js';

import '../../../contrib/chat/browser/widget/media/chat.css';

function createMockArtifactsService(artifacts: IChatArtifact[]): IChatArtifactsService {
	const obs = observableValue<readonly IChatArtifact[]>('artifacts', artifacts);
	return new class extends mock<IChatArtifactsService>() {
		override readonly onDidUpdateArtifacts = Event.None;
		override getArtifacts() { return artifacts; }
		override setArtifacts() { }
		override migrateArtifacts() { }
		override artifacts() { return obs; }
	}();
}

function renderArtifactsWidget(context: ComponentFixtureContext, artifacts: IChatArtifact[]): void {
	const { container, disposableStore } = context;

	const instantiationService = createEditorServices(disposableStore, {
		colorTheme: context.theme,
		additionalServices: (reg) => {
			reg.define(IListService, ListService);
			reg.defineInstance(IChatArtifactsService, createMockArtifactsService(artifacts));
			reg.defineInstance(IFileService, new class extends mock<IFileService>() { override onDidFilesChange = Event.None; override onDidRunOperation = Event.None; }());
		},
	});

	const widget = disposableStore.add(instantiationService.createInstance(ChatArtifactsWidget));
	widget.render(URI.parse('chat-session:test-session'));

	container.style.width = '400px';
	container.style.padding = '8px';
	container.appendChild(widget.domNode);
}

function renderInChatInputPart(context: ComponentFixtureContext, artifacts: IChatArtifact[]): void {
	const { container, disposableStore } = context;

	const instantiationService = createEditorServices(disposableStore, {
		colorTheme: context.theme,
		additionalServices: (reg) => {
			reg.define(IListService, ListService);
			reg.defineInstance(IChatArtifactsService, createMockArtifactsService(artifacts));
			reg.defineInstance(IFileService, new class extends mock<IFileService>() { override onDidFilesChange = Event.None; override onDidRunOperation = Event.None; }());
		},
	});

	container.style.width = '500px';
	container.classList.add('monaco-workbench');

	const session = dom.$('.interactive-session');
	container.appendChild(session);

	const inputPart = dom.h('.interactive-input-part', [
		dom.h('.chat-artifacts-widget-container@artifactsContainer'),
		dom.h('.interactive-input-and-side-toolbar', [
			dom.h('.chat-input-container', [
				dom.h('.chat-editor-container@editorContainer'),
			]),
		]),
	]);
	session.appendChild(inputPart.root);

	inputPart.editorContainer.style.height = '44px';

	const widget = disposableStore.add(instantiationService.createInstance(ChatArtifactsWidget));
	widget.render(URI.parse('chat-session:test-session'));
	inputPart.artifactsContainer.appendChild(widget.domNode);
}

// ============================================================================
// Sample artifacts
// ============================================================================

const singleArtifact: IChatArtifact[] = [
	{ label: 'Dev Server', uri: 'http://localhost:3000', type: 'devServer' },
];

const multipleArtifacts: IChatArtifact[] = [
	{ label: 'Dev Server', uri: 'http://localhost:3000', type: 'devServer' },
	{ label: 'Screenshot of login page', uri: 'file:///tmp/screenshot.png', type: 'screenshot' },
	{ label: 'Implementation Plan', uri: 'file:///tmp/plan.md', type: 'plan' },
];

const manyArtifacts: IChatArtifact[] = [
	{ label: 'Dev Server', uri: 'http://localhost:3000', type: 'devServer' },
	{ label: 'Screenshot 1', uri: 'file:///tmp/s1.png', type: 'screenshot' },
	{ label: 'Screenshot 2', uri: 'file:///tmp/s2.png', type: 'screenshot' },
	{ label: 'Plan', uri: 'file:///tmp/plan.md', type: 'plan' },
	{ label: 'API Docs', uri: 'http://localhost:3000/docs', type: undefined },
];

// ============================================================================
// Fixtures
// ============================================================================

export default defineThemedFixtureGroup({ path: 'chat/artifacts/' }, {
	SingleArtifact: defineComponentFixture({
		render: context => renderArtifactsWidget(context, singleArtifact),
	}),

	MultipleArtifacts: defineComponentFixture({
		render: context => renderArtifactsWidget(context, multipleArtifacts),
	}),

	ManyArtifacts: defineComponentFixture({
		render: context => renderArtifactsWidget(context, manyArtifacts),
	}),

	InChatInputSingle: defineComponentFixture({
		render: context => renderInChatInputPart(context, singleArtifact),
	}),

	InChatInputMultiple: defineComponentFixture({
		render: context => renderInChatInputPart(context, multipleArtifacts),
	}),
});
