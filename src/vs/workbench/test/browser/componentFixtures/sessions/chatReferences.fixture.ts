/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../base/browser/dom.js';
import { timeout } from '../../../../../base/common/async.js';
import { Event } from '../../../../../base/common/event.js';
import { VSBuffer } from '../../../../../base/common/buffer.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { IClipboardService } from '../../../../../platform/clipboard/common/clipboardService.js';
import { IActionWidgetService } from '../../../../../platform/actionWidget/browser/actionWidget.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IContextMenuService } from '../../../../../platform/contextview/browser/contextView.js';
import { ContextMenuService } from '../../../../../platform/contextview/browser/contextMenuService.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { HoverService } from '../../../../../platform/hover/browser/hoverService.js';
import { IOpenerService } from '../../../../../platform/opener/common/opener.js';
import { ILabelService } from '../../../../../platform/label/common/label.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { IWorkbenchGitHubService } from '../../../../services/github/common/githubService.js';
// eslint-disable-next-line local/code-import-patterns
import { IGitHubService } from '../../../../../sessions/contrib/github/browser/githubService.js';
// eslint-disable-next-line local/code-import-patterns
import { GitHubIssueState, GitHubIssueStateReason, GitHubPullRequestState, IGitHubIssue, IGitHubPullRequest } from '../../../../../sessions/contrib/github/common/types.js';
// eslint-disable-next-line local/code-import-patterns
import { ISessionArtifact, SessionArtifactKind } from '../../../../../sessions/services/sessions/common/session.js';
// eslint-disable-next-line local/code-import-patterns
import { ISessionsService } from '../../../../../sessions/services/sessions/browser/sessionsService.js';
import { ComponentFixtureContext, defineComponentFixture, defineThemedFixtureGroup, registerFixtureHoverService } from '../fixtureUtils.js';
import { createMockSession, renderPills } from './sessionChatInputToolbar.fixture.js';
import { createFixtureGitHubService, createFixtureWorkbenchGitHubService } from './githubFixtureUtils.js';

const pullRequests: readonly IGitHubPullRequest[] = [{
	number: 335583,
	title: 'Add rich GitHub reference previews',
	body: 'Show the title, lifecycle state and a short description before opening a reference. Keep keyboard navigation and copy actions available in the preview.',
	state: GitHubPullRequestState.Merged,
	author: { login: 'chryw', avatarUrl: '' },
	headRef: 'feature/reference-previews',
	headSha: 'abc1234',
	baseRef: 'main',
	isDraft: false,
	createdAt: '2026-09-10T12:00:00Z',
	updatedAt: '2026-09-12T12:00:00Z',
	mergedAt: '2026-09-12T12:00:00Z',
	mergeable: true,
	mergeableState: 'clean',
}, {
	number: 337923,
	title: 'Keep related work in References, and authored work in dedicated pills',
	body: 'Preserve the distinction between outputs and resources inspected during a session. Both categories remain individually removable without changing the linked resource.',
	state: GitHubPullRequestState.Open,
	author: { login: 'benibenj', avatarUrl: '' },
	headRef: 'feature/reference-categorization',
	headSha: 'def5678',
	baseRef: 'main',
	isDraft: true,
	createdAt: '2026-09-24T12:00:00Z',
	updatedAt: '2026-09-25T12:00:00Z',
	mergedAt: undefined,
	mergeable: true,
	mergeableState: 'clean',
}];

const issues: readonly IGitHubIssue[] = [{
	number: 335448,
	title: 'Show rich GitHub issue previews with title and description in hovers',
	body: 'A bare URL is not enough to identify a related issue. Show useful context in the preview without requiring the user to leave the conversation.',
	state: GitHubIssueState.Open,
	stateReason: undefined,
	author: { login: 'hediet', avatarUrl: '' },
	createdAt: '2026-09-10T12:00:00Z',
	updatedAt: '2026-09-24T12:00:00Z',
	closedAt: undefined,
}, {
	number: 337045,
	title: 'Keep reference previews readable when an issue has an unusually long title that describes several related problems, includes repository and branch details, and continues with enough context to wrap across multiple lines without pushing the issue number, lifecycle state, description, author, or available actions outside the preview',
	body: 'Use the same reference presentation in the Agents Window and editor chat, including keyboard access, copy actions and removal.',
	state: GitHubIssueState.Closed,
	stateReason: GitHubIssueStateReason.Completed,
	author: { login: 'octocat', avatarUrl: '' },
	createdAt: '2026-09-20T12:00:00Z',
	updatedAt: '2026-09-23T12:00:00Z',
	closedAt: '2026-09-23T12:00:00Z',
}];

