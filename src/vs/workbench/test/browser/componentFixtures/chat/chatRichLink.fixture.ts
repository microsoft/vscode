/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { constObservable } from '../../../../../base/common/observable.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ILinkPresentation, ILinkPresentationRule, ILinkPresentationService, ILinkPresentationWatcher } from '../../../../../platform/dataChannel/common/dataChannel.js';
import { ChatRichLink, IChatLinkPresentation } from '../../../../contrib/chat/browser/widget/chatContentParts/chatRichLink.js';
import { ComponentFixtureContext, defineComponentFixture, defineThemedFixtureGroup } from '../fixtureUtils.js';
import { renderChatWidget } from './chatWidget.fixture.js';

function renderRichLinks(context: ComponentFixtureContext, presentations: readonly IChatLinkPresentation[]): void {
	context.container.classList.add('monaco-workbench', 'chat-rich-link-fixture');
	context.container.style.display = 'grid';
	context.container.style.gridTemplateColumns = 'repeat(2, max-content)';
	context.container.style.alignItems = 'center';
	context.container.style.gap = '12px';
	context.container.style.padding = '12px';
	context.container.style.width = '720px';
	context.container.style.minHeight = '180px';
	context.container.style.backgroundColor = 'var(--vscode-editor-background)';

	for (const presentation of presentations) {
		const anchor = context.container.ownerDocument.createElement('a');
		anchor.href = '#';
		const authoredLabel = context.container.ownerDocument.createElement('span');
		authoredLabel.textContent = presentation.title ?? presentation.reference ?? presentation.kind;
		const richLink = context.disposableStore.add(ChatRichLink.mount(anchor, authoredLabel));
		richLink.update(presentation);
		context.container.appendChild(anchor);
	}
}

function createLinkPresentationService(presentation: ILinkPresentation): ILinkPresentationService {
	return new class extends mock<ILinkPresentationService>() {
		override getLinkPresentationRule(): ILinkPresentationRule {
			return { id: 'fixture', uriPattern: /.*/, initialKind: 'resource' };
		}
		override createLinkPresentationWatcher(): ILinkPresentationWatcher {
			return {
				presentation: constObservable(presentation),
				dispose() { },
			};
		}
	}();
}

const githubPullRequestPresentation: ILinkPresentation = {
	kind: 'pullRequest',
	title: 'Validate schemas through declared meta-schemas',
	reference: '#7',
	status: { kind: 'draft', label: 'Draft' },
	secondaryStatus: { kind: 'success', label: 'Checks passed' },
	tooltip: 'hediet/demo-json-schema-validator#7 · Draft · Checks passed',
	ariaLabel: 'Pull request hediet slash demo-json-schema-validator number 7, Draft, Checks passed: Validate schemas through declared meta-schemas',
};

export default defineThemedFixtureGroup({ path: 'chat/' }, {
	inChat: defineComponentFixture({
		render: context => renderChatWidget(context, {
			width: 720,
			height: 320,
			inputVisible: false,
			linkPresentationService: createLinkPresentationService({
				kind: 'session',
				title: 'Implement rich links',
				detail: 'Agent session',
				status: { kind: 'pending', label: 'Working' },
			}),
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
			linkPresentationService: createLinkPresentationService({
				...githubPullRequestPresentation,
				isLoading: true,
			}),
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
			{ kind: 'session', title: 'Preparing implementation', status: { kind: 'pending', label: 'Loading' } },
			{ kind: 'session', title: 'Implement rich links', status: { kind: 'pending', label: 'Working' } },
			{ kind: 'session', title: 'Review architecture', status: { kind: 'warning', label: 'Needs input' } },
			{ kind: 'session', title: 'Update fixtures', status: { kind: 'success', label: 'Completed' } },
			{ kind: 'session', title: 'Run validation', status: { kind: 'error', label: 'Error' } },
		]),
	}),
	presentationKinds: defineComponentFixture({
		render: context => renderRichLinks(context, [
			{ kind: 'issue', title: 'Rich links in chat', reference: '#330678', status: { kind: 'open', label: 'Open' } },
			{ kind: 'pullRequest', title: 'Render rich links', reference: '#330678', status: { kind: 'merged', label: 'Merged' }, secondaryStatus: { kind: 'success', label: 'Checks passed' } },
			{ kind: 'commit', title: 'Refine rich links', reference: '4d291e3', changes: { insertions: 42, deletions: 7 } },
			{ kind: 'file', title: 'chatRichLink.ts', detail: 'src/vs/workbench/contrib/chat' },
			{ kind: 'folder', title: 'componentFixtures', detail: 'src/vs/workbench/test/browser' },
			{ kind: 'repository', title: 'microsoft/vscode', detail: 'main' },
		]),
	}),
});
