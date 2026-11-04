/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DeferredPromise } from '../../../../../base/common/async.js';
import { Event } from '../../../../../base/common/event.js';
import { mock } from '../../../../../base/test/common/mock.js';
import '../../../../../base/browser/ui/codicons/codiconStyles.js';
import '../../../../browser/media/style.css';
import { IContextMenuService, IContextViewService } from '../../../../../platform/contextview/browser/contextView.js';
import { ContextMenuService } from '../../../../../platform/contextview/browser/contextMenuService.js';
import { ContextViewService } from '../../../../../platform/contextview/browser/contextViewService.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { HoverService } from '../../../../../platform/hover/browser/hoverService.js';
import { ILayoutService } from '../../../../../platform/layout/browser/layoutService.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { IMarkdownRendererService, MarkdownRendererService } from '../../../../../platform/markdown/browser/markdownRenderer.js';
import { IStorageService, InMemoryStorageService } from '../../../../../platform/storage/common/storage.js';
import { CreatePullRequestPreferences, ICreatePullRequestPreferences } from '../../common/createPullRequestPreferences.js';
import { ISessionPullRequestAgentMergeOptions, ISessionPullRequestDetails } from '../../common/pullRequestCreation.js';
import { ComponentFixtureContext, createEditorServices, defineComponentFixture, defineThemedFixtureGroup, registerWorkbenchServices } from '../../../../../workbench/test/browser/componentFixtures/fixtureUtils.js';
import { CreatePullRequestWidget } from '../../browser/createPullRequestWidget.js';

const details: ISessionPullRequestDetails = {
	title: 'Preserve keyboard focus when switching sessions',
	description: '## Summary\nKeep keyboard focus in the active session when navigating between chats.\n\n## Testing\n- Added regression coverage for keyboard navigation\n- Verified focus restoration in the Agents window',
	branchName: 'fix/session-keyboard-focus',
	baseBranchName: 'main',
	repository: 'microsoft/vscode',
	autoMergeAllowed: true,
	mergeMethods: ['SQUASH', 'MERGE', 'REBASE'],
	agentMergeAvailable: true,
	agentMergeOptions: {
		addressReviews: true,
		fixCI: true,
		resolveConflicts: true,
		mergePullRequest: 'never',
	},
};

interface IFixtureOptions {
	readonly loading?: boolean;
	readonly draft?: boolean;
	readonly mergeMode?: 'Agent Merge' | 'Auto-Merge';
	readonly generationError?: boolean;
	readonly creationError?: boolean;
	readonly creating?: boolean;
	readonly narrow?: boolean;
	readonly restrictedRepository?: boolean;
	readonly agentMergeOptions?: ISessionPullRequestAgentMergeOptions;
	readonly preferences?: ICreatePullRequestPreferences;
	readonly dropdown?: boolean;
	readonly header?: Pick<ISessionPullRequestDetails, 'repository' | 'branchName' | 'baseBranchName'>;
}

const longHeader = {
	repository: 'organization-with-a-long-name/repository-with-a-long-name',
	baseBranchName: 'release/long-term-support-branch',
	branchName: 'feature/keep-keyboard-focus-when-switching-between-agent-sessions',
};

async function render({ container, disposableStore, theme }: ComponentFixtureContext, options: IFixtureOptions = {}): Promise<void> {
	container.classList.add('agent-sessions-workbench');
	container.style.padding = '16px';
	const generation = new DeferredPromise<ISessionPullRequestDetails>();
	const creation = new DeferredPromise<void>();
	const storage = disposableStore.add(new InMemoryStorageService());
	const preferences = new CreatePullRequestPreferences(storage, disposableStore.add(new NullLogService()));
	if (options.preferences) {
		preferences.update(options.preferences);
	}
	const instantiationService = createEditorServices(disposableStore, {
		colorTheme: theme,
		additionalServices: registration => {
			registerWorkbenchServices(registration);
			registration.defineInstance(IStorageService, storage);
			registration.define(IContextViewService, ContextViewService);
			registration.define(IContextMenuService, ContextMenuService);
			registration.defineInstance(ILayoutService, new class extends mock<ILayoutService>() {
				override readonly mainContainer = container;
				override readonly activeContainer = container;
				override readonly onDidLayoutContainer = Event.None;
				override getContainer(): HTMLElement { return container; }
			}());
			registration.define(IHoverService, HoverService);
			registration.define(IMarkdownRendererService, MarkdownRendererService);
		},
	});
	const widget = disposableStore.add(instantiationService.createInstance(CreatePullRequestWidget, {
		creation: {
			operationId: 'create-pr',
			prepareChatRequest: async query => ({ query }),
			prepare: () => options.loading ? generation.p : Promise.resolve({
				...details,
				...options.header,
				agentMergeOptions: options.agentMergeOptions ?? details.agentMergeOptions,
				...(options.generationError ? { title: '', description: '', generationError: 'The generation service is unavailable.' } : {}),
				...(options.restrictedRepository ? { autoMergeAllowed: false, agentMergeAvailable: false, agentMergeOptions: undefined, mergeMethods: [] } : {}),
			}),
			create: async () => {
				if (options.creationError) {
					throw new Error('The remote branch has changed. Sync your changes and try again.');
				}
				if (options.creating) {
					await creation.p;
				}
			},
		},
		branchName: options.header?.branchName ?? details.branchName,
		baseBranchName: options.header?.baseBranchName ?? details.baseBranchName,
		initialDraft: options.draft,
		preferences: preferences.read(),
		onDidChangePreferences: change => preferences.update(change),
		sendToChat: async () => { },
		onCancel: () => { },
		onCreated: () => { },
		onDetachedError: error => { throw error; },
	}));
	if (options.narrow) {
		widget.domNode.style.width = '320px';
	}
	container.appendChild(widget.domNode);
	if (!options.loading) {
		await widget.ready;
	}
	if (options.mergeMode) {
		const radio = [...widget.domNode.querySelectorAll<HTMLElement>('[role="radio"]')].find(node => node.textContent === options.mergeMode);
		if (!radio) {
			throw new Error(`Expected merge option ${options.mergeMode}`);
		}
		radio.click();
	}
	if (options.creating || options.creationError) {
		widget.domNode.querySelector<HTMLElement>('.create-pr-submit')!.click();
		await Promise.resolve();
		await Promise.resolve();
	}
	widget.layout();
	widget.focus();
	if (options.dropdown) {
		container.style.paddingBottom = '100px';
		widget.domNode.querySelector<HTMLElement>('.monaco-dropdown-button')!.click();
	}
}

