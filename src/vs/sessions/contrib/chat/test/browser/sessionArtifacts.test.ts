/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Event } from '../../../../../base/common/event.js';
import { isMarkdownString } from '../../../../../base/common/htmlContent.js';
import { autorun, constObservable, derived, observableValue, type IReader } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IClipboardService } from '../../../../../platform/clipboard/common/clipboardService.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ILabelService } from '../../../../../platform/label/common/label.js';
import { IOpenerService } from '../../../../../platform/opener/common/opener.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { buildSessionArtifactSections, sessionArtifactLocationText, SessionArtifacts, type ISessionArtifactActions } from '../../browser/sessionArtifacts.js';
import { type IGitHubInfo, type ISessionArtifact, type ISessionWorkspace, SessionArtifactKind } from '../../../../services/sessions/common/session.js';
import { IActiveSession, ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
import { getSessionGitHubReferences } from '../../../github/common/sessionGitHubReferences.js';

suite('Session Artifacts', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	const actions: ISessionArtifactActions = {
		openExternal() { },
		openResource() { },
		openImages() { },
		copy() { },
	};

	/** Stands in for the label service: a path without its scheme, tildified and relative to the mounted `~/repo` folder. */
	const labelService = {
		getUriLabel: (uri: URI, options?: { relative?: boolean }) => {
			const path = uri.path.replace('/home/alice', '~');
			return options?.relative ? path.replace(/^~\/repo\/?/, '') : path;
		},
	};

	function createPresentation(entries: readonly ISessionArtifact[], info?: IGitHubInfo) {
		const artifacts = observableValue('artifacts', entries);
		const removed: string[] = [];
		const errors: string[] = [];
		let removalError: Error | undefined;
		const gitHubInfo = observableValue<IGitHubInfo | undefined>('gitHubInfo', info);
		const root = URI.file('/repo');
		const workspace = observableValue<ISessionWorkspace | undefined>('workspace', {
			uri: root,
			label: 'repo',
			icon: Codicon.folder,
			requiresWorkspaceTrust: false,
			isVirtualWorkspace: false,
			folders: [{
				root,
				workingDirectory: root,
				name: 'repo',
				description: undefined,
				gitRepository: { uri: root, workTreeUri: undefined, baseBranchName: undefined, gitHubInfo },
			}],
		});
		const session = observableValue<IActiveSession | undefined>('session', new class extends mock<IActiveSession>() {
			override readonly artifacts = artifacts;
			override readonly capabilities = constObservable({ supportsMultipleChats: false, supportsRemoveArtifacts: true });
			override readonly workspace = workspace;
		}());
		const configurationService = new TestConfigurationService();
		disposables.add(configurationService.onDidChangeConfigurationEmitter);
		const presentation = disposables.add(new SessionArtifacts(
			session,
			constObservable(new Set<string>()),
			derived(reader => getSessionGitHubReferences(session.read(reader), reader)),
			new class extends mock<IClipboardService>() { }(),
			new class extends mock<ICommandService>() { }(),
			configurationService,
			new class extends mock<ILabelService>() {
				override readonly onDidChangeFormatters = Event.None;
				override readonly getUriLabel = labelService.getUriLabel;
			}(),
			new class extends mock<INotificationService>() {
				override error(error: string): void { errors.push(error); }
			}(),
			new class extends mock<IOpenerService>() { }(),
			new class extends mock<ISessionsManagementService>() {
				override async removeSessionArtifact(_session: IActiveSession, artifactId: string): Promise<void> {
					removed.push(artifactId);
					if (removalError) {
						throw removalError;
					}
					artifacts.set(artifacts.get().filter(artifact => artifact.id !== artifactId), undefined);
				}
			}(),
			new class extends mock<IWorkspaceContextService>() {
				override readonly onDidChangeWorkspaceFolders = Event.None;
			}(),
		));
		return { presentation, session, artifacts, workspace, gitHubInfo, removed, errors, setRemovalError: (error: Error | undefined) => { removalError = error; } };
	}

	function visibleEntries(presentation: SessionArtifacts, reader?: IReader) {
		return {
			artifacts: presentation.sections.read(reader).flatMap(section => section.entries.map(entry => entry.id)),
			references: presentation.referenceSections.read(reader).flatMap(section => section.entries.map(entry => entry.id)),
		};
	}

	test('reads files as paths and leaves every other location whole', () => {
		const locations = [
			URI.file('/home/alice/repo/src/app.ts'),
			URI.file('/home/alice/notes.md'),
			URI.file('/home/alice/repo'),
			URI.parse('https://example.com/dashboard'),
			URI.parse('myapp://team/board?id=42'),
		];

		assert.deepStrictEqual(locations.map(uri => sessionArtifactLocationText(uri, labelService)), [
			'src/app.ts',
			'~/notes.md',
			'~/repo', // the mounted folder itself has no relative path
			'https://example.com/dashboard',
			'myapp://team/board?id=42',
		]);
	});

	test('shows each artifact path or link beside its dropdown entry', () => {
		const fileUri = URI.file('/home/alice/artifacts/report.md');
		const resourceUri = URI.parse('https://example.com/dashboard');
		const pullRequestLink = URI.parse('https://github.com/microsoft/vscode/pull/12');
		const artifacts: readonly ISessionArtifact[] = [
			{ id: 'pr', kind: SessionArtifactKind.PullRequest, label: 'PR #12', isArtifact: true, link: pullRequestLink },
			{ id: 'file', kind: SessionArtifactKind.File, label: 'Report', isArtifact: true, uri: fileUri },
			{ id: 'resource', kind: SessionArtifactKind.Resource, label: 'Resource', isArtifact: true, uri: resourceUri },
		];

		const entries = buildSessionArtifactSections(artifacts, actions, labelService, true, new Set()).flatMap(section => section.entries);
		assert.deepStrictEqual(entries.map(entry => {
			const content = entry.hover?.content;
			return {
				label: entry.label,
				ariaLabel: entry.ariaLabel,
				ariaDescription: entry.ariaDescription,
				hover: isMarkdownString(content) ? content.value : undefined,
				tooltip: entry.tooltip,
			};
		}), [
			{ label: 'PR #12', ariaLabel: 'Open PR #12', ariaDescription: pullRequestLink.toString(true), hover: pullRequestLink.toString(true), tooltip: pullRequestLink.toString(true) },
			// The hover is markdown, so its `~` arrives escaped.
			{ label: 'report.md', ariaLabel: 'Open report.md', ariaDescription: '~/artifacts/report.md', hover: '\\~/artifacts/report.md', tooltip: '~/artifacts/report.md' },
			{ label: 'Resource', ariaLabel: 'Open Resource', ariaDescription: resourceUri.toString(true), hover: resourceUri.toString(true), tooltip: resourceUri.toString(true) },
		]);
	});

	test('leaves out websites the browsers pill already lists', () => {
		const pullRequestLink = URI.parse('https://github.com/microsoft/vscode/pull/12');
		const artifacts: readonly ISessionArtifact[] = [
			{ id: 'docs', kind: SessionArtifactKind.Website, label: 'Docs', isArtifact: true, link: URI.parse('https://example.com/docs') },
			{ id: 'docs-slash', kind: SessionArtifactKind.Website, label: 'Docs Index', isArtifact: true, link: URI.parse('https://Example.com/docs/') },
			{ id: 'deep', kind: SessionArtifactKind.Website, label: 'Deep Link', isArtifact: true, link: URI.parse('https://example.com/docs/api') },
			{ id: 'blog', kind: SessionArtifactKind.Website, label: 'Blog', isArtifact: true, link: URI.parse('https://other.test/blog') },
			{ id: 'pr', kind: SessionArtifactKind.PullRequest, label: 'PR #12', isArtifact: true, link: pullRequestLink },
		];
		const labels = (browserUrls: readonly string[]) => buildSessionArtifactSections(artifacts, actions, labelService, true, new Set(browserUrls))
			.flatMap(section => section.entries)
			.map(entry => entry.label);

		assert.deepStrictEqual({
			withBrowsers: labels(['https://example.com/docs', pullRequestLink.toString()]),
			withoutBrowsers: labels([]),
		}, {
			withBrowsers: ['PR #12', 'Deep Link', 'Blog'],
			withoutBrowsers: ['PR #12', 'Docs', 'Docs Index', 'Deep Link', 'Blog'],
		});
	});

	test('omits recorded GitHub links from every repository surfaced in pull request and issue pills', () => {
		const { presentation } = createPresentation([
			{ id: 'created-pr', kind: SessionArtifactKind.PullRequest, label: 'Created', isArtifact: true, isGitHub: true, link: URI.parse('https://github.com/OWNER/REPO/pull/50/') },
			{ id: 'referenced-pr', kind: SessionArtifactKind.PullRequest, label: 'Referenced', isArtifact: false, isGitHub: true, link: URI.parse('https://github.com/owner/repo/pull/60') },
			{ id: 'referenced-promoted-pr', kind: SessionArtifactKind.PullRequest, label: 'Promoted', isArtifact: false, isGitHub: true, link: URI.parse('https://github.com/owner/repo/pull/50') },
			{ id: 'referenced-discovered-pr', kind: SessionArtifactKind.PullRequest, label: 'Discovered', isArtifact: false, isGitHub: true, link: URI.parse('https://github.com/owner/repo/pull/41') },
			{ id: 'created-issue', kind: SessionArtifactKind.Issue, label: 'Issue', isArtifact: true, isGitHub: true, link: URI.parse('https://github.com/owner/repo/issues/7') },
			{ id: 'referenced-issue', kind: SessionArtifactKind.Issue, label: 'Referenced issue', isArtifact: false, isGitHub: true, link: URI.parse('https://github.com/owner/repo/issues/8') },
			{ id: 'referenced-promoted-issue', kind: SessionArtifactKind.Issue, label: 'Promoted issue', isArtifact: false, isGitHub: true, link: URI.parse('https://github.com/OWNER/REPO/issues/7/') },
			{ id: 'foreign-pr', kind: SessionArtifactKind.PullRequest, label: 'Other repo', isArtifact: true, isGitHub: true, link: URI.parse('https://github.com/other/project/pull/9') },
			{ id: 'foreign-pr-reference', kind: SessionArtifactKind.PullRequest, label: 'Other repo reference', isArtifact: false, isGitHub: true, link: URI.parse('https://github.com/other/project/pull/10') },
			{ id: 'foreign-issue', kind: SessionArtifactKind.Issue, label: 'Other issue', isArtifact: true, isGitHub: true, link: URI.parse('https://github.com/other/project/issues/9') },
			{ id: 'gitlab-pr', kind: SessionArtifactKind.PullRequest, label: 'GitLab', isArtifact: true, isGitHub: false, link: URI.parse('https://gitlab.com/owner/repo/-/merge_requests/3') },
			{ id: 'file', kind: SessionArtifactKind.File, label: 'Plan', isArtifact: true, uri: URI.file('/repo/plan.md') },
		], {
			owner: 'owner',
			repo: 'repo',
			pullRequests: [50, 41].map(number => ({ owner: 'owner', repo: 'repo', number, uri: URI.parse(`https://github.com/owner/repo/pull/${number}`) })),
			issues: [{ owner: 'owner', repo: 'repo', number: 7, uri: URI.parse('https://github.com/owner/repo/issues/7') }],
		});

		assert.deepStrictEqual(visibleEntries(presentation), {
			artifacts: ['gitlab-pr', 'file'],
			references: [],
		});
	});

	test('retains non-GitHub and noncanonical entries even when their URLs are surfaced', () => {
		const pullRequest: ISessionArtifact = {
			id: 'pr', kind: SessionArtifactKind.PullRequest, label: 'PR', isArtifact: true, isGitHub: true,
			link: URI.parse('https://github.com/owner/repo/pull/12'),
		};
		const entries: readonly ISessionArtifact[] = [
			{ ...pullRequest, id: 'not-github', isGitHub: false },
			{ ...pullRequest, id: 'unclassified', isGitHub: undefined },
			{ ...pullRequest, id: 'website', kind: SessionArtifactKind.Website },
			{ ...pullRequest, id: 'enterprise-pr', link: URI.parse('https://github.example.com/owner/repo/pull/12') },
			{ ...pullRequest, id: 'www-pr', link: URI.parse('https://www.github.com/owner/repo/pull/12') },
			{ ...pullRequest, id: 'http-pr', link: URI.parse('http://github.com/owner/repo/pull/12') },
			{ ...pullRequest, id: 'uppercase-host-pr', link: URI.parse('https://GitHub.com/owner/repo/pull/12') },
			{ ...pullRequest, id: 'query-pr', link: URI.parse('https://github.com/owner/repo/pull/12?tab=files') },
			{ ...pullRequest, id: 'fragment-pr', link: URI.parse('https://github.com/owner/repo/pull/12#discussion') },
			{ ...pullRequest, id: 'invalid-pr', link: URI.parse('https://github.com/owner/repo/pull/not-a-number') },
			{ ...pullRequest, id: 'not-github-issue', kind: SessionArtifactKind.Issue, isGitHub: false, link: URI.parse('https://github.com/owner/repo/issues/12') },
			{ ...pullRequest, id: 'enterprise-issue', kind: SessionArtifactKind.Issue, link: URI.parse('https://github.example.com/owner/repo/issues/12') },
			{ ...pullRequest, id: 'invalid-issue', kind: SessionArtifactKind.Issue, link: URI.parse('https://github.com/owner/repo/issues/0') },
		];

		assert.deepStrictEqual(entries.map(artifact => {
			const { presentation } = createPresentation([artifact], {
				owner: 'owner',
				repo: 'repo',
				pullRequest: { number: 12, uri: artifact.link! },
				issues: [{ owner: 'owner', repo: 'repo', number: 12, uri: artifact.link! }],
			});
			return [artifact.id, visibleEntries(presentation).artifacts];
		}), entries.map(artifact => [artifact.id, [artifact.id]]));
	});

	test('keeps GitHub entries out of generic pills before, during and after workspace hydration', () => {
		const pullRequest = URI.parse('https://github.com/owner/repo/pull/50');
		const reference = URI.parse('https://github.com/owner/repo/pull/60');
		const issue = URI.parse('https://github.com/owner/repo/issues/7');
		const entries: readonly ISessionArtifact[] = [
			{ id: 'pr', kind: SessionArtifactKind.PullRequest, label: 'Created', isArtifact: true, isGitHub: true, link: pullRequest },
			{ id: 'duplicate-reference', kind: SessionArtifactKind.PullRequest, label: 'Duplicate', isArtifact: false, isGitHub: true, link: pullRequest },
			{ id: 'reference', kind: SessionArtifactKind.PullRequest, label: 'Reference', isArtifact: false, isGitHub: true, link: reference },
			{ id: 'issue', kind: SessionArtifactKind.Issue, label: 'Issue', isArtifact: true, isGitHub: true, link: issue },
		];
		const { presentation, session, artifacts, workspace, gitHubInfo } = createPresentation(entries);
		const mountedWorkspace = workspace.get();
		workspace.set(undefined, undefined);
		let visible = visibleEntries(presentation);
		disposables.add(autorun(reader => {
			visible = visibleEntries(presentation, reader);
		}));
		const withoutWorkspace = visible;

		workspace.set(mountedWorkspace, undefined);
		const withoutGitHubInfo = visible;
		const legacyInfo: IGitHubInfo = {
			owner: 'owner', repo: 'repo',
			pullRequest: { number: 50, uri: pullRequest },
			issues: [{ owner: 'owner', repo: 'repo', number: 7, uri: issue }],
		};
		gitHubInfo.set(legacyInfo, undefined);
		const hydrated = visible;

		gitHubInfo.set({
			...legacyInfo,
			pullRequests: [{ owner: 'owner', repo: 'repo', number: 60, uri: reference }],
			issues: undefined,
		}, undefined);
		const changedGitHubInfo = visible;

		artifacts.set([...entries, { id: 'file', kind: SessionArtifactKind.File, label: 'Plan', isArtifact: true, uri: URI.file('/repo/plan.md') }], undefined);
		const recordedFile = visible;
		workspace.set(undefined, undefined);
		const unmounted = visible;
		session.set(undefined, undefined);
		const noSession = visible;

		assert.deepStrictEqual({ withoutWorkspace, withoutGitHubInfo, hydrated, changedGitHubInfo, recordedFile, unmounted, noSession }, {
			withoutWorkspace: { artifacts: [], references: [] },
			withoutGitHubInfo: { artifacts: [], references: [] },
			hydrated: { artifacts: [], references: [] },
			changedGitHubInfo: { artifacts: [], references: [] },
			recordedFile: { artifacts: ['file'], references: [] },
			unmounted: { artifacts: ['file'], references: [] },
			noSession: { artifacts: [], references: [] },
		});
	});

	test('offers a copy link action for pull request and issue entries', () => {
		const copied: string[] = [];
		const pullRequestLink = URI.parse('https://github.com/microsoft/vscode/pull/12');
		const issueLink = URI.parse('https://github.com/microsoft/vscode/issues/34');
		const artifacts: readonly ISessionArtifact[] = [
			{ id: 'pr', kind: SessionArtifactKind.PullRequest, label: 'PR #12', isArtifact: true, link: pullRequestLink },
			{ id: 'issue', kind: SessionArtifactKind.Issue, label: 'Issue #34', isArtifact: true, link: issueLink },
			{ id: 'docs', kind: SessionArtifactKind.Website, label: 'Docs', isArtifact: true, link: URI.parse('https://example.com/docs') },
		];

		const entries = buildSessionArtifactSections(artifacts, { ...actions, copy: text => copied.push(text) }, labelService, true, new Set()).flatMap(section => section.entries);
		for (const entry of entries) {
			entry.toolbarActions?.forEach(action => action.run());
		}

		assert.deepStrictEqual({
			entries: entries.map(entry => [entry.label, entry.toolbarActions?.map(action => action.label) ?? []]),
			copied,
		}, {
			entries: [
				['PR #12', ['Copy Pull Request Link']],
				['Issue #34', ['Copy Issue Link']],
				['Docs', []],
			],
			copied: [pullRequestLink.toString(true), issueLink.toString(true)],
		});
	});

	test('removes references and durable artifacts by stable id, preserving duplicates', async () => {
		const duplicateLink = URI.parse('https://example.com/docs');
		const { presentation, artifacts, removed, errors, setRemovalError } = createPresentation([
			{ id: 'artifact', kind: SessionArtifactKind.Website, label: 'Durable', isArtifact: true, link: duplicateLink },
			{ id: 'reference-a', kind: SessionArtifactKind.Website, label: 'Docs', isArtifact: false, link: duplicateLink },
			{ id: 'reference-b', kind: SessionArtifactKind.Website, label: 'Docs', isArtifact: false, link: duplicateLink },
			{ id: 'issue', kind: SessionArtifactKind.Issue, label: 'Issue', isArtifact: false, link: URI.parse('https://github.com/microsoft/vscode/issues/1') },
		]);
		const read = () => ({
			sections: presentation.referenceSections.get().map(section => [section.title, section.entries.map(entry => entry.id)]),
			artifacts: presentation.sections.get().map(section => [section.title, section.entries.map(entry => entry.id)]),
		});
		const initial = read();
		const first = presentation.referenceSections.get().flatMap(section => section.entries).find(entry => entry.id === 'reference-a')!;
		await first.promotedAction?.run();
		const afterFirst = read();
		setRemovalError(new Error('offline'));
		await presentation.referenceSections.get().flatMap(section => section.entries).find(entry => entry.id === 'reference-b')?.promotedAction?.run();
		const afterFailure = read();
		setRemovalError(undefined);
		await presentation.referenceSections.get().flatMap(section => section.entries).find(entry => entry.id === 'issue')?.promotedAction?.run();
		const afterLastIssue = read();
		// Removing the durable artifact only deletes its session record; since it
		// was gated equally to references, this must succeed and empty its pill.
		await presentation.sections.get().flatMap(section => section.entries).find(entry => entry.id === 'artifact')?.promotedAction?.run();
		const afterArtifact = read();

		assert.deepStrictEqual({
			initial,
			afterFirst,
			afterFailure,
			afterLastIssue,
			afterArtifact,
			removed,
			errors,
			persisted: artifacts.get().map(artifact => artifact.id),
		}, {
			initial: { sections: [['Issues', ['issue']], ['Websites', ['reference-a', 'reference-b']]], artifacts: [['Websites', ['artifact']]] },
			afterFirst: { sections: [['Issues', ['issue']], ['Websites', ['reference-b']]], artifacts: [['Websites', ['artifact']]] },
			afterFailure: { sections: [['Issues', ['issue']], ['Websites', ['reference-b']]], artifacts: [['Websites', ['artifact']]] },
			afterLastIssue: { sections: [['Websites', ['reference-b']]], artifacts: [['Websites', ['artifact']]] },
			// The durable artifacts pill has nothing left to show once its only entry is removed.
			afterArtifact: { sections: [['Websites', ['reference-b']]], artifacts: [] },
			removed: ['reference-a', 'reference-b', 'issue', 'artifact'],
			errors: ['Could not remove Docs from this session: offline'],
			persisted: ['reference-b'],
		});
	});

	test('offers a remove action for every artifact and reference kind, gated purely on provider support', () => {
		const link = (path: string) => URI.parse(`https://example.com/${path}`);
		const entriesOf = (kind: SessionArtifactKind, isArtifact: boolean): ISessionArtifact => {
			switch (kind) {
				case SessionArtifactKind.PullRequest: return { id: `${kind}-${isArtifact}`, kind, label: 'PR', isArtifact, link: URI.parse('https://github.com/microsoft/vscode/pull/1') };
				case SessionArtifactKind.Issue: return { id: `${kind}-${isArtifact}`, kind, label: 'Issue', isArtifact, link: URI.parse('https://github.com/microsoft/vscode/issues/1') };
				case SessionArtifactKind.Commit: return { id: `${kind}-${isArtifact}`, kind, label: 'Commit', isArtifact, link: link('commit'), commitHash: 'abc123' };
				case SessionArtifactKind.Website: return { id: `${kind}-${isArtifact}`, kind, label: 'Site', isArtifact, link: link('site') };
				case SessionArtifactKind.File: return { id: `${kind}-${isArtifact}`, kind, label: 'File', isArtifact, uri: URI.file(`/repo/${isArtifact}.md`) };
				case SessionArtifactKind.Resource: return { id: `${kind}-${isArtifact}`, kind, label: 'Resource', isArtifact, uri: link('resource') };
			}
		};
		const kinds = [SessionArtifactKind.PullRequest, SessionArtifactKind.Issue, SessionArtifactKind.Commit, SessionArtifactKind.Website, SessionArtifactKind.File, SessionArtifactKind.Resource];
		const entries: ISessionArtifact[] = [];
		for (const kind of kinds) {
			entries.push(entriesOf(kind, true), entriesOf(kind, false));
		}
		// An image is a File artifact whose URI resolves to an image mime type.
		entries.push({ id: 'image-true', kind: SessionArtifactKind.File, label: 'Image', isArtifact: true, uri: URI.file('/repo/true.png') });
		entries.push({ id: 'image-false', kind: SessionArtifactKind.File, label: 'Image', isArtifact: false, uri: URI.file('/repo/false.png') });

		const withoutSupport = buildSessionArtifactSections(entries, actions, labelService, true, new Set()).flatMap(section => section.entries);
		const withSupport = buildSessionArtifactSections(entries, { ...actions, remove: async () => { } }, labelService, true, new Set()).flatMap(section => section.entries);

		const byId = (rendered: readonly { readonly id: string; readonly promotedAction?: unknown }[]) =>
			rendered.map(entry => [entry.id, !!entry.promotedAction]).sort((a, b) => String(a[0]).localeCompare(String(b[0])));
		// Expectations derive from the input entries, so a dropped or unrendered
		// kind fails instead of silently agreeing with whatever was produced.
		const expected = (removable: boolean) =>
			entries.map(entry => [entry.id, removable]).sort((a, b) => String(a[0]).localeCompare(String(b[0])));

		assert.deepStrictEqual({
			withoutSupport: byId(withoutSupport),
			withSupport: byId(withSupport),
		}, {
			// No entry of any kind — artifact or reference — gets a remove action without provider support.
			withoutSupport: expected(false),
			// Every kind gets a remove action once the provider supports it, regardless of isArtifact.
			withSupport: expected(true),
		});
	});

});