const layoutPreview = VSBuffer.fromString(`<svg xmlns="http://www.w3.org/2000/svg" width="800" height="280" viewBox="0 0 800 280">
	<rect width="800" height="280" fill="#f5f6f8"/>
	<g fill="#fff" stroke="#64748b" stroke-width="2">
		<rect x="32" y="80" width="200" height="120" rx="12"/>
		<rect x="300" y="80" width="200" height="120" rx="12"/>
		<rect x="568" y="80" width="200" height="120" rx="12"/>
		<path d="M232 140h68m200 0h68"/>
	</g>
	<g fill="#1e293b" font-family="sans-serif" font-size="22" text-anchor="middle">
		<text x="400" y="42">Reference preview flow</text>
		<text x="132" y="132">Collection pill</text><text x="132" y="162">Click to open</text>
		<text x="400" y="132">Reference list</text><text x="400" y="162">Hover an item</text>
		<text x="668" y="132">Details</text><text x="668" y="162">Copy or remove</text>
	</g>
</svg>`);

function gitHubArtifacts(isArtifact: boolean): ISessionArtifact[] {
	return [
		...pullRequests.map(pr => ({ id: `pr-${pr.number}`, kind: SessionArtifactKind.PullRequest, label: pr.title, isArtifact, isGitHub: true, link: URI.parse(`https://github.com/microsoft/vscode/pull/${pr.number}`) })),
		...issues.map(issue => ({ id: `issue-${issue.number}`, kind: SessionArtifactKind.Issue, label: issue.title, isArtifact, isGitHub: true, link: URI.parse(`https://github.com/microsoft/vscode/issues/${issue.number}`) })),
	];
}

function resources(isArtifact: boolean): ISessionArtifact[] {
	return [
		{ id: 'image', kind: SessionArtifactKind.File, label: 'Layout mockup', isArtifact, uri: URI.file('/repo/design/reference-layout.svg') },
		{ id: 'file', kind: SessionArtifactKind.File, label: 'Implementation plan', isArtifact, uri: URI.file('/repo/docs/plan.md') },
		{ id: 'commit', kind: SessionArtifactKind.Commit, label: 'Reference preview implementation', isArtifact, commitHash: 'abc1234', link: URI.parse('https://github.com/microsoft/vscode/commit/abc1234') },
		{ id: 'website', kind: SessionArtifactKind.Website, label: 'VS Code documentation', isArtifact, link: URI.parse('https://code.visualstudio.com/docs') },
		{ id: 'settings', kind: SessionArtifactKind.Resource, label: 'Chat settings', isArtifact, uri: URI.parse('vscode://settings/chat') },
		{ id: 'ado', kind: SessionArtifactKind.Issue, label: 'ADO tracking item', isArtifact, isGitHub: false, link: URI.parse('https://dev.azure.com/example/project/_workitems/edit/42') },
	];
}

type Scenario = 'single' | 'collections' | 'mixed';

