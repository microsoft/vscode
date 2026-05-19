/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../../base/common/event.js';
import { observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { IFileDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { IListService, ListService } from '../../../../../platform/list/browser/listService.js';
import { IContextViewService } from '../../../../../platform/contextview/browser/contextView.js';
import { ChatArtifactsWidget } from '../../../../contrib/chat/browser/widget/chatArtifactsWidget.js';
import { IChatImageCarouselService } from '../../../../contrib/chat/browser/chatImageCarouselService.js';
import { IChatArtifact, IChatArtifacts, IChatArtifactsService, IArtifactSourceGroup } from '../../../../contrib/chat/common/tools/chatArtifactsService.js';
import { ComponentFixtureContext, createEditorServices, defineComponentFixture, defineThemedFixtureGroup } from '../fixtureUtils.js';

import '../../../../contrib/chat/browser/widget/media/chat.css';

function createMockArtifactsFromGroups(groups: IArtifactSourceGroup[]): IChatArtifacts {
	const artifactGroups = observableValue<readonly IArtifactSourceGroup[]>('artifactGroups', groups);
	return new class extends mock<IChatArtifacts>() {
		override readonly artifactGroups = artifactGroups;
		override setAgentArtifacts(a: IChatArtifact[]) { artifactGroups.set(a.length > 0 ? [{ source: { kind: 'agent' }, artifacts: a }] : [], undefined); }
		override clearAgentArtifacts() { artifactGroups.set([], undefined); }
		override clearSubagentArtifacts() { }
		override migrate() { }
	}();
}

function createMockArtifacts(artifacts: IChatArtifact[]): IChatArtifacts {
	return createMockArtifactsFromGroups(artifacts.length > 0 ? [{ source: { kind: 'agent' }, artifacts }] : []);
}

function createMockArtifactsService(artifacts: IChatArtifact[]): IChatArtifactsService {
	const instance = createMockArtifacts(artifacts);
	return new class extends mock<IChatArtifactsService>() {
		override getArtifacts() { return instance; }
	}();
}

function createMockArtifactsServiceFromGroups(groups: IArtifactSourceGroup[]): IChatArtifactsService {
	const instance = createMockArtifactsFromGroups(groups);
	return new class extends mock<IChatArtifactsService>() {
		override getArtifacts() { return instance; }
	}();
}

function renderArtifactsWidget(context: ComponentFixtureContext, artifacts: IChatArtifact[]): void {
	const { container, disposableStore } = context;

	const instantiationService = createEditorServices(disposableStore, {
		colorTheme: context.theme,
		additionalServices: (reg) => {
			reg.define(IListService, ListService);
			reg.defineInstance(IContextViewService, new class extends mock<IContextViewService>() { }());
			reg.defineInstance(IChatArtifactsService, createMockArtifactsService(artifacts));
			reg.defineInstance(IChatImageCarouselService, new class extends mock<IChatImageCarouselService>() { }());
			reg.defineInstance(IFileService, new class extends mock<IFileService>() { override onDidFilesChange = Event.None; override onDidRunOperation = Event.None; }());
			reg.defineInstance(IFileDialogService, new class extends mock<IFileDialogService>() { }());
		},
	});

	const widget = disposableStore.add(instantiationService.createInstance(ChatArtifactsWidget));
	widget.setSessionResource(URI.parse('chat-session:test-session'));

	container.style.width = '400px';
	container.style.padding = '8px';
	container.appendChild(widget.domNode);
}

function renderArtifactsWidgetFromGroups(context: ComponentFixtureContext, groups: IArtifactSourceGroup[]): void {
	const { container, disposableStore } = context;

	const instantiationService = createEditorServices(disposableStore, {
		colorTheme: context.theme,
		additionalServices: (reg) => {
			reg.define(IListService, ListService);
			reg.defineInstance(IContextViewService, new class extends mock<IContextViewService>() { }());
			reg.defineInstance(IChatArtifactsService, createMockArtifactsServiceFromGroups(groups));
			reg.defineInstance(IChatImageCarouselService, new class extends mock<IChatImageCarouselService>() { }());
			reg.defineInstance(IFileService, new class extends mock<IFileService>() { override onDidFilesChange = Event.None; override onDidRunOperation = Event.None; }());
			reg.defineInstance(IFileDialogService, new class extends mock<IFileDialogService>() { }());
		},
	});

	const widget = disposableStore.add(instantiationService.createInstance(ChatArtifactsWidget));
	widget.setSessionResource(URI.parse('chat-session:test-session'));

	container.style.width = '400px';
	container.style.padding = '8px';
	container.appendChild(widget.domNode);
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

const multiSourceGroups: IArtifactSourceGroup[] = [
	{
		source: { kind: 'rules' },
		artifacts: [
			{ label: 'Implementation Plan', uri: 'file:///tmp/plan.md', type: 'plan', groupName: 'Plans' },
			{ label: 'Verification Plan', uri: 'file:///tmp/verify-plan.md', type: 'plan', groupName: 'Plans' },
			{ label: 'Screenshot 1', uri: 'file:///tmp/s1.png', type: 'screenshot', groupName: 'Screenshots', onlyShowGroup: true },
			{ label: 'Screenshot 2', uri: 'file:///tmp/s2.png', type: 'screenshot', groupName: 'Screenshots', onlyShowGroup: true },
			{ label: 'Screenshot 3', uri: 'file:///tmp/s3.png', type: 'screenshot', groupName: 'Screenshots', onlyShowGroup: true },
		],
	},
	{
		source: { kind: 'agent' },
		artifacts: [
			{ label: 'Specification (v2 - reviewed)', uri: 'file:///tmp/spec.md', type: 'plan' },
			{ label: 'Dev Server', uri: 'http://localhost:5173', type: 'devServer' },
		],
	},
	{
		source: { kind: 'subagent', invocationId: 'sub-1', name: 'Explore' },
		artifacts: [
			{ label: 'Architecture Notes', uri: 'file:///tmp/arch.md', type: 'plan' },
		],
	},
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

	MultipleArtifactsCollapsed: defineComponentFixture({
		render: context => {
			renderArtifactsWidget(context, multipleArtifacts);
			const expandButton = context.container.querySelector<HTMLElement>('.chat-artifacts-expand .monaco-button');
			expandButton?.click();
		},
	}),

	MultiSourceExpanded: defineComponentFixture({
		render: context => renderArtifactsWidgetFromGroups(context, multiSourceGroups),
	}),

	MultiSourceHoveredRow: defineComponentFixture({
		render: context => {
			renderArtifactsWidgetFromGroups(context, multiSourceGroups);
			// Force hover on a rules-sourced leaf (save only, no clear)
			const rows = context.container.querySelectorAll<HTMLElement>('.chat-artifacts-list-row');
			for (const row of rows) {
				const label = row.querySelector('.chat-artifacts-list-label');
				if (label?.textContent === 'Implementation Plan') {
					row.classList.add('force-hover');
					break;
				}
			}
		},
	}),
});