export default defineThemedFixtureGroup({ path: 'sessions/createPullRequest' }, {
	Loading: defineComponentFixture({ render: context => render(context, { loading: true }), additionalThemes: ['darkHighContrast', 'lightHighContrast'] }),
	LoadingNarrow: defineComponentFixture({ render: context => render(context, { loading: true, narrow: true }) }),
	Ready: defineComponentFixture({ render: context => render(context), additionalThemes: ['darkHighContrast', 'lightHighContrast'] }),
	ChatPrimary: defineComponentFixture({ render: context => render(context, { preferences: { primaryAction: 'sendToChat' } }), additionalThemes: ['darkHighContrast', 'lightHighContrast'] }),
	ChatPrimaryNarrow: defineComponentFixture({ render: context => render(context, { narrow: true, preferences: { primaryAction: 'sendToChat' } }) }),
	ActionsDropdown: defineComponentFixture({ render: context => render(context, { dropdown: true }), additionalThemes: ['darkHighContrast', 'lightHighContrast'] }),
	RememberedAgentMerge: defineComponentFixture({
		render: context => render(context, {
			preferences: {
				draft: true, mergeMode: 'agent', mergeMethod: 'REBASE', primaryAction: 'sendToChat',
				agentMergeOptions: { addressReviews: true, fixCI: false, resolveConflicts: true, mergePullRequest: 'always' },
			}
		})
	}),
	RememberedAutoMerge: defineComponentFixture({ render: context => render(context, { preferences: { mergeMode: 'auto', mergeMethod: 'REBASE' } }) }),
	RememberedRestrictedRepository: defineComponentFixture({
		render: context => render(context, {
			restrictedRepository: true, preferences: {
				mergeMode: 'agent', mergeMethod: 'REBASE', agentMergeOptions: details.agentMergeOptions,
			}
		})
	}),
	LongHeader: defineComponentFixture({ render: context => render(context, { header: longHeader }) }),
	LongHeaderNarrow: defineComponentFixture({ render: context => render(context, { header: longHeader, narrow: true }), additionalThemes: ['darkHighContrast', 'lightHighContrast'] }),
	NewBranch: defineComponentFixture({ render: context => render(context, { header: { repository: details.repository, baseBranchName: 'main', branchName: 'main' } }) }),
	Draft: defineComponentFixture({ render: context => render(context, { draft: true }) }),
	AgentMerge: defineComponentFixture({ render: context => render(context, { mergeMode: 'Agent Merge' }), additionalThemes: ['darkHighContrast', 'lightHighContrast'] }),
	AgentMergeCustom: defineComponentFixture({ render: context => render(context, { mergeMode: 'Agent Merge', agentMergeOptions: { addressReviews: false, fixCI: true, resolveConflicts: false, mergePullRequest: 'ifUnchanged' } }) }),
	AgentMergeNarrow: defineComponentFixture({ render: context => render(context, { mergeMode: 'Agent Merge', narrow: true }) }),
	DraftWithAgentMerge: defineComponentFixture({ render: context => render(context, { draft: true, mergeMode: 'Agent Merge' }) }),
	AutoMerge: defineComponentFixture({ render: context => render(context, { mergeMode: 'Auto-Merge' }), additionalThemes: ['darkHighContrast', 'lightHighContrast'] }),
	Narrow: defineComponentFixture({ render: context => render(context, { narrow: true, mergeMode: 'Auto-Merge' }) }),
	GenerationFailed: defineComponentFixture({ render: context => render(context, { generationError: true }) }),
	CreationFailed: defineComponentFixture({ render: context => render(context, { creationError: true }) }),
	Creating: defineComponentFixture({ render: context => render(context, { creating: true }) }),
	RestrictedRepository: defineComponentFixture({ render: context => render(context, { restrictedRepository: true }) }),
});