async function renderReferences(ctx: ComponentFixtureContext, scenario: Scenario): Promise<void> {
	const { container } = ctx;
	const authored = gitHubArtifacts(true);
	const entries = scenario === 'single'
		? [authored[0], authored[2], resources(true)[1]]
		: scenario === 'collections'
			? authored
			: [gitHubArtifacts(false)[0], gitHubArtifacts(false)[2], ...resources(false), ...resources(true).map(item => ({ ...item, id: `artifact-${item.id}`, ...(item.uri ? { uri: item.uri.with({ path: item.uri.path.replace('/repo/', '/repo/output/') }) } : {}) }))];
	const session = createMockSession({ artifacts: entries, removableArtifacts: true });
	const result = dom.$('div', { role: 'status', 'aria-live': 'polite' });
	result.style.cssText = 'position:absolute;bottom:16px;left:24px;right:24px;font-size:12px;color:var(--vscode-descriptionForeground);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
	result.textContent = 'Copy, open and remove actions affect fixture data only. Reload to reset.';
	const report = (message: string) => { result.textContent = message; };
	const removeArtifact = session.removeArtifact;
	session.removeArtifact = id => { removeArtifact(id); report(`Removed fixture record: ${id}`); };
	const workbenchGitHub = createFixtureWorkbenchGitHubService({
		delayMs: 120,
		pullRequests: pullRequests.map(pr => ({
			...pr,
			repositoryNameWithOwner: 'microsoft/vscode',
			url: `https://github.com/microsoft/vscode/pull/${pr.number}`,
			draft: pr.isDraft,
			baseSha: 'base',
		})),
		issues: issues.map(issue => ({
			...issue,
			stateReason: issue.state === GitHubIssueState.Closed ? 'completed' : undefined,
			url: `https://github.com/microsoft/vscode/issues/${issue.number}`,
			assignees: [],
			labels: [],
		})),
	});
	let finishHoverConstruction: (() => void) | undefined;
	try {
		renderPills(ctx, session, {
			height: scenario === 'mixed' ? '600px' : scenario === 'collections' ? '280px' : '420px',
			width: scenario === 'single' ? '660px' : scenario === 'collections' ? '1200px' : '1080px',
			popupPlacement: 'above',
			prepareServices: services => {
				const hovers = services.get(IHoverService);
				finishHoverConstruction = registerFixtureHoverService(container, hovers, ctx.disposableStore);
				const actionWidgets = services.get(IActionWidgetService);
				ctx.disposableStore.add(dom.addDisposableListener(container, 'keydown', event => {
					if (event.key === 'Escape') {
						actionWidgets.hide(true);
						hovers.hideHover();
					}
				}));
			},
			additionalServices: reg => {
				reg.define(IContextMenuService, ContextMenuService);
				reg.define(ISessionsService, class extends mock<ISessionsService>() {
					override setActive(): void { }
				});
				reg.defineInstance(IGitHubService, createFixtureGitHubService(
					pullRequests.map(pullRequest => ({ owner: 'microsoft', repo: 'vscode', pullRequest })),
					issues.map(issue => ({ owner: 'microsoft', repo: 'vscode', issue })),
				));
				reg.defineInstance(IWorkbenchGitHubService, workbenchGitHub);
				reg.defineInstance(IFileService, new class extends mock<IFileService>() {
					override readonly onDidFilesChange = Event.None;
					override readonly onDidRunOperation = Event.None;
					override hasProvider(): boolean { return true; }
					override async readFile(resource: URI) {
						return { resource, name: 'reference-layout.svg', mtime: 0, ctime: 0, etag: 'fixture', size: layoutPreview.byteLength, readonly: true, locked: false, executable: false, value: layoutPreview };
					}
				}());
				reg.define(IHoverService, class extends HoverService {
					override setupManagedHover(...[, target, content, options]: Parameters<IHoverService['setupManagedHover']>) {
						return super.setupManagedHover({
							delay: 200,
							placement: 'element',
							showHover: hover => this.showInstantHover({ ...hover, container }),
						}, target, content, options);
					}
				});
				reg.defineInstance(IClipboardService, new class extends mock<IClipboardService>() {
					private text = '';
					override async writeText(text: string): Promise<void> { this.text = text; report(`Copied: ${text}`); }
					override async readText(): Promise<string> { return this.text; }
				}());
				reg.defineInstance(IOpenerService, new class extends mock<IOpenerService>() {
					override async open(resource: URI | string): Promise<boolean> { report(`Open: ${resource.toString()}`); return true; }
				}());
				reg.defineInstance(ICommandService, new class extends mock<ICommandService>() {
					override async executeCommand<T>(command: string): Promise<T | undefined> { report(`Command: ${command}`); return undefined; }
				}());
				reg.defineInstance(ILabelService, new class extends mock<ILabelService>() {
					override readonly onDidChangeFormatters = Event.None;
					override getUriLabel(uri: URI, options?: { relative?: boolean }): string {
						return options?.relative ? uri.path.replace(/^\/repo\//, '') : uri.path;
					}
				}());
			},
		});
	} finally {
		finishHoverConstruction?.();
	}
	container.style.boxSizing = 'border-box';
	container.appendChild(result);
	const hint = dom.append(container, dom.$('div'));
	hint.style.cssText = 'position:absolute;top:16px;left:24px;color:var(--vscode-descriptionForeground);font-size:12px;';
	if (scenario !== 'single') {
		hint.style.top = 'auto';
		hint.style.bottom = '34px';
	}
	hint.textContent = scenario === 'single'
		? 'Hover for details; right-click a pill for copy/remove actions.'
		: 'Click a collection, then hover or focus a row for details. Escape returns to the pills.';
	const toolbar = container.querySelector<HTMLElement>('.session-chat-input-toolbar')!;
	toolbar.style.top = scenario === 'single' ? '52px' : scenario === 'mixed' ? '450px' : `${toolbar.offsetTop}px`;
	toolbar.style.bottom = 'auto';

	// Icon fonts must be ready before the dropdown measures row widths.
	await Promise.all(Array.from(dom.getWindow(container).document.fonts, font => font.load()));
	if (!ctx.isInteractive) {
		if (scenario === 'single') {
			container.querySelector<HTMLElement>('.chat-dropdown-pill-button')!.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
			await waitForPreview(container, '.sessions-pr-hover');
		} else {
			const label = scenario === 'collections' ? 'Issues' : 'References';
			Array.from(container.querySelectorAll<HTMLElement>('.chat-dropdown-pill-button')).find(button => button.textContent?.includes(label))!.click();
			if (scenario === 'mixed') {
				await waitForPreview(container, '.monaco-list-row[aria-label^="Open Show rich GitHub"] .action-item-badge');
			}
			const row = await waitForPreview(container, scenario === 'collections'
				? '.monaco-list-row[aria-label^="Open Issue #337045:"]'
				: '.monaco-list-row[aria-label^="Open Commit abc1234"]');
			row.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
			row.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, movementX: 1 }));
			await waitForPreview(container, scenario === 'collections' ? '.sessions-issue-hover' : '.sessions-commit-hover');
		}
	}
}

