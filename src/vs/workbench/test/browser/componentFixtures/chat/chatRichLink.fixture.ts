/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { constObservable } from '../../../../../base/common/observable.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { buildAgentSessionLinkPresentation } from '../../../../../platform/agentHost/common/openSessionLink.js';
import { ILinkPresentation, ILinkPresentationRule, ILinkPresentationService, ILinkPresentationWatcher } from '../../../../../platform/dataChannel/common/dataChannel.js';
import { ChatRichLink } from '../../../../contrib/chat/browser/widget/chatContentParts/chatRichLink.js';
import { ComponentFixtureContext, defineComponentFixture, defineThemedFixtureGroup } from '../fixtureUtils.js';
import { renderChatWidget } from './chatWidget.fixture.js';
import { buildGitCommitPresentation, buildGitHubFolderPresentation, buildGitHubIssuePresentation, buildGitHubPullRequestPresentation, buildGitHubRepositoryPresentation, buildLoadingPresentationFromCached } from './linkPresentationBuilders.js';

interface RichLinkFixtureData {
	readonly authoredLabel: string;
	readonly presentation: ILinkPresentation;
}

function renderRichLinks(context: ComponentFixtureContext, links: readonly RichLinkFixtureData[]): void {
	context.container.classList.add('monaco-workbench', 'chat-rich-link-fixture');
	context.container.style.display = 'grid';
	context.container.style.gridTemplateColumns = 'repeat(2, max-content)';
	context.container.style.alignItems = 'center';
	context.container.style.gap = '12px';
	context.container.style.padding = '12px';
	context.container.style.width = '720px';
	context.container.style.minHeight = '180px';
	context.container.style.backgroundColor = 'var(--vscode-editor-background)';

	for (const { authoredLabel: label, presentation } of links) {
		const anchor = context.container.ownerDocument.createElement('a');
		anchor.href = '#';
		const authoredLabel = context.container.ownerDocument.createElement('span');
		authoredLabel.textContent = label;
		const richLink = context.disposableStore.add(ChatRichLink.mount(anchor, authoredLabel));
		richLink.update(presentation);
		context.container.appendChild(anchor);
	}
}

function createLinkPresentationService(presentation: ILinkPresentation): ILinkPresentationService {
	return new class extends mock<ILinkPresentationService>() {
		override getLinkPresentationRule(): ILinkPresentationRule {
			return { id: 'fixture', uriPattern: /.*/, kind: presentation.kind };
		}
		override createLinkPresentationWatcher(): ILinkPresentationWatcher {
			return {
				presentation: constObservable(presentation),
				dispose() { },
			};
		}
	}();
}

const githubPullRequestPresentation = buildGitHubPullRequestPresentation({
	owner: 'hediet',
	repository: 'demo-json-schema-validator',
	number: 7,
	title: 'Validate schemas through declared meta-schemas',
	status: { kind: 'draft', label: 'Draft' },
	checksStatus: { kind: 'success', label: 'Checks passed' },
});

export default defineThemedFixtureGroup({ path: 'chat/' }, {
	inChat: defineComponentFixture({
		render: context => renderChatWidget(context, {
			width: 720,
			height: 320,
			inputVisible: false,
			linkPresentationService: createLinkPresentationService(buildAgentSessionLinkPresentation('Implement rich links', 'Agent session', 'inProgress')),
			messages: [{
				user: 'Continue the implementation',
				assistant: [{
					kind: 'markdown',
					text: 'The [implementation session](agent-host-session://copilotcli/rich-links) is still working.',
				}],
			}],
		}),
	}),
	githubPullRequestInChat: defineComponentFixture({
		render: context => renderChatWidget(context, {
			width: 720,
			height: 320,
			inputVisible: false,
			linkPresentationService: createLinkPresentationService(githubPullRequestPresentation),
			messages: [{
				user: 'What is open?',
				assistant: [{
					kind: 'markdown',
					text: '## Open\n\n- [#7 — Validate schemas through declared meta-schemas](https://github.com/hediet/demo-json-schema-validator/pull/7) — **Draft**',
				}],
			}],
		}),
	}),
	loadingGithubPullRequestInChat: defineComponentFixture({
		render: context => renderChatWidget(context, {
			width: 720,
			height: 320,
			inputVisible: false,
			linkPresentationService: createLinkPresentationService(buildLoadingPresentationFromCached(githubPullRequestPresentation)),
			messages: [{
				user: 'What is open?',
				assistant: [{
					kind: 'markdown',
					text: '## Open\n\n- [#7 — Validate schemas through declared meta-schemas](https://github.com/hediet/demo-json-schema-validator/pull/7) — **Draft**',
				}],
			}],
		}),
	}),
	sessionStates: defineComponentFixture({
		render: context => renderRichLinks(context, [
			{ authoredLabel: 'Preparing implementation', presentation: buildAgentSessionLinkPresentation('Preparing implementation', undefined, 'untitled') },
			{ authoredLabel: 'Implement rich links', presentation: buildAgentSessionLinkPresentation('Implement rich links', undefined, 'inProgress') },
			{ authoredLabel: 'Review architecture', presentation: buildAgentSessionLinkPresentation('Review architecture', undefined, 'needsInput') },
			{ authoredLabel: 'Update fixtures', presentation: buildAgentSessionLinkPresentation('Update fixtures', undefined, 'completed') },
			{ authoredLabel: 'Run validation', presentation: buildAgentSessionLinkPresentation('Run validation', undefined, 'error') },
			{ authoredLabel: 'Investigate tests', presentation: buildAgentSessionLinkPresentation('Investigate tests', undefined, 'inProgress', 'chat') },
			{ authoredLabel: 'Resolving chat', presentation: { kind: 'resource', status: { kind: 'pending', label: 'Loading' } } },
		]),
	}),
	presentationKinds: defineComponentFixture({
		render: context => renderRichLinks(context, [
			{
				authoredLabel: '#330678',
				presentation: buildGitHubIssuePresentation({
					owner: 'microsoft',
					repository: 'vscode',
					number: 330678,
					title: 'Rich links in chat',
					status: { kind: 'open', label: 'Open' },
				}),
			},
			{
				authoredLabel: '#330925',
				presentation: buildGitHubPullRequestPresentation({
					owner: 'microsoft',
					repository: 'vscode',
					number: 330925,
					title: 'Render rich links',
					status: { kind: 'draft', label: 'Draft' },
					checksStatus: { kind: 'success', label: 'Checks passed' },
				}),
			},
			{
				authoredLabel: '4d291e3',
				presentation: buildGitCommitPresentation({
					hash: '4d291e3123456789',
					message: 'Refine rich links',
					shortStat: { insertions: 42, deletions: 7 },
				}),
			},
			{
				authoredLabel: 'componentFixtures',
				presentation: buildGitHubFolderPresentation({
					owner: 'microsoft',
					repository: 'vscode',
					path: 'src/vs/workbench/test/browser/componentFixtures',
					href: 'https://github.com/microsoft/vscode/tree/main/src/vs/workbench/test/browser/componentFixtures',
				}),
			},
			{
				authoredLabel: 'microsoft/vscode',
				presentation: buildGitHubRepositoryPresentation({
					owner: 'microsoft',
					repository: 'vscode',
					language: 'TypeScript',
					stars: 177_000,
				}),
			},
		]),
	}),
});