async function waitForPreview(container: HTMLElement, selector: string): Promise<HTMLElement> {
	for (let attempt = 0; attempt < 100; attempt++) {
		const element = container.querySelector<HTMLElement>(selector);
		if (element && element.getBoundingClientRect().height > 0) {
			const bounds = (element.closest('.monaco-hover, .action-list-submenu-panel') ?? element).getBoundingClientRect();
			const canvas = container.getBoundingClientRect();
			if (bounds.left >= canvas.left && bounds.top >= canvas.top && bounds.right <= canvas.right + 1 && bounds.bottom <= canvas.bottom + 1) {
				return element;
			}
		}
		await timeout(10);
	}
	throw new Error(`Reference preview did not appear: ${selector}`);
}

export default defineThemedFixtureGroup({ path: 'sessions/' }, {
	Single: defineComponentFixture({
		virtualTime: { enabled: false },
		render: ctx => renderReferences(ctx, 'single'),
		expectedVisualDescriptions: ['A single authored PR shows a rich hover with metadata, branch links, copy and remove actions. Interactive previews start at rest.'],
	}),
	Collections: defineComponentFixture({
		virtualTime: { enabled: false },
		render: ctx => renderReferences(ctx, 'collections'),
		expectedVisualDescriptions: ['The Issues collection opens above the toolbar with one long-title issue preview beside it. The issue number and actions remain visible. Interactive previews start at rest.'],
	}),
	Mixed: defineComponentFixture({
		virtualTime: { enabled: false },
		render: ctx => renderReferences(ctx, 'mixed'),
		expectedVisualDescriptions: ['The References dropdown shows one rich commit preview with author, date and hash actions. Artifacts remain separate. Interactive previews start at rest and also support GitHub, image, file, website, setting and non-GitHub entries.'],
	}),
});
