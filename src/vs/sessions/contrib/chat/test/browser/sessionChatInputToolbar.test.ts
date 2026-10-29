/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { timeout } from '../../../../../base/common/async.js';
import { isManagedHoverTooltipHTMLElement } from '../../../../../base/browser/ui/hover/hover.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { ImmortalReference, toDisposable } from '../../../../../base/common/lifecycle.js';
import { autorun, constObservable, derived, observableValue } from '../../../../../base/common/observable.js';
import { SubmenuAction, type IAction } from '../../../../../base/common/actions.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { URI } from '../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IActionWidgetService } from '../../../../../platform/actionWidget/browser/actionWidget.js';
import { AgentHostAutoAttachPullRequestsConfigKey } from '../../../../../platform/agentHost/common/agentHostSchema.js';
import { CanvasesEnabledSettingId } from '../../../../../platform/agentHost/common/agentService.js';
import { RootConfigState } from '../../../../../platform/agentHost/common/state/protocol/state.js';
import { IClipboardService } from '../../../../../platform/clipboard/common/clipboardService.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IConfigurationChangeEvent, IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IOpenerService } from '../../../../../platform/opener/common/opener.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IContextMenuService, IContextViewService } from '../../../../../platform/contextview/browser/contextView.js';
import { ContextViewService } from '../../../../../platform/contextview/browser/contextViewService.js';
import { ILayoutService } from '../../../../../platform/layout/browser/layoutService.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { IEditorService } from '../../../../../workbench/services/editor/common/editorService.js';
import { Parts } from '../../../../../workbench/services/layout/browser/layoutService.js';
import { IChatEntitlementService } from '../../../../../workbench/services/chat/common/chatEntitlementService.js';
import { ArtifactIntegrationsSettingId, ArtifactSnapshot, IArtifactModel } from '../../../../../platform/artifactIntegrations/common/artifactIntegration.js';
import type { IChatPillEntry } from '../../../../../workbench/browser/chatPills.js';
import { IBrowserViewWorkbenchService } from '../../../../../workbench/contrib/browserView/common/browserView.js';
import type { BrowserEditorInput } from '../../../../../workbench/contrib/browserView/common/browserEditorInput.js';
import { IChatImageCarouselService } from '../../../../../workbench/contrib/chat/browser/chatImageCarouselService.js';
import { IChatService } from '../../../../../workbench/contrib/chat/common/chatService/chatService.js';
import { ISessionChatPillVisibilityService, SessionChatPillKind, SessionChatPillVisibility, type IChatBackgroundShell } from '../../../../../workbench/contrib/chat/common/sessionChatPills.js';
import { TestEditorInput, workbenchInstantiationService } from '../../../../../workbench/test/browser/workbenchTestServices.js';
import { EditorInput } from '../../../../../workbench/common/editor/editorInput.js';
import { WebviewInput } from '../../../../../workbench/contrib/webviewPanel/browser/webviewEditorInput.js';
import { IOverlayWebview } from '../../../../../workbench/contrib/webview/browser/webview.js';
import { ChatPillHoverCache } from '../../../../../workbench/browser/chatPillHover.js';
import { ChatDropdownPillActionViewItem } from '../../../../../workbench/browser/chatDropdownPill.js';
import { IWorkbenchGitHubService } from '../../../../../workbench/services/github/common/githubService.js';
import { IExternalUriOpener, IExternalUriOpenerService } from '../../../../../workbench/contrib/externalUriOpener/common/externalUriOpenerService.js';
import { IExtensionService } from '../../../../../workbench/services/extensions/common/extensions.js';
import { externalUriOpenersSettingId } from '../../../../../workbench/contrib/externalUriOpener/common/configuration.js';
import { IAgentWorkbenchLayoutService } from '../../../../browser/workbench.js';
import { IAgentHostSessionsProvider, LOCAL_AGENT_HOST_PROVIDER_ID, REMOTE_AGENT_HOST_PROVIDER_PREFIX } from '../../../../common/agentHostSessionsProvider.js';
import { ISessionsProvidersService } from '../../../../services/sessions/browser/sessionsProvidersService.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { ISessionChangesStatsCache } from '../../../../services/sessions/common/sessionChangesStatsCache.js';
import { BRANCH_CHANGES_CHANGESET_ID, ChatOriginKind, SESSION_CHANGES_CHANGESET_ID, SessionArtifactKind, SessionStatus, type IChat, type IGitHubIssueRef, type IGitHubPullRequestRef, type ISessionArtifact, type ISessionCanvas, type ISessionChangeset, type ISessionFileChange, type ISessionFolder, type ISessionGitRepository, type ISessionWorkspace } from '../../../../services/sessions/common/session.js';
import { IActiveSession, ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
import { REVEAL_CANVAS_COMMAND_ID } from '../../../../../workbench/contrib/canvases/common/canvas.js';
import { ISessionChangesEditorOptions, ISessionChangesService } from '../../../changes/common/sessionChangesService.js';
import { getGitHubHoverDate, getGitHubHoverDescription, getGitHubHoverTitle, getGitHubHoverTitleParts } from '../../../github/browser/githubHover.js';
import { createIssueHover } from '../../../github/browser/issueHover.js';
import { GitHubCIOverallStatus, GitHubIssueState, GitHubIssueStateReason, GitHubPullRequestState, OPEN_ISSUE_ACTION_ID, OPEN_PULL_REQUEST_ACTION_ID, OPEN_PULL_REQUEST_CHANGES_ACTION_ID, type IGitHubIssue, type IGitHubPullRequest } from '../../../github/common/types.js';
import type { IResolvedSessionPullRequest } from '../../../github/browser/pullRequestIconStatus.js';
import { IGitHubService } from '../../../github/browser/githubService.js';
import { GitHubPullRequestModel } from '../../../github/browser/models/githubPullRequestModel.js';
import { GitHubIssueModel } from '../../../github/browser/models/githubIssueModel.js';
import { buildSessionIssueSections, buildSessionPullRequestSections, computeSessionInputPillStats, readLoadedSessionInputPillStats, SessionChatInputToolbar } from '../../browser/sessionChatInputToolbar.js';
import { buildSessionArtifactSections, type ISessionArtifactActions } from '../../browser/sessionArtifacts.js';

suite('SessionChatInputToolbar', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createServices(artifactIntegrationsEnabled = false) {
		const instantiationService = workbenchInstantiationService(undefined, store);
		const configuration = new TestConfigurationService({ [ArtifactIntegrationsSettingId]: artifactIntegrationsEnabled });
		store.add(configuration.onDidChangeConfigurationEmitter);
		instantiationService.stub(IConfigurationService, configuration);
		instantiationService.stub(IChatService, upcastPartial<IChatService>({
			chatModels: constObservable([]),
		}));
		instantiationService.stub(IChatImageCarouselService, upcastPartial<IChatImageCarouselService>({}));
		instantiationService.stub(IWorkbenchGitHubService, upcastPartial<IWorkbenchGitHubService>({
			onDidChangeDefaultClient: Event.None,
		}));
		instantiationService.stub(IBrowserViewWorkbenchService, upcastPartial<IBrowserViewWorkbenchService>({
			onDidChangeBrowserViews: Event.None,
			getKnownBrowserViews: () => new Map(),
		}));
		const visibility = store.add(instantiationService.createInstance(SessionChatPillVisibility));
		instantiationService.stub(ISessionChatPillVisibilityService, visibility);
		instantiationService.stub(ISessionChangesStatsCache, upcastPartial<ISessionChangesStatsCache>({ get: () => undefined }));
		instantiationService.stub(ISessionsProvidersService, upcastPartial<ISessionsProvidersService>({ getProvider: () => undefined }));
		instantiationService.stub(ISessionsManagementService, upcastPartial<ISessionsManagementService>({}));
		instantiationService.stub(IExternalUriOpenerService, upcastPartial<IExternalUriOpenerService>({
			getOpener: async () => upcastPartial<IExternalUriOpener>({ id: 'test-opener' }),
		}));
		instantiationService.stub(ISessionsService, upcastPartial<ISessionsService>({
			visibleSessions: constObservable([]),
			activeSession: constObservable(undefined),
		}));
		instantiationService.stub(IAgentWorkbenchLayoutService, upcastPartial<IAgentWorkbenchLayoutService>({
			onDidChangePartVisibility: Event.None,
			onDidToggleSidePane: Event.None,
			isSidePaneVisible: () => false,
			isEditorPaneVisible: () => false,
			isVisible: () => false,
		}));
		return { instantiationService, visibility, configuration };
	}

	async function createGitHubActivityBar(kind: SessionArtifactKind.PullRequest | SessionArtifactKind.Issue, providerId: string, getOpener?: IExternalUriOpenerService['getOpener']) {
		const services = createServices();
		const { instantiationService } = services;
		const extensionsChanged = store.add(new Emitter<{ added: []; removed: [] }>());
		instantiationService.stub(IExtensionService, 'onDidChangeExtensions', extensionsChanged.event);
		if (getOpener) {
			instantiationService.stub(IExternalUriOpenerService, 'getOpener', getOpener);
		}
		const sentiment = observableValue('sentiment', { hidden: false });
		instantiationService.stub(IChatEntitlementService, {
			sentimentObs: sentiment,
			get sentiment() { return sentiment.get(); },
		});
		const main = upcastPartial<IChat>({ resource: URI.parse('chat:main'), title: constObservable('Main'), status: constObservable(SessionStatus.Completed) });
		const peer = upcastPartial<IChat>({ resource: URI.parse('chat:peer'), title: constObservable('Peer'), status: constObservable(SessionStatus.Completed) });
		const artifact = (number: number, chat: IChat, isArtifact = true): ISessionArtifact => ({
			id: `artifact-${number}`, kind, label: `Item ${number}`, isArtifact, isGitHub: true, chat: chat.resource,
			link: URI.parse(`https://github.com/owner/repo/${kind === SessionArtifactKind.PullRequest ? 'pull' : 'issues'}/${number}`),
		});
		const artifacts = observableValue<readonly ISessionArtifact[]>('artifacts', [artifact(1, main), artifact(2, peer), artifact(3, main, false)]);
		const session = upcastPartial<IActiveSession>({
			providerId, sessionId: 'session', resource: URI.parse('session:1'), artifacts,
			loading: constObservable(false), capabilities: constObservable({ supportsMultipleChats: true }),
			chats: constObservable([main, peer]), mainChat: constObservable(main), workspace: constObservable(undefined),
		});
		const pullRequest = observableValue<IGitHubPullRequest | undefined>('pull request', undefined);
		instantiationService.stub(IGitHubService, upcastPartial<IGitHubService>({
			createPullRequestModelReference: () => new ImmortalReference(upcastPartial<GitHubPullRequestModel>({ pullRequest })),
			createIssueModelReference: () => new ImmortalReference(upcastPartial<GitHubIssueModel>({
				issue: constObservable(undefined), refresh: async () => { }, startPolling: () => toDisposable(() => { }),
			})),
		}));
		const opened: { command: string; number: number | undefined }[] = [];
		let editor: EditorInput | undefined;
		let editors: { editor: EditorInput; groupId: number }[] = [];
		const revealed: { editor: EditorInput; groupId: number | undefined }[] = [];
		let paneVisible = false;
		let detailVisible = false;
		const stateChanged = store.add(new Emitter<void>());
		instantiationService.stub(IEditorService, upcastPartial<IEditorService>({
			onDidActiveEditorChange: stateChanged.event,
			get activeEditor() { return editor; },
			getEditors: () => editors,
		}));
		instantiationService.stub(IEditorService, 'openEditor', async (input: EditorInput, _options: object, groupId?: number) => {
			revealed.push({ editor: input, groupId });
			editor = input;
			stateChanged.fire();
			return undefined;
		});
		instantiationService.stub(IAgentWorkbenchLayoutService, upcastPartial<IAgentWorkbenchLayoutService>({
			onDidChangePartVisibility: Event.map(stateChanged.event, () => ({ partId: 'workbench.parts.editor', visible: paneVisible })),
			isSidePaneVisible: () => paneVisible || detailVisible,
			isEditorPaneVisible: () => paneVisible || detailVisible,
			isVisible: part => part === Parts.EDITOR_PART ? paneVisible : detailVisible,
			hideSidePane: () => { paneVisible = false; detailVisible = false; stateChanged.fire(); },
			revealEditorPartExplicitly: () => { paneVisible = true; stateChanged.fire(); },
		}));
		instantiationService.stub(ISessionsService, 'setActive', (target: IActiveSession) => assert.strictEqual(target, session));
		instantiationService.stub(ICommandService, upcastPartial<ICommandService>({
			executeCommand: async (command, context: { pullRequest?: IGitHubPullRequestRef; issue?: IGitHubIssueRef }) => {
				opened.push({ command, number: (context.pullRequest ?? context.issue)?.number });
				return undefined;
			},
		}));
		const toolbar = store.add(instantiationService.createInstance(SessionChatInputToolbar, false, undefined));
		toolbar.setSession(session, main);
		store.add(autorun(reader => toolbar.activityBarActions.read(reader)));
		await timeout(0);
		return {
			...services, toolbar, session, main, peer, artifacts, artifact, opened, revealed, sentiment, pullRequest, extensionsChanged,
			setEditor: (input: EditorInput | undefined) => {
				editor = input;
				if (input && !editors.some(entry => entry.editor === input)) {
					editors.unshift({ editor: input, groupId: 1 });
				}
				stateChanged.fire();
			},
			setPaneVisible: (visible: boolean) => { paneVisible = visible; stateChanged.fire(); },
			setDetailVisible: (visible: boolean) => { detailVisible = visible; stateChanged.fire(); },
			setEditors: (inputs: { editor: EditorInput; groupId: number }[]) => { editors = inputs; },
		};
	}

	test('activity bar retains PR availability without repeating opener checks on metadata refresh', async () => {
		let lookups = 0;
		const { toolbar, artifacts } = await createGitHubActivityBar(SessionArtifactKind.PullRequest, LOCAL_AGENT_HOST_PROVIDER_ID, async () => {
			lookups++;
			return upcastPartial<IExternalUriOpener>({ id: 'supported' });
		});
		const before = lookups;
		const counts: number[] = [];
		for (let i = 0; i < 10; i++) {
			artifacts.set(artifacts.get().map(entry => ({ ...entry, label: `Updated title ${i}` })), undefined);
			counts.push(toolbar.activityBarActions.get().length);
			await timeout(0);
		}
		assert.deepStrictEqual({ counts, lookups: lookups - before }, { counts: Array(10).fill(1), lookups: 0 });
	});

	test('activity bar retains supported PRs while opener revalidation is pending', async () => {
		const { toolbar, instantiationService, extensionsChanged } = await createGitHubActivityBar(SessionArtifactKind.PullRequest, LOCAL_AGENT_HOST_PROVIDER_ID);
		let complete!: (value: IExternalUriOpener | undefined) => void;
		instantiationService.stub(IExternalUriOpenerService, 'getOpener', () => new Promise<IExternalUriOpener | undefined>(resolve => { complete = resolve; }));
		extensionsChanged.fire({ added: [], removed: [] });
		const pending = toolbar.activityBarActions.get().length;
		complete(undefined);
		await timeout(0);
		assert.deepStrictEqual({ pending, unsupported: toolbar.activityBarActions.get().length }, { pending: 1, unsupported: 0 });
	});

	test('activity bar does not reuse opener support for a changed URL with the same artifact id', async () => {
		let complete!: (value: IExternalUriOpener | undefined) => void;
		const { toolbar, artifacts, instantiationService } = await createGitHubActivityBar(SessionArtifactKind.PullRequest, LOCAL_AGENT_HOST_PROVIDER_ID);
		instantiationService.stub(IExternalUriOpenerService, 'getOpener', () => new Promise<IExternalUriOpener | undefined>(resolve => { complete = resolve; }));
		artifacts.set(artifacts.get().map(entry => ({ ...entry, link: URI.parse('https://github.com/owner/repo/pull/99') })), undefined);
		const pending = toolbar.activityBarActions.get().length;
		complete(undefined);
		await timeout(0);
		assert.deepStrictEqual({ pending, unsupported: toolbar.activityBarActions.get().length }, { pending: 0, unsupported: 0 });
	});

	test('activity bar omits Issue actions and opener checks without removing composer pills', async () => {
		let lookups = 0;
		const { toolbar } = await createGitHubActivityBar(SessionArtifactKind.Issue, LOCAL_AGENT_HOST_PROVIDER_ID, async () => {
			lookups++;
			return upcastPartial<IExternalUriOpener>({ id: 'supported' });
		});
		assert.deepStrictEqual({
			actions: toolbar.activityBarActions.get().length, lookups,
			pill: toolbar.element.querySelector('.chat-dropdown-pill-button')?.getAttribute('aria-label'),
		}, { actions: 0, lookups: 0, pill: 'Open Issue #1: Item 1' });
	});

	for (const kind of [SessionArtifactKind.PullRequest] as const) {
		test(`activity bar reveals a hidden ${kind} editor instead of toggling the Detail-only pane`, async () => {
			const { toolbar, setEditor, setDetailVisible, artifact, main, opened } = await createGitHubActivityBar(kind, LOCAL_AGENT_HOST_PROVIDER_ID);
			setEditor(store.add(new TestEditorInput(artifact(1, main).link!, 'test.githubEditor')));
			setDetailVisible(true);
			const before = toolbar.activityBarActions.get()[0].checked;
			await toolbar.activityBarActions.get()[0].run();
			assert.deepStrictEqual({ before, after: toolbar.activityBarActions.get()[0].checked, opened }, { before: false, after: true, opened: [] });
		});

		test(`activity bar toggles ${kind} editors on repeated activation`, async () => {
			const { toolbar, setEditor, setPaneVisible, artifact, main, opened } = await createGitHubActivityBar(kind, LOCAL_AGENT_HOST_PROVIDER_ID);
			const editor = store.add(new TestEditorInput(artifact(1, main).link!, 'test.githubEditor'));
			const states = [toolbar.activityBarActions.get()[0].checked];
			setEditor(editor);
			setPaneVisible(true);
			states.push(toolbar.activityBarActions.get()[0].checked);
			await toolbar.activityBarActions.get()[0].run();
			states.push(toolbar.activityBarActions.get()[0].checked);
			await toolbar.activityBarActions.get()[0].run();
			states.push(toolbar.activityBarActions.get()[0].checked);
			setEditor(undefined);
			states.push(toolbar.activityBarActions.get()[0].checked);
			assert.deepStrictEqual({ states, opened }, { states: [false, true, false, true, false], opened: [] });
		});

		test(`activity bar reveals restored inactive ${kind} overview webviews instead of opening a reference`, async () => {
			const { instantiationService, toolbar, setEditors, setPaneVisible, opened, revealed } = await createGitHubActivityBar(kind, LOCAL_AGENT_HOST_PROVIDER_ID);
			const viewType = kind === SessionArtifactKind.PullRequest ? 'PullRequestOverview' : 'IssueOverview';
			const editor = store.add(instantiationService.createInstance(WebviewInput, {
				viewType: `mainThreadWebview-${viewType}`, providedId: viewType, name: 'Restored overview', iconPath: undefined,
			}, upcastPartial<IOverlayWebview>({ dispose: () => { } })));
			setEditors([{ editor, groupId: 7 }]);
			setPaneVisible(true);
			const checked = toolbar.activityBarActions.get()[0].checked;
			await toolbar.activityBarActions.get()[0].run();
			assert.deepStrictEqual({ checked, afterOpen: toolbar.activityBarActions.get()[0].checked, opened, revealed }, { checked: false, afterOpen: true, opened: [], revealed: [{ editor, groupId: 7 }] });
		});

		test(`activity bar prefers the active ${kind} editor over other open editors`, async () => {
			const { toolbar, setEditor, setEditors, artifacts, artifact, main, opened, revealed } = await createGitHubActivityBar(kind, LOCAL_AGENT_HOST_PROVIDER_ID);
			artifacts.set([...artifacts.get(), artifact(4, main)], undefined);
			await timeout(0);
			const first = store.add(new TestEditorInput(artifact(1, main).link!, 'test.githubEditor'));
			const active = store.add(new TestEditorInput(artifact(4, main).link!, 'test.githubEditor'));
			setEditors([{ editor: first, groupId: 2 }, { editor: active, groupId: 3 }]);
			setEditor(active);
			await toolbar.activityBarActions.get()[0].run();
			assert.deepStrictEqual({ opened, revealed }, { opened: [], revealed: [{ editor: active, groupId: 3 }] });
		});

		test(`activity bar skips disposed and unrelated ${kind} editors`, async () => {
			const { toolbar, setEditors, artifact, main, opened, revealed } = await createGitHubActivityBar(kind, LOCAL_AGENT_HOST_PROVIDER_ID);
			const disposed = new TestEditorInput(artifact(1, main).link!, 'test.githubEditor');
			disposed.dispose();
			const unrelated = store.add(new TestEditorInput(URI.parse('file:///unrelated.txt'), 'test.fileEditor'));
			setEditors([{ editor: disposed, groupId: 2 }, { editor: unrelated, groupId: 3 }]);
			await toolbar.activityBarActions.get()[0].run();
			assert.deepStrictEqual({ opened: opened.map(entry => entry.number), revealed }, { opened: [1], revealed: [] });
		});
	}

	for (const kind of [SessionArtifactKind.PullRequest] as const) {
		test(`activity bar shows supported ${kind} actions by default without changing composer pills`, async () => {
			let lookups = 0;
			const { toolbar } = await createGitHubActivityBar(kind, LOCAL_AGENT_HOST_PROVIDER_ID,
				async () => {
					lookups++;
					return upcastPartial<IExternalUriOpener>({ id: 'supported' });
				});
			assert.deepStrictEqual({
				actions: toolbar.activityBarActions.get().length, lookups,
				pill: toolbar.element.querySelector('.chat-dropdown-pill-button')?.getAttribute('aria-label'),
			}, {
				actions: 1, lookups: 1, pill: 'Open Pull Request #1: Item 1',
			});
		});
	}

	for (const kind of [SessionArtifactKind.PullRequest] as const) {
		test(`activity bar hides ${kind} without a contributed opener and preserves its composer pill`, async () => {
			const { toolbar } = await createGitHubActivityBar(kind, LOCAL_AGENT_HOST_PROVIDER_ID, async () => undefined);
			assert.deepStrictEqual({
				activityActions: toolbar.activityBarActions.get().length,
				composerLabel: toolbar.element.querySelector('.chat-dropdown-pill-button')?.getAttribute('aria-label'),
			}, {
				activityActions: 0,
				composerLabel: `Open ${kind === SessionArtifactKind.PullRequest ? 'Pull Request' : 'Issue'} #1: Item 1`,
			});
		});

		test(`activity bar opens the first opener-supported ${kind} without a picker`, async () => {
			const { toolbar, artifacts, artifact, main, opened } = await createGitHubActivityBar(kind, LOCAL_AGENT_HOST_PROVIDER_ID,
				async uri => uri.path.endsWith('/1') ? undefined : upcastPartial<IExternalUriOpener>({ id: 'supported' }));
			artifacts.set([...artifacts.get(), artifact(4, main), artifact(5, main)], undefined);
			await timeout(0);
			await toolbar.activityBarActions.get()[0].run();
			assert.deepStrictEqual({
				label: toolbar.activityBarActions.get()[0].label,
				opened: opened.map(entry => entry.number),
			}, { label: `Open ${kind === SessionArtifactKind.PullRequest ? 'Pull Request' : 'Issue'} (2)`, opened: [4] });
		});
	}

	test('activity bar refreshes opener support after extension and opener-configuration changes', async () => {
		let available = false;
		const { toolbar, extensionsChanged, configuration, opened } = await createGitHubActivityBar(SessionArtifactKind.PullRequest, LOCAL_AGENT_HOST_PROVIDER_ID,
			async () => available ? upcastPartial<IExternalUriOpener>({ id: 'supported' }) : undefined);
		const absent = toolbar.activityBarActions.get().length;
		available = true;
		extensionsChanged.fire({ added: [], removed: [] });
		await timeout(0);
		const added = toolbar.activityBarActions.get().length;
		const stale = toolbar.activityBarActions.get()[0];
		available = false;
		configuration.onDidChangeConfigurationEmitter.fire(upcastPartial<IConfigurationChangeEvent>({
			affectsConfiguration: key => key === externalUriOpenersSettingId,
		}));
		await timeout(0);
		await stale.run();
		assert.deepStrictEqual({ absent, added, removed: toolbar.activityBarActions.get().length, opened }, { absent: 0, added: 1, removed: 0, opened: [] });
	});

	test('activity bar logs opener lookup failures and hides unsupported actions', async () => {
		const { toolbar, instantiationService, extensionsChanged } = await createGitHubActivityBar(SessionArtifactKind.PullRequest, LOCAL_AGENT_HOST_PROVIDER_ID);
		const error = new Error('Opener lookup failed');
		const errors: Error[] = [];
		instantiationService.stub(ILogService, 'error', (_message: string, reported: Error) => errors.push(reported));
		instantiationService.stub(IExternalUriOpenerService, 'getOpener', async () => { throw error; });
		extensionsChanged.fire({ added: [], removed: [] });
		await timeout(0);
		assert.deepStrictEqual({ errors, actions: toolbar.activityBarActions.get().length }, { errors: [error], actions: 0 });
	});

	test('activity bar cancels pending opener checks on chat switches and disposal', async () => {
		const pending: { token: CancellationToken; resolve: (opener: IExternalUriOpener) => void }[] = [];
		const { toolbar, session, peer } = await createGitHubActivityBar(SessionArtifactKind.PullRequest, LOCAL_AGENT_HOST_PROVIDER_ID,
			(_uri, _context, token) => new Promise(resolve => pending.push({ token, resolve })));
		const before = toolbar.activityBarActions.get().length;
		toolbar.setSession(session, peer);
		const old = pending[0];
		old.resolve(upcastPartial<IExternalUriOpener>({ id: 'old-chat' }));
		await timeout(0);
		const afterSwitch = toolbar.activityBarActions.get().length;
		toolbar.dispose();
		pending[1].resolve(upcastPartial<IExternalUriOpener>({ id: 'disposed' }));
		await timeout(0);
		assert.deepStrictEqual({ before, afterSwitch, cancelled: pending.map(check => check.token.isCancellationRequested) }, {
			before: 0, afterSwitch: 0, cancelled: [true, true],
		});
	});

	test('hiding AI features cancels pending checks and ignores late results', async () => {
		const pending: { token: CancellationToken; resolve: (opener: IExternalUriOpener) => void }[] = [];
		const { toolbar, sentiment } = await createGitHubActivityBar(SessionArtifactKind.PullRequest, LOCAL_AGENT_HOST_PROVIDER_ID,
			(_uri, _context, token) => new Promise(resolve => pending.push({ token, resolve })));
		sentiment.set({ hidden: true }, undefined);
		pending[0].resolve(upcastPartial<IExternalUriOpener>({ id: 'late' }));
		await timeout(0);
		assert.deepStrictEqual({
			actions: toolbar.activityBarActions.get().length, checks: pending.length, cancelled: pending[0].token.isCancellationRequested,
		}, { actions: 0, checks: 1, cancelled: true });
	});

	test('activity bar follows PR state filtering without changing independent pill visibility', async () => {
		const { toolbar, visibility, pullRequest } = await createGitHubActivityBar(SessionArtifactKind.PullRequest, LOCAL_AGENT_HOST_PROVIDER_ID);
		const all = toolbar.activityBarActions.get().length;
		pullRequest.set(upcastPartial<IGitHubPullRequest>({ state: GitHubPullRequestState.Closed, isDraft: false }), undefined);
		visibility.pullRequests.setShowAll(false);
		const filtered = toolbar.activityBarActions.get().length;
		visibility.pullRequests.setShowAll(true);
		const restored = toolbar.activityBarActions.get().length;
		visibility.hide(SessionChatPillKind.PullRequests);
		const independentlyVisible = toolbar.activityBarActions.get().length;
		assert.deepStrictEqual({ all, filtered, restored, independentlyVisible }, { all: 1, filtered: 0, restored: 1, independentlyVisible: 1 });
	});

	test('activity bar removes AI-hidden actions and rejects stale invocations after hiding or disposal', async () => {
		const { toolbar, sentiment, opened } = await createGitHubActivityBar(SessionArtifactKind.PullRequest, LOCAL_AGENT_HOST_PROVIDER_ID);
		const action = toolbar.activityBarActions.get()[0];
		sentiment.set({ hidden: true }, undefined);
		const hidden = toolbar.activityBarActions.get().length;
		await action.run();
		sentiment.set({ hidden: false }, undefined);
		await timeout(0);
		const restored = toolbar.activityBarActions.get().length;
		toolbar.dispose();
		await action.run();
		assert.deepStrictEqual({ hidden, restored, opened }, { hidden: 0, restored: 1, opened: [] });
	});

	for (const providerId of [LOCAL_AGENT_HOST_PROVIDER_ID, `${REMOTE_AGENT_HOST_PROVIDER_PREFIX}test-host`]) {
		for (const kind of [SessionArtifactKind.PullRequest] as const) {
			test(`activity bar opens the single ${kind} of its own chat on ${providerId}`, async () => {
				const { toolbar, session, main, peer, artifacts, opened } = await createGitHubActivityBar(kind, providerId);
				const first = toolbar.activityBarActions.get()[0];
				await first.run();
				toolbar.setSession(session, peer);
				await first.run();
				await timeout(0);
				await toolbar.activityBarActions.get()[0].run();
				const peerLabel = toolbar.activityBarActions.get()[0].label;
				toolbar.setSession(session, { ...peer, origin: { kind: ChatOriginKind.Tool, parentChat: main.resource } });
				const toolChat = toolbar.activityBarActions.get().length;
				toolbar.setSession(session, main);
				artifacts.set([], undefined);

				assert.deepStrictEqual({
					opened, peerLabel, toolChat, afterRemoval: toolbar.activityBarActions.get().length,
				}, {
					opened: [1, 2].map(number => ({ command: kind === SessionArtifactKind.PullRequest ? OPEN_PULL_REQUEST_ACTION_ID : OPEN_ISSUE_ACTION_ID, number })),
					peerLabel: `Open ${kind === SessionArtifactKind.PullRequest ? 'Pull Request' : 'Issue'} #2: Item 2`,
					toolChat: 0, afterRemoval: 0,
				});
			});

			test(`activity bar opens the first of multiple current-chat ${kind} entries on ${providerId}`, async () => {
				const { toolbar, artifacts, artifact, main, opened } = await createGitHubActivityBar(kind, providerId);
				artifacts.set([...artifacts.get(), artifact(4, main)], undefined);
				await timeout(0);
				await toolbar.activityBarActions.get()[0].run();

				assert.deepStrictEqual({
					label: toolbar.activityBarActions.get()[0].label,
					opened,
				}, {
					label: `Open ${kind === SessionArtifactKind.PullRequest ? 'Pull Request' : 'Issue'} (2)`,
					opened: [{ command: kind === SessionArtifactKind.PullRequest ? OPEN_PULL_REQUEST_ACTION_ID : OPEN_ISSUE_ACTION_ID, number: 1 }],
				});
			});
		}
	}

	for (const transition of ['switch', 'dispose', 'remove', 'remove-one', 'hide', 'opener'] as const) {
		test(`activity bar resolves current references after ${transition}`, async () => {
			let openerAvailable = true;
			const { toolbar, session, peer, artifacts, artifact, main, opened, sentiment, extensionsChanged } = await createGitHubActivityBar(
				SessionArtifactKind.PullRequest, LOCAL_AGENT_HOST_PROVIDER_ID,
				async () => openerAvailable ? upcastPartial<IExternalUriOpener>({ id: 'test-opener' }) : undefined,
			);
			artifacts.set([...artifacts.get(), artifact(4, main)], undefined);
			await timeout(0);
			const selected = toolbar.activityBarActions.get()[0];
			if (transition === 'switch') {
				toolbar.setSession(session, peer);
			} else if (transition === 'dispose') {
				toolbar.dispose();
			} else if (transition === 'remove') {
				artifacts.set([], undefined);
			} else if (transition === 'remove-one') {
				artifacts.set(artifacts.get().filter(entry => entry.id !== 'artifact-1'), undefined);
				await timeout(0);
			} else if (transition === 'hide') {
				sentiment.set({ hidden: true }, undefined);
			} else if (transition === 'opener') {
				openerAvailable = false;
				extensionsChanged.fire({ added: [], removed: [] });
				await timeout(0);
			}
			await selected.run();
			assert.deepStrictEqual(opened.map(entry => entry.number), transition === 'remove-one' ? [4] : []);
		});
	}

	test('keeps copied feedback stable across section refreshes', async () => {
		const { instantiationService } = createServices();
		const toolbar = store.add(instantiationService.createInstance(SessionChatInputToolbar, false, undefined));
		const cache = Reflect.get(toolbar, '_issueCopyActions') as {
			get(key: string, label: string, copy: () => Promise<void>): IAction;
			retain(keys: ReadonlySet<string>): void;
		};
		const copied: string[] = [];
		const key = 'microsoft/vscode/42';
		const first = cache.get(key, 'Copy issue URL', async () => { copied.push('first'); });

		await first.run();
		cache.retain(new Set([key]));
		const refreshed = cache.get(key, 'Copy issue URL', async () => { copied.push('refreshed'); });
		await refreshed.run();

		assert.deepStrictEqual({
			sameAction: first === refreshed,
			label: refreshed.label,
			class: refreshed.class,
			copied,
		}, {
			sameAction: true,
			label: 'Copied',
			class: ThemeIcon.asClassName(Codicon.check),
			copied: ['first', 'refreshed'],
		});
	});

	test('uses the active chat projection rather than cached session stats', () => {
		const chat = upcastPartial<IChat>({
			workspace: constObservable(upcastPartial<ISessionWorkspace>({ folders: [] })),
			changesets: constObservable([]),
			changes: constObservable([{
				modifiedUri: URI.file('/chat-change.ts'),
				insertions: 10,
				deletions: 4,
			}]),
		});
		const session = upcastPartial<IActiveSession>({
			loading: constObservable(false),
			sessionId: 'provider:session',
			workspace: constObservable(upcastPartial<ISessionWorkspace>({ folders: [] })),
			activeChat: constObservable(chat),
		});
		const stats = derived(reader => computeSessionInputPillStats(session, chat, reader));
		const pendingSession = upcastPartial<IActiveSession>({
			...session,
			worktreePending: constObservable(true),
		});
		const pendingStats = derived(reader => computeSessionInputPillStats(pendingSession, chat, reader));

		assert.deepStrictEqual({
			session: stats.get(),
			pendingWorktree: pendingStats.get(),
		}, {
			session: {
				files: 1,
				insertions: 10,
				deletions: 4,
			},
			pendingWorktree: {
				files: 0,
				insertions: 0,
				deletions: 0,
			},
		});
	});

	test('uses Session Changes for folders and Branch Changes for worktrees', () => {
		const createWorkspace = (worktree: boolean) => upcastPartial<ISessionWorkspace>({
			folders: [upcastPartial<ISessionFolder>({
				gitRepository: upcastPartial<ISessionGitRepository>({
					workTreeUri: worktree ? URI.file('/worktree') : undefined,
				}),
			})],
		});
		const workspace = observableValue('workspace', createWorkspace(false));
		const chat = upcastPartial<IChat>({
			workspace,
			changesets: constObservable([
				upcastPartial<ISessionChangeset>({
					id: BRANCH_CHANGES_CHANGESET_ID,
					isDefault: constObservable(true),
					changes: constObservable([]),
				}),
				upcastPartial<ISessionChangeset>({
					id: SESSION_CHANGES_CHANGESET_ID,
					isDefault: constObservable(false),
					changes: constObservable([{
						modifiedUri: URI.file('/chat-change.ts'),
						insertions: 10,
						deletions: 4,
					}]),
				}),
			]),
			changes: constObservable([]),
		});
		const session = upcastPartial<IActiveSession>({
			loading: constObservable(false),
			sessionId: 'provider:session',
			workspace,
			activeChat: constObservable(chat),
		});
		const stats = derived(reader => computeSessionInputPillStats(session, chat, reader));
		const folderStats = stats.get();
		workspace.set(createWorkspace(true), undefined);

		assert.deepStrictEqual({
			folder: folderStats,
			worktree: stats.get(),
		}, {
			folder: { files: 1, insertions: 10, deletions: 4 },
			worktree: { files: 0, insertions: 0, deletions: 0 },
		});
	});

	test('uses Session Changes for nested chats even in worktrees', () => {
		const workspace = constObservable(upcastPartial<ISessionWorkspace>({
			folders: [upcastPartial<ISessionFolder>({
				gitRepository: upcastPartial<ISessionGitRepository>({ workTreeUri: URI.file('/worktree') }),
			})],
		}));
		const createChat = (resource: string) => upcastPartial<IChat>({
			resource: URI.parse(resource),
			workspace,
			changesets: constObservable([
				upcastPartial<ISessionChangeset>({
					id: BRANCH_CHANGES_CHANGESET_ID,
					isDefault: constObservable(true),
					changes: constObservable([]),
				}),
				upcastPartial<ISessionChangeset>({
					id: SESSION_CHANGES_CHANGESET_ID,
					isDefault: constObservable(false),
					changes: constObservable([{
						modifiedUri: URI.file('/chat-change.ts'),
						insertions: 10,
						deletions: 4,
					}]),
				}),
			]),
			changes: constObservable([]),
		});
		const mainChat = createChat('chat:main');
		const nestedChat = createChat('chat:nested');
		const session = upcastPartial<IActiveSession>({
			loading: constObservable(false),
			sessionId: 'provider:session',
			workspace,
			mainChat: constObservable(mainChat),
		});
		const stats = (chat: IChat) => derived(reader => computeSessionInputPillStats(session, chat, reader)).get();

		assert.deepStrictEqual({ main: stats(mainChat), nested: stats(nestedChat) }, {
			main: { files: 0, insertions: 0, deletions: 0 },
			nested: { files: 1, insertions: 10, deletions: 4 },
		});
	});

	test('uses Session Changes in cloud sandboxes without changing other worktree sessions', () => {
		const workspace = constObservable(upcastPartial<ISessionWorkspace>({
			folders: [upcastPartial<ISessionFolder>({
				gitRepository: upcastPartial<ISessionGitRepository>({ workTreeUri: URI.file('/worktree') }),
			})],
		}));
		const chat = upcastPartial<IChat>({
			resource: URI.parse('chat:main'),
			workspace,
			changesets: constObservable([
				upcastPartial<ISessionChangeset>({
					id: BRANCH_CHANGES_CHANGESET_ID,
					isDefault: constObservable(false),
					changes: constObservable([]),
				}),
				upcastPartial<ISessionChangeset>({
					id: SESSION_CHANGES_CHANGESET_ID,
					isDefault: constObservable(true),
					changes: constObservable([{
						modifiedUri: URI.file('/chat-change.ts'),
						insertions: 3,
						deletions: 0,
					}]),
				}),
			]),
			changes: constObservable([]),
		});
		const scenarios = [
			{ environment: 'cloud', providerId: `${REMOTE_AGENT_HOST_PROVIDER_PREFIX}cloudsandbox__environment` },
			{ environment: 'cloud', providerId: 'copilot-cloud' },
			{ environment: 'local', providerId: LOCAL_AGENT_HOST_PROVIDER_ID },
			{ environment: 'remote', providerId: `${REMOTE_AGENT_HOST_PROVIDER_PREFIX}ssh__host` },
			{ environment: 'remote', providerId: `${REMOTE_AGENT_HOST_PROVIDER_PREFIX}tunnel__host` },
		];
		const stats = scenarios.map(identity => {
			const session = upcastPartial<IActiveSession>({
				...identity,
				mainChat: constObservable(chat),
			});
			return derived(reader => computeSessionInputPillStats(session, chat, reader)).get();
		});

		assert.deepStrictEqual(stats, [
			{ files: 1, insertions: 3, deletions: 0 },
			{ files: 0, insertions: 0, deletions: 0 },
			{ files: 0, insertions: 0, deletions: 0 },
			{ files: 0, insertions: 0, deletions: 0 },
			{ files: 0, insertions: 0, deletions: 0 },
		]);
	});

	test('uses cached session stats while chat changes are unresolved', () => {
		const chat = upcastPartial<IChat>({
			workspace: constObservable(upcastPartial<ISessionWorkspace>({ folders: [] })),
			changesets: constObservable(undefined),
			changes: constObservable([]),
		});
		const session = upcastPartial<IActiveSession>({
			loading: constObservable(false),
			sessionId: 'provider:session',
			activeChat: constObservable(chat),
			mainChat: constObservable(chat),
		});
		const changesStatsCache = upcastPartial<ISessionChangesStatsCache>({
			get: () => ({ files: 3, insertions: 12, deletions: 5 }),
		});

		assert.deepStrictEqual(
			derived(reader => computeSessionInputPillStats(session, chat, reader, changesStatsCache)).get(),
			{ files: 3, insertions: 12, deletions: 5 },
		);
	});

	test('reports loaded stats only once the main chat file list resolves beyond the session summary', () => {
		const changeset = (changes: readonly ISessionFileChange[]) => upcastPartial<ISessionChangeset>({
			id: 'branch',
			isDefault: constObservable(true),
			isLoadingChanges: constObservable(false),
			changes: constObservable(changes),
		});
		const createChat = (changes: readonly ISessionFileChange[]) => upcastPartial<IChat>({
			resource: URI.parse('test://main-chat'),
			workspace: constObservable(upcastPartial<ISessionWorkspace>({ folders: [] })),
			changesets: constObservable([changeset(changes)]),
			changes: constObservable(changes),
		});
		const createSession = (chat: IChat, summaryFiles: number | undefined) => upcastPartial<IActiveSession>({
			loading: constObservable(false),
			sessionId: 'provider:session',
			activeChat: constObservable(chat),
			mainChat: constObservable(chat),
			changesSummary: summaryFiles === undefined ? undefined : constObservable({ files: summaryFiles, additions: 7, deletions: 2 }),
		});
		const read = (chat: IChat, summaryFiles: number | undefined) => derived(reader => readLoadedSessionInputPillStats(createSession(chat, summaryFiles), chat, reader)).get();
		const change = { modifiedUri: URI.file('/change.ts'), insertions: 7, deletions: 2 };

		assert.deepStrictEqual({
			onlySessionSummaryKnown: read(createChat([]), 1),
			resolved: read(createChat([change]), 1),
			noChanges: read(createChat([]), 0),
			noSummary: read(createChat([]), undefined),
		}, {
			onlySessionSummaryKnown: undefined,
			resolved: { files: 1, insertions: 7, deletions: 2 },
			noChanges: { files: 0, insertions: 0, deletions: 0 },
			noSummary: { files: 0, insertions: 0, deletions: 0 },
		});
	});

	for (const worktree of [false, true]) {
		for (const activation of ['click', 'Enter', 'Space'] as const) {
			test(`opens ${worktree ? 'Branch' : 'Session'} Changes from the pill with ${activation} and follows workspace updates`, () => {
				const { instantiationService } = createServices();
				const root = URI.file('/repo');
				const createWorkspace = (worktree: boolean) => upcastPartial<ISessionWorkspace>({
					folders: [{
						root,
						name: 'repo',
						description: undefined,
						workingDirectory: worktree ? URI.file('/worktrees/repo') : root,
						gitRepository: {
							uri: root,
							workTreeUri: worktree ? URI.file('/worktrees/repo') : undefined,
							baseBranchName: 'main',
							gitHubInfo: constObservable(undefined),
						},
					}],
				});
				const workspace = observableValue('workspace', createWorkspace(worktree));
				const chat = upcastPartial<IChat>({
					resource: URI.parse('chat:main'),
					workspace,
					changesets: constObservable([]),
					changes: constObservable([{
						modifiedUri: URI.file('/chat-change.ts'),
						insertions: 10,
						deletions: 4,
					}]),
				});
				const session = upcastPartial<IActiveSession>({
					loading: constObservable(false),
					sessionId: 'provider:session',
					capabilities: constObservable({ supportsMultipleChats: false }),
					resource: URI.parse('session:1'),
					chats: constObservable([]),
					workspace,
				});
				const calls: { action: string; resource?: URI; options?: ISessionChangesEditorOptions }[] = [];
				instantiationService.stub(ISessionsService, 'setActive', (session: IActiveSession | undefined) => {
					calls.push({ action: 'activate', resource: session?.resource });
				});
				instantiationService.stub(IAgentWorkbenchLayoutService, upcastPartial<IAgentWorkbenchLayoutService>({
					revealEditorPartExplicitly: () => { calls.push({ action: 'reveal' }); },
				}));
				instantiationService.stub(ISessionChangesService, upcastPartial<ISessionChangesService>({
					openChangesEditor: async (resource, options) => {
						calls.push({ action: 'open', resource, options });
						return undefined;
					},
				}));
				const toolbar = store.add(instantiationService.createInstance(SessionChatInputToolbar, false, undefined));
				toolbar.setSession(session, chat);
				for (const currentWorktree of [worktree, !worktree]) {
					workspace.set(createWorkspace(currentWorktree), undefined);
					const pill = toolbar.element.querySelector<HTMLElement>('.chat-changes-pill-button');
					assert.ok(pill);

					if (activation === 'click') {
						pill.click();
					} else {
						pill.dispatchEvent(new KeyboardEvent('keydown', {
							key: activation === 'Enter' ? 'Enter' : ' ',
							keyCode: activation === 'Enter' ? 13 : 32,
							bubbles: true,
						}));
					}
				}

				assert.deepStrictEqual(calls, [worktree, !worktree].flatMap(currentWorktree => [
					{ action: 'activate', resource: session.resource },
					{ action: 'reveal' },
					{ action: 'open', resource: session.resource, options: { changesetSelection: { kind: 'id', id: currentWorktree ? BRANCH_CHANGES_CHANGESET_ID : SESSION_CHANGES_CHANGESET_ID } } },
				]));
			});
		}
	}

	for (const activation of ['click', 'Enter', 'Space'] as const) {
		test(`shows, labels and opens Session Changes in a cloud sandbox worktree with ${activation}`, () => {
			const { instantiationService } = createServices();
			const root = URI.parse('https://github.com/owner/repo');
			const workingDirectory = URI.file('/workspaces/repo');
			const workspace = constObservable(upcastPartial<ISessionWorkspace>({
				folders: [{
					root,
					name: 'repo',
					description: undefined,
					workingDirectory,
					gitRepository: {
						uri: root,
						workTreeUri: workingDirectory,
						branchName: 'main',
						baseBranchName: 'main',
						gitHubInfo: constObservable(undefined),
					},
				}],
			}));
			const changes = observableValue('sessionChanges', [{
				modifiedUri: URI.file('/workspaces/repo/changed.ts'),
				insertions: 3,
				deletions: 0,
			}]);
			const chat = upcastPartial<IChat>({
				resource: URI.parse('chat:main'),
				workspace,
				changesets: constObservable([
					upcastPartial<ISessionChangeset>({
						id: BRANCH_CHANGES_CHANGESET_ID,
						isDefault: constObservable(false),
						changes: constObservable([]),
					}),
					upcastPartial<ISessionChangeset>({
						id: SESSION_CHANGES_CHANGESET_ID,
						isDefault: constObservable(true),
						changes,
					}),
				]),
				changes,
			});
			const session = upcastPartial<IActiveSession>({
				environment: 'cloud',
				providerId: `${REMOTE_AGENT_HOST_PROVIDER_PREFIX}cloudsandbox__environment`,
				loading: constObservable(false),
				sessionId: 'sandbox:session',
				capabilities: constObservable({ supportsMultipleChats: false }),
				resource: URI.parse('session:1'),
				chats: constObservable([chat]),
				mainChat: constObservable(chat),
				workspace,
			});
			const opened: (string | undefined)[] = [];
			instantiationService.stub(ISessionsService, 'setActive', () => { });
			instantiationService.stub(IAgentWorkbenchLayoutService, upcastPartial<IAgentWorkbenchLayoutService>({
				revealEditorPartExplicitly: () => { },
			}));
			instantiationService.stub(ISessionChangesService, upcastPartial<ISessionChangesService>({
				openChangesEditor: async (_resource, options) => {
					const selection = options?.changesetSelection;
					opened.push(selection?.kind === 'id' ? selection.id : undefined);
					return undefined;
				},
			}));
			const toolbar = store.add(instantiationService.createInstance(SessionChatInputToolbar, false, undefined));
			toolbar.setSession(session, chat);
			const pill = toolbar.element.querySelector<HTMLElement>('.chat-changes-pill-button');
			assert.ok(pill);
			const label = pill.getAttribute('aria-label');
			if (activation === 'click') {
				pill.click();
			} else {
				pill.dispatchEvent(new KeyboardEvent('keydown', {
					key: activation === 'Enter' ? 'Enter' : ' ',
					keyCode: activation === 'Enter' ? 13 : 32,
					bubbles: true,
				}));
			}
			changes.set([], undefined);

			assert.deepStrictEqual({
				label,
				opened,
				hasPillAfterClearing: !!toolbar.element.querySelector('.chat-changes-pill-button'),
			}, {
				label: 'Session Changes: 1 File, +3, -0',
				opened: [SESSION_CHANGES_CHANGESET_ID],
				hasPillAfterClearing: false,
			});
		});
	}

	test('labels and opens Session Changes from a nested chat pill while the main chat keeps Branch Changes', () => {
		const { instantiationService } = createServices();
		const root = URI.file('/repo');
		const worktree = URI.file('/worktrees/repo');
		const workspace = constObservable(upcastPartial<ISessionWorkspace>({
			folders: [{
				root,
				name: 'repo',
				description: undefined,
				workingDirectory: worktree,
				gitRepository: {
					uri: root,
					workTreeUri: worktree,
					baseBranchName: 'main',
					branchName: 'feature',
					gitHubInfo: constObservable(undefined),
				},
			}],
		}));
		const createChat = (resource: string) => upcastPartial<IChat>({
			resource: URI.parse(resource),
			workspace,
			changesets: constObservable([]),
			changes: constObservable([{
				modifiedUri: URI.file('/chat-change.ts'),
				insertions: 10,
				deletions: 4,
			}]),
		});
		const mainChat = createChat('chat:main');
		const nestedChat = createChat('chat:nested');
		const session = upcastPartial<IActiveSession>({
			loading: constObservable(false),
			sessionId: 'provider:session',
			capabilities: constObservable({ supportsMultipleChats: true }),
			resource: URI.parse('session:1'),
			chats: constObservable([mainChat, nestedChat]),
			mainChat: constObservable(mainChat),
			workspace,
		});
		const opened: (string | undefined)[] = [];
		instantiationService.stub(ISessionsService, 'setActive', () => { });
		instantiationService.stub(IAgentWorkbenchLayoutService, upcastPartial<IAgentWorkbenchLayoutService>({
			revealEditorPartExplicitly: () => { },
		}));
		instantiationService.stub(ISessionChangesService, upcastPartial<ISessionChangesService>({
			openChangesEditor: async (_resource, options) => {
				const selection = options?.changesetSelection;
				opened.push(selection?.kind === 'id' ? selection.id : undefined);
				return undefined;
			},
		}));
		const clickPill = (chat: IChat) => {
			const toolbar = store.add(instantiationService.createInstance(SessionChatInputToolbar, false, undefined));
			toolbar.setSession(session, chat);
			const pill = toolbar.element.querySelector<HTMLElement>('.chat-changes-pill-button');
			assert.ok(pill);
			pill.click();
			return pill.getAttribute('aria-label');
		};

		assert.deepStrictEqual({
			labels: { main: clickPill(mainChat), nested: clickPill(nestedChat) },
			opened,
		}, {
			labels: {
				main: 'All Changes (feature): 1 File, +10, -4',
				nested: 'Session Changes: 1 File, +10, -4',
			},
			opened: [BRANCH_CHANGES_CHANGESET_ID, SESSION_CHANGES_CHANGESET_ID],
		});
	});

	test('uses one GitHub row presentation in dedicated, artifact, and reference collections', () => {
		const commandService = upcastPartial<ICommandService>({});
		const clipboardService = upcastPartial<IClipboardService>({});
		const openerService = upcastPartial<IOpenerService>({});
		const sessionsService = upcastPartial<ISessionsService>({});
		const actions: ISessionArtifactActions = { recordOpen() { }, openExternal() { }, openResource() { }, openImages() { }, async downloadImage() { }, copy() { } };
		const rowPresentation = (entry: IChatPillEntry) => ({
			label: entry.label, badge: entry.badge, leading: entry.badgeBeforeLabel,
			pillLabel: entry.pillLabel, className: entry.className,
			ariaLabel: entry.ariaLabel, dropdownAriaLabel: entry.dropdownAriaLabel,
			preserveLabelOnRefresh: entry.preserveLabelOnRefresh,
		});
		const actual = [];
		for (const kind of [SessionArtifactKind.PullRequest, SessionArtifactKind.Issue]) {
			const typeLabel = kind === SessionArtifactKind.PullRequest ? 'Pull Request' : 'Issue';
			for (const title of [undefined, 'Recorded title']) {
				const uri = URI.parse(`https://github.com/microsoft/vscode/${kind === SessionArtifactKind.PullRequest ? 'pull' : 'issues'}/123`);
				const ref = { owner: 'microsoft', repo: 'vscode', number: 123, uri, title };
				const dedicated = kind === SessionArtifactKind.PullRequest
					? buildSessionPullRequestSections([{ ref, pullRequest: undefined, icon: Codicon.gitPullRequest, status: {} }], undefined, commandService, clipboardService, openerService, sessionsService)[0].entries[0]
					: buildSessionIssueSections([{ ref, issue: undefined }], undefined, commandService, clipboardService, openerService, sessionsService)[0].entries[0];
				const recorded = [true, false].map(isArtifact => buildSessionArtifactSections([{
					id: 'record', kind, label: title ?? '', isArtifact, isGitHub: true, link: uri,
				}], actions, { getUriLabel: resource => resource.toString() }, false, new Set())[0].entries[0]);
				actual.push({
					typeLabel, title,
					rows: [dedicated, ...recorded].map(rowPresentation),
				});
			}
		}
		assert.deepStrictEqual(actual, ['Pull Request', 'Issue'].flatMap(typeLabel => [undefined, 'Recorded title'].map(title => ({
			typeLabel, title,
			rows: Array.from({ length: 3 }, () => ({
				label: title ?? typeLabel, badge: '#123', leading: true, pillLabel: '#123',
				className: 'chat-pill-reference', preserveLabelOnRefresh: false,
				ariaLabel: `Open ${typeLabel} #123${title ? ': Recorded title' : ''}`,
				dropdownAriaLabel: `#123, Open ${typeLabel}${title ? ': Recorded title' : ''}`,
			})),
		}))));
	});

	test('adds rich GitHub hovers only when live details are available', async () => {
		const commands: { readonly id: string; readonly args: readonly unknown[] }[] = [];
		const clipboardWrites: string[] = [];
		const recordedOpenIds: string[] = [];
		const commandService = upcastPartial<ICommandService>({
			executeCommand: async (id, ...args) => {
				commands.push({ id, args });
				return undefined;
			},
		});
		const clipboardService = upcastPartial<IClipboardService>({ writeText: async value => { clipboardWrites.push(value); } });
		const openerService = upcastPartial<IOpenerService>({ open: async () => true });
		const sessionsService = upcastPartial<ISessionsService>({ setActive: () => { } });
		const pullRequestRef: IGitHubPullRequestRef = {
			owner: 'microsoft',
			repo: 'vscode',
			number: 332982,
			uri: URI.parse('https://github.com/microsoft/vscode/pull/332982'),
			title: 'Recorded pull request title',
			recordedReferenceId: 'pull-request-artifact',
		};
		const pullRequest: IGitHubPullRequest = {
			number: pullRequestRef.number,
			title: 'Restore rich pill hovers',
			body: 'Provides detailed pull request context.',
			state: GitHubPullRequestState.Merged,
			author: { login: 'octocat', avatarUrl: '' },
			headRef: 'feature/rich-hover',
			headSha: 'abc123',
			baseRef: 'main',
			isDraft: false,
			createdAt: '2026-09-03T09:00:00Z',
			updatedAt: '2026-09-03T10:00:00Z',
			mergedAt: '2026-09-04T10:00:00Z',
			mergeable: true,
			mergeableState: 'clean',
		};
		const issueRef: IGitHubIssueRef = {
			owner: 'microsoft',
			repo: 'vscode',
			number: 42,
			uri: URI.parse('https://github.com/microsoft/vscode/issues/42'),
			title: 'Recorded issue title',
			recordedReferenceId: 'issue-artifact',
		};
		const issue: IGitHubIssue = {
			number: issueRef.number,
			title: 'Rich issue hover',
			body: 'Provides detailed issue context.',
			state: GitHubIssueState.Closed,
			stateReason: GitHubIssueStateReason.Completed,
			author: { login: 'octocat', avatarUrl: '' },
			createdAt: '2026-09-03T09:00:00Z',
			updatedAt: '2026-09-03T10:00:00Z',
			closedAt: '2026-09-04T10:00:00Z',
		};
		const pullRequestEntry = buildSessionPullRequestSections(
			[{ ref: pullRequestRef, pullRequest, icon: Codicon.gitPullRequest, status: {} }],
			undefined,
			commandService,
			clipboardService,
			openerService,
			sessionsService,
			{ recordOpen: id => recordedOpenIds.push(id) },
		).flatMap(section => section.entries)[0];
		const unresolvedPullRequestEntry = buildSessionPullRequestSections(
			[{ ref: pullRequestRef, pullRequest: undefined, icon: Codicon.gitPullRequest, status: {} }],
			undefined,
			commandService,
			clipboardService,
			openerService,
			sessionsService,
		).flatMap(section => section.entries)[0];
		const issueEntry = buildSessionIssueSections(
			[{ ref: issueRef, issue }],
			undefined,
			commandService,
			clipboardService,
			openerService,
			sessionsService,
			{ recordOpen: id => recordedOpenIds.push(id) },
		).flatMap(section => section.entries)[0];
		const issueHoverCache = store.add(new ChatPillHoverCache());
		const cachedIssueEntry = buildSessionIssueSections(
			[{ ref: issueRef, issue }],
			undefined,
			commandService,
			clipboardService,
			openerService,
			sessionsService,
			undefined,
			issueHoverCache,
		).flatMap(section => section.entries)[0];
		const refreshedCachedIssueEntry = buildSessionIssueSections(
			[{ ref: issueRef, issue: { ...issue, title: 'Updated issue hover' } }],
			undefined,
			commandService,
			clipboardService,
			openerService,
			sessionsService,
			undefined,
			issueHoverCache,
		).flatMap(section => section.entries)[0];
		const activeIssueEntry = buildSessionIssueSections(
			[{
				ref: issueRef,
				issue: {
					...issue,
					state: GitHubIssueState.Open,
					stateReason: undefined,
					updatedAt: '2026-09-05T10:00:00Z',
					closedAt: undefined,
				},
			}],
			undefined,
			commandService,
			clipboardService,
			openerService,
			sessionsService,
		).flatMap(section => section.entries)[0];
		const duplicateIssueEntry = buildSessionIssueSections(
			[{ ref: issueRef, issue: { ...issue, stateReason: GitHubIssueStateReason.Duplicate } }],
			undefined,
			commandService,
			clipboardService,
			openerService,
			sessionsService,
		).flatMap(section => section.entries)[0];
		const notPlannedIssueEntry = buildSessionIssueSections(
			[{ ref: issueRef, issue: { ...issue, stateReason: GitHubIssueStateReason.NotPlanned } }],
			undefined,
			commandService,
			clipboardService,
			openerService,
			sessionsService,
		).flatMap(section => section.entries)[0];
		const unresolvedIssueEntry = buildSessionIssueSections(
			[{ ref: issueRef, issue: undefined }],
			undefined,
			commandService,
			clipboardService,
			openerService,
			sessionsService,
		).flatMap(section => section.entries)[0];

		const renderHover = async (entry: IChatPillEntry | undefined) => {
			if (!isManagedHoverTooltipHTMLElement(entry?.pillHover)) {
				return undefined;
			}
			return await entry.pillHover.element(CancellationToken.None);
		};
		const renderDropdownHover = (entry: IChatPillEntry | undefined) =>
			typeof entry?.hover?.content === 'function' ? entry.hover.content() : undefined;
		const pullRequestHover = await renderHover(pullRequestEntry);
		const issueHover = await renderHover(issueEntry);
		const activeIssueHover = await renderHover(activeIssueEntry);
		const duplicateIssueHover = await renderHover(duplicateIssueEntry);
		const notPlannedIssueHover = await renderHover(notPlannedIssueEntry);
		const pullRequestDropdownHover = renderDropdownHover(pullRequestEntry);
		const issueDropdownHover = renderDropdownHover(issueEntry);
		const cachedIssueDropdownHover = renderDropdownHover(cachedIssueEntry);
		const refreshedCachedIssueDropdownHover = renderDropdownHover(refreshedCachedIssueEntry);
		pullRequestHover?.querySelectorAll<HTMLButtonElement>('.sessions-pr-hover-branch').forEach(branch => branch.click());
		pullRequestHover?.querySelector<HTMLElement>('.sessions-pr-hover-reference')?.click();
		issueHover?.querySelector<HTMLElement>('.sessions-issue-hover-reference')?.click();
		pullRequestEntry?.open();
		unresolvedIssueEntry?.open();

		assert.deepStrictEqual({
			pullRequest: {
				label: pullRequestEntry?.label,
				badge: pullRequestEntry?.badge,
				leading: pullRequestEntry?.badgeBeforeLabel,
				rowClassName: pullRequestEntry?.className,
				pillHoverContentOwnsPadding: isManagedHoverTooltipHTMLElement(pullRequestEntry?.pillHover) ? pullRequestEntry.pillHover.contentOwnsPadding : undefined,
				className: pullRequestHover?.className,
				contentOrder: [...pullRequestHover?.children ?? []].map(element => element.className),
				provenanceOrder: [...pullRequestHover?.querySelector('.sessions-pr-hover-header')?.children ?? []].map(element => element.className),
				titleOrder: [...pullRequestHover?.querySelector('.sessions-pr-hover-title-content')?.childNodes ?? []].map(node => node.nodeType === 3 ? '#text' : (node as HTMLElement).className),
				dropdownClassName: pullRequestDropdownHover?.className,
				dropdownMatchesStandaloneContent: pullRequestDropdownHover?.textContent === pullRequestHover?.textContent,
				dropdownExpandable: pullRequestEntry?.hover?.expandable,
				dropdownIndicator: pullRequestEntry?.hover?.showIndicator,
				dropdownTabThroughPanel: pullRequestEntry?.hover?.tabThroughPanel,
				dropdownTabbableElements: pullRequestEntry?.hover?.getTabbableElements?.().length,
				dropdownContentOwnsPadding: pullRequestEntry?.hover?.contentOwnsPadding,
				repository: pullRequestHover?.querySelector('.sessions-pr-hover-repository')?.textContent,
				reference: pullRequestHover?.querySelector('.sessions-pr-hover-reference')?.textContent,
				referenceAriaLabel: pullRequestHover?.querySelector('.sessions-pr-hover-reference')?.getAttribute('aria-label'),
				status: pullRequestHover?.querySelector<HTMLElement>('.sessions-pr-hover-status')?.textContent,
				statusKind: pullRequestHover?.querySelector<HTMLElement>('.sessions-pr-hover-status')?.dataset.state,
				statusIconAriaHidden: pullRequestHover?.querySelector('.sessions-pr-hover-status .codicon')?.getAttribute('aria-hidden'),
				date: pullRequestHover?.querySelector('.sessions-pr-hover-date')?.textContent,
				title: pullRequestHover?.querySelector('.sessions-pr-hover-title-content')?.textContent?.replace('#332982', '').trim(),
				titleTailOrder: [...pullRequestHover?.querySelector('.sessions-pr-hover-title-tail')?.childNodes ?? []].map(node => node.nodeType === 3 ? '#text' : (node as HTMLElement).className),
				titleTooltip: pullRequestHover?.querySelector('.sessions-pr-hover-title')?.getAttribute('title'),
				description: pullRequestHover?.querySelector('.sessions-pr-hover-description-content')?.textContent,
				author: pullRequestHover?.querySelector('.sessions-pr-hover-author')?.textContent,
				branches: [...pullRequestHover?.querySelectorAll('.sessions-pr-hover-branch') ?? []].map(element => element.textContent),
				branchArrowAriaHidden: pullRequestHover?.querySelector('.sessions-pr-hover-branch-arrow')?.getAttribute('aria-hidden'),
				branchControls: [...pullRequestHover?.querySelectorAll('.sessions-pr-hover-branch') ?? []].map(element => ({
					tagName: element.tagName,
					ariaLabel: element.getAttribute('aria-label'),
				})),
				unresolvedLabel: unresolvedPullRequestEntry?.label,
				unresolvedBadge: unresolvedPullRequestEntry?.badge,
				unresolvedRowClassName: unresolvedPullRequestEntry?.className,
				unresolvedAriaLabel: unresolvedPullRequestEntry?.ariaLabel,
				unresolvedTooltip: unresolvedPullRequestEntry?.tooltip,
				unresolvedHover: unresolvedPullRequestEntry?.pillHover,
				clipboardWrites,
			},
			issue: {
				label: issueEntry?.label,
				badge: issueEntry?.badge,
				leading: issueEntry?.badgeBeforeLabel,
				rowClassName: issueEntry?.className,
				pillHoverContentOwnsPadding: isManagedHoverTooltipHTMLElement(issueEntry?.pillHover) ? issueEntry.pillHover.contentOwnsPadding : undefined,
				className: issueHover?.className,
				contentOrder: [...issueHover?.children ?? []].map(element => element.className),
				provenanceOrder: [...issueHover?.querySelector('.sessions-issue-hover-header')?.children ?? []].map(element => element.className),
				titleOrder: [...issueHover?.querySelector('.sessions-issue-hover-title-content')?.childNodes ?? []].map(node => node.nodeType === 3 ? '#text' : (node as HTMLElement).className),
				dropdownClassName: issueDropdownHover?.className,
				dropdownMatchesStandaloneContent: issueDropdownHover?.textContent === issueHover?.textContent,
				dropdownPreservedOnRefresh: cachedIssueDropdownHover === refreshedCachedIssueDropdownHover,
				dropdownUpdatedOnRefresh: refreshedCachedIssueDropdownHover?.textContent?.includes('Updated issue hover'),
				dropdownExpandable: issueEntry?.hover?.expandable,
				dropdownIndicator: issueEntry?.hover?.showIndicator,
				dropdownTabThroughPanel: issueEntry?.hover?.tabThroughPanel,
				dropdownTabbableElements: issueEntry?.hover?.getTabbableElements?.().length,
				dropdownContentOwnsPadding: issueEntry?.hover?.contentOwnsPadding,
				repository: issueHover?.querySelector('.sessions-issue-hover-repository')?.textContent,
				reference: issueHover?.querySelector('.sessions-issue-hover-reference')?.textContent,
				referenceAriaLabel: issueHover?.querySelector('.sessions-issue-hover-reference')?.getAttribute('aria-label'),
				status: issueHover?.querySelector<HTMLElement>('.sessions-issue-hover-status')?.textContent,
				statusKind: issueHover?.querySelector<HTMLElement>('.sessions-issue-hover-status')?.dataset.state,
				statusIconAriaHidden: issueHover?.querySelector('.sessions-issue-hover-status .codicon')?.getAttribute('aria-hidden'),
				date: issueHover?.querySelector('.sessions-issue-hover-date')?.textContent,
				title: issueHover?.querySelector('.sessions-issue-hover-title-content')?.textContent?.replace('#42', '').trim(),
				titleTailOrder: [...issueHover?.querySelector('.sessions-issue-hover-title-tail')?.childNodes ?? []].map(node => node.nodeType === 3 ? '#text' : (node as HTMLElement).className),
				titleTooltip: issueHover?.querySelector('.sessions-issue-hover-title')?.getAttribute('title'),
				description: issueHover?.querySelector('.sessions-issue-hover-description-content')?.textContent,
				author: issueHover?.querySelector('.sessions-issue-hover-author')?.textContent,
				unresolvedLabel: unresolvedIssueEntry?.label,
				unresolvedBadge: unresolvedIssueEntry?.badge,
				unresolvedRowClassName: unresolvedIssueEntry?.className,
				unresolvedAriaLabel: unresolvedIssueEntry?.ariaLabel,
				unresolvedTooltip: unresolvedIssueEntry?.tooltip,
				unresolvedHover: unresolvedIssueEntry?.pillHover,
				unresolvedAriaDescription: unresolvedIssueEntry?.ariaDescription,
				ariaDescription: issueEntry?.ariaDescription,
				openCommands: commands,
			},
			activeIssue: {
				status: activeIssueHover?.querySelector('.sessions-issue-hover-status')?.textContent,
				date: activeIssueHover?.querySelector('.sessions-issue-hover-date')?.textContent,
				ariaDescription: activeIssueEntry?.ariaDescription,
			},
			duplicateIssue: {
				status: duplicateIssueHover?.querySelector('.sessions-issue-hover-status')?.textContent,
				statusKind: duplicateIssueHover?.querySelector<HTMLElement>('.sessions-issue-hover-status')?.dataset.state,
				ariaDescription: duplicateIssueEntry?.ariaDescription,
			},
			notPlannedIssue: {
				status: notPlannedIssueHover?.querySelector('.sessions-issue-hover-status')?.textContent,
				statusKind: notPlannedIssueHover?.querySelector<HTMLElement>('.sessions-issue-hover-status')?.dataset.state,
				ariaDescription: notPlannedIssueEntry?.ariaDescription,
			},
			recordedOpenIds,
		}, {
			pullRequest: {
				label: 'Restore rich pill hovers',
				badge: '#332982',
				leading: true,
				rowClassName: 'chat-pill-reference',
				pillHoverContentOwnsPadding: true,
				className: 'chat-pill-hover-content sessions-pr-hover',
				contentOrder: [
					'sessions-pr-hover-header',
					'sessions-pr-hover-title',
					'sessions-pr-hover-status-row',
					'sessions-pr-hover-description',
					'sessions-pr-hover-branches',
					'sessions-pr-hover-author',
				],
				provenanceOrder: ['sessions-pr-hover-repository', 'sessions-pr-hover-date'],
				titleOrder: ['#text', 'sessions-pr-hover-title-tail'],
				titleTailOrder: ['#text', 'sessions-pr-hover-reference'],
				dropdownClassName: 'chat-pill-hover-content sessions-pr-hover compact',
				dropdownMatchesStandaloneContent: true,
				dropdownExpandable: true,
				dropdownIndicator: false,
				dropdownTabThroughPanel: true,
				dropdownTabbableElements: 4,
				dropdownContentOwnsPadding: true,
				repository: 'microsoft/vscode',
				reference: '#332982',
				referenceAriaLabel: 'Pull Request #332982',
				status: 'Merged',
				statusKind: 'merged',
				statusIconAriaHidden: 'true',
				date: 'on Sep 3',
				title: 'Restore rich pill hovers',
				titleTooltip: 'Restore rich pill hovers',
				description: 'Provides detailed pull request context.',
				author: '@octocat opened this pull request',
				branches: ['main', 'feature/rich-hover'],
				branchArrowAriaHidden: 'true',
				branchControls: [
					{ tagName: 'BUTTON', ariaLabel: 'Copy Base Branch main' },
					{ tagName: 'BUTTON', ariaLabel: 'Copy Head Branch feature/rich-hover' },
				],
				unresolvedLabel: 'Recorded pull request title',
				unresolvedBadge: '#332982',
				unresolvedRowClassName: 'chat-pill-reference',
				unresolvedAriaLabel: 'Open Pull Request #332982: Recorded pull request title',
				unresolvedTooltip: 'Pull Request #332982: Recorded pull request title\nhttps://github.com/microsoft/vscode/pull/332982',
				unresolvedHover: undefined,
				clipboardWrites: ['main', 'feature/rich-hover'],
			},
			issue: {
				label: 'Rich issue hover',
				badge: '#42',
				leading: true,
				rowClassName: 'chat-pill-reference',
				pillHoverContentOwnsPadding: true,
				className: 'chat-pill-hover-content sessions-issue-hover',
				contentOrder: [
					'sessions-issue-hover-header',
					'sessions-issue-hover-title',
					'sessions-issue-hover-status-row',
					'sessions-issue-hover-description',
					'sessions-issue-hover-author',
				],
				provenanceOrder: ['sessions-issue-hover-repository', 'sessions-issue-hover-date'],
				titleOrder: ['#text', 'sessions-issue-hover-title-tail'],
				titleTailOrder: ['#text', 'sessions-issue-hover-reference'],
				dropdownClassName: 'chat-pill-hover-content sessions-issue-hover compact',
				dropdownMatchesStandaloneContent: true,
				dropdownPreservedOnRefresh: true,
				dropdownUpdatedOnRefresh: true,
				dropdownExpandable: true,
				dropdownIndicator: false,
				dropdownTabThroughPanel: true,
				dropdownTabbableElements: 2,
				dropdownContentOwnsPadding: true,
				repository: 'microsoft/vscode',
				reference: '#42',
				referenceAriaLabel: 'Issue #42',
				status: 'Closed',
				statusKind: 'closed',
				statusIconAriaHidden: 'true',
				date: 'on Sep 3',
				title: 'Rich issue hover',
				titleTooltip: 'Rich issue hover',
				description: 'Provides detailed issue context.',
				author: '@octocat opened this issue',
				unresolvedLabel: 'Recorded issue title',
				unresolvedBadge: '#42',
				unresolvedRowClassName: 'chat-pill-reference',
				unresolvedAriaLabel: 'Open Issue #42: Recorded issue title',
				unresolvedTooltip: 'Issue #42: Recorded issue title\nhttps://github.com/microsoft/vscode/issues/42',
				unresolvedHover: undefined,
				unresolvedAriaDescription: 'https://github.com/microsoft/vscode/issues/42',
				ariaDescription: 'Closed. https://github.com/microsoft/vscode/issues/42',
				openCommands: [
					{
						id: 'workbench.agentSessions.action.openPullRequest',
						args: [{ pullRequest: pullRequestRef }],
					},
					{
						id: 'workbench.agentSessions.action.openIssue',
						args: [{ issue: issueRef }],
					},
				],
			},
			activeIssue: {
				status: 'Open',
				date: 'on Sep 3',
				ariaDescription: 'Open. https://github.com/microsoft/vscode/issues/42',
			},
			duplicateIssue: {
				status: 'Duplicate',
				statusKind: 'duplicate',
				ariaDescription: 'Duplicate. https://github.com/microsoft/vscode/issues/42',
			},
			notPlannedIssue: {
				status: 'Not planned',
				statusKind: 'notPlanned',
				ariaDescription: 'Not planned. https://github.com/microsoft/vscode/issues/42',
			},
			recordedOpenIds: ['pull-request-artifact', 'issue-artifact', 'pull-request-artifact'],
		});
	});

	test('updates a connected dedicated issue status without replacing its title or controls', () => {
		const cache = store.add(new ChatPillHoverCache());
		const ref: IGitHubIssueRef = { owner: 'microsoft', repo: 'vscode', number: 1, uri: URI.parse('https://github.com/microsoft/vscode/issues/1') };
		const issue: IGitHubIssue = {
			number: 1, title: 'Original title', body: '', state: GitHubIssueState.Open,
			stateReason: undefined, author: { login: 'author', avatarUrl: '' }, createdAt: '', updatedAt: '', closedAt: undefined,
		};
		const build = (updatedIssue: IGitHubIssue) => buildSessionIssueSections(
			[{ ref, issue: updatedIssue }], undefined,
			upcastPartial<ICommandService>({ executeCommand: async () => undefined }),
			upcastPartial<IClipboardService>({ writeText: async () => { } }),
			upcastPartial<IOpenerService>({ open: async () => true }),
			upcastPartial<ISessionsService>({ setActive: () => { } }), undefined, cache,
		)[0].entries[0].hover!;
		const first = build(issue);
		const content = first.content;
		assert.ok(typeof content === 'function');
		const element = content();
		assert.ok(element instanceof HTMLElement);
		mainWindow.document.body.appendChild(element);
		store.add(toDisposable(() => element.remove()));
		const control = first.getTabbableElements?.()[1]!;
		control.focus();
		const refreshed = build({ ...issue, title: 'Renamed title', state: GitHubIssueState.Closed, stateReason: GitHubIssueStateReason.Completed });
		assert.deepStrictEqual({
			sameDescriptor: first === refreshed,
			sameControl: refreshed.getTabbableElements?.()[1] === control,
			focusPreserved: mainWindow.document.activeElement === control,
			title: element.querySelector('.sessions-issue-hover-title')?.getAttribute('title'),
			status: element.querySelector('.sessions-issue-hover-status-label')?.textContent,
			statusKind: element.querySelector<HTMLElement>('.sessions-issue-hover-status')?.dataset.state,
		}, {
			sameDescriptor: true, sameControl: true, focusPreserved: true,
			title: 'Original title', status: 'Closed', statusKind: 'closed',
		});
	});

	test('does not update the managed PR hover during metadata or reference identity refreshes', async () => {
		const { instantiationService } = createServices();
		const cache = store.add(new ChatPillHoverCache());
		const ref: IGitHubPullRequestRef = {
			owner: 'microsoft', repo: 'vscode', number: 1,
			uri: URI.parse('https://github.com/microsoft/vscode/pull/1'), recordedReferenceId: 'pr-artifact',
		};
		const pullRequest: IGitHubPullRequest = {
			number: 1, title: 'Original title', body: 'Description', state: GitHubPullRequestState.Open,
			author: { login: 'octocat', avatarUrl: '' }, headRef: 'feature', headSha: 'head', baseRef: 'main',
			isDraft: false, createdAt: '', updatedAt: '', mergedAt: undefined, mergeable: true, mergeableState: 'clean',
		};
		const copied: string[] = [];
		const removed: string[] = [];
		const build = (title: string) => buildSessionPullRequestSections(
			[{ ref: { ...ref }, pullRequest: { ...pullRequest, title }, icon: Codicon.gitPullRequest, status: {} }],
			undefined,
			upcastPartial<ICommandService>({ executeCommand: async () => undefined }),
			upcastPartial<IClipboardService>({ writeText: async value => { copied.push(value); } }),
			upcastPartial<IOpenerService>({ open: async () => true }),
			upcastPartial<ISessionsService>({ setActive: () => { } }),
			{ remove: async () => { removed.push(title); } },
			cache,
		);
		const sections = observableValue('pullRequestSections', build('Original title'));
		let tooltipUpdates = 0;
		const viewItem = store.add(instantiationService.createInstance(class extends ChatDropdownPillActionViewItem {
			protected override updateTooltip(): void {
				tooltipUpdates++;
				super.updateTooltip();
			}
		}, { id: 'pullRequests', label: 'Pull Requests', tooltip: '', class: undefined, enabled: true, run: () => { } }, {}, sections, {
			widgetId: 'pullRequests', icon: Codicon.gitPullRequest, title: 'Pull Requests',
			summaryLabel: count => `${count} Pull Requests`, summaryAriaLabel: count => `Show ${count} pull requests`,
		}));
		const container = mainWindow.document.createElement('div');
		mainWindow.document.body.appendChild(container);
		store.add(toDisposable(() => container.remove()));
		viewItem.render(container);
		tooltipUpdates = 0;
		let managedUpdates = 0;
		Reflect.set(viewItem, 'customHover', {
			show: () => { }, hide: () => { }, dispose: () => { },
			update: () => { managedUpdates++; },
		});
		const firstEntry = sections.get()[0].entries[0];
		const firstHover = firstEntry.pillHover;
		assert.ok(isManagedHoverTooltipHTMLElement(firstHover));
		const element = await firstHover.element(CancellationToken.None);
		container.appendChild(element);
		const focusedControl = element.querySelector<HTMLElement>('.sessions-pr-hover-reference')!;
		focusedControl.focus();
		for (const title of ['Updated title', 'Latest title']) {
			sections.set(build(title), undefined);
		}
		const updatedEntry = sections.get()[0].entries[0];
		const copyAction = (entry: IChatPillEntry) => entry.toolbarActions?.find(action => action.id.startsWith('sessionChatPills.copyPullRequest.'));
		await copyAction(firstEntry)?.run();
		await firstEntry.promotedAction?.run();
		const snapshot = {
			tooltipUpdates, managedUpdates,
			sameDescriptor: firstHover === updatedEntry.pillHover,
			sameCopyAction: !!copyAction(firstEntry) && copyAction(firstEntry) === copyAction(updatedEntry),
			sameRemoveAction: firstEntry.promotedAction === updatedEntry.promotedAction,
			focusPreserved: mainWindow.document.activeElement === focusedControl,
			title: element.querySelector('.sessions-pr-hover-title')?.getAttribute('title'),
		};
		element.remove();
		const reopened = await firstHover.element(CancellationToken.None);
		assert.deepStrictEqual({
			snapshot,
			reopenedTitle: reopened.querySelector('.sessions-pr-hover-title')?.getAttribute('title'),
			copied, removed,
		}, {
			snapshot: {
				tooltipUpdates: 0, managedUpdates: 0, sameDescriptor: true,
				sameCopyAction: true, sameRemoveAction: true, focusPreserved: true, title: 'Original title',
			},
			reopenedTitle: 'Latest title',
			copied: [ref.uri.toString(true)], removed: ['Latest title'],
		});
	});

	test('bounds and normalizes GitHub hover descriptions for assistive technology', () => {
		const description = getGitHubHoverDescription(`<!-- template -->\n## Summary\n\n${'Useful context with [documentation](https://example.com). '.repeat(8)}`, 'No description provided.');
		const unicodeDescription = getGitHubHoverDescription(`${'a'.repeat(198)}😀xy`, 'No description provided.');
		const title = getGitHubHoverTitle(`${'a'.repeat(78)}😀xy`);
		const titleParts = getGitHubHoverTitleParts('A title ending in context');
		const singleTokenTitleParts = getGitHubHoverTitleParts('a'.repeat(100));

		assert.deepStrictEqual({
			startsWithReadableText: description.startsWith('Summary Useful context with documentation.'),
			containsMarkdownSyntax: /<!--|##|\[|\]\(/.test(description),
			length: description.length,
			endsWithEllipsis: description.endsWith('…'),
			unicodeDescription: {
				codePoints: Array.from(unicodeDescription).length,
				endsAtCodePointBoundary: unicodeDescription.endsWith('😀…'),
				containsReplacementCharacter: unicodeDescription.includes('�'),
			},
			title: {
				codePoints: Array.from(title).length,
				endsAtCodePointBoundary: title.endsWith('😀…'),
			},
			titleParts,
			singleTokenTitleParts,
		}, {
			startsWithReadableText: true,
			containsMarkdownSyntax: false,
			length: 200,
			endsWithEllipsis: true,
			unicodeDescription: {
				codePoints: 200,
				endsAtCodePointBoundary: true,
				containsReplacementCharacter: false,
			},
			title: {
				codePoints: 80,
				endsAtCodePointBoundary: true,
			},
			titleParts: { leading: 'A title ending in ', trailing: 'context' },
			singleTokenTitleParts: { leading: `${'a'.repeat(79)}…`, trailing: undefined },
		});
	});

	test('uses the shared GitHub date pattern for valid timestamps', () => {
		assert.deepStrictEqual({
			valid: getGitHubHoverDate('2026-09-03T10:00:00Z'),
			missing: getGitHubHoverDate(undefined),
			invalid: getGitHubHoverDate('not-a-date'),
		}, {
			valid: 'Sep 3',
			missing: undefined,
			invalid: undefined,
		});
	});

	test('reveals a bounded title when keyboard focus reaches its reference link', () => {
		const title = `${'Long issue title '.repeat(8)}ending`;
		const hover = createIssueHover({
			owner: 'microsoft',
			repo: 'vscode',
			number: 42,
			repositoryHref: 'https://github.com/microsoft/vscode',
			referenceHref: 'https://github.com/microsoft/vscode/issues/42',
			issue: {
				number: 42,
				title,
				body: '',
				state: GitHubIssueState.Open,
				stateReason: undefined,
				author: { login: 'octocat', avatarUrl: '' },
				createdAt: '2026-09-03T10:00:00Z',
				updatedAt: '2026-09-03T10:00:00Z',
				closedAt: undefined,
			},
			density: 'compact',
		}).element;
		const titleContent = hover.querySelector('.sessions-issue-hover-title-content');
		const reference = hover.querySelector<HTMLAnchorElement>('.sessions-issue-hover-reference');
		const bounded = titleContent?.textContent;
		reference?.dispatchEvent(new FocusEvent('focus'));
		const focused = titleContent?.textContent;
		reference?.dispatchEvent(new FocusEvent('blur'));

		assert.deepStrictEqual({
			bounded,
			focused,
			restored: titleContent?.textContent,
			fullTitle: hover.querySelector('.sessions-issue-hover-title')?.getAttribute('title'),
		}, {
			bounded: `${getGitHubHoverTitle(title)}\u00a0#42`,
			focused: `${title}\u00a0#42`,
			restored: `${getGitHubHoverTitle(title)}\u00a0#42`,
			fullTitle: title,
		});
	});

	test('hides the pills in a subagent chat', () => {
		const { instantiationService, visibility } = createServices();
		const workspace = constObservable(upcastPartial<ISessionWorkspace>({ folders: [] }));
		const changes = constObservable([{
			modifiedUri: URI.file('/chat-change.ts'),
			insertions: 10,
			deletions: 4,
		}]);
		const chat = upcastPartial<IChat>({
			resource: URI.parse('chat:main'),
			title: constObservable('Main chat'),
			status: constObservable(SessionStatus.InProgress),
			workspace,
			changesets: constObservable([]),
			changes,
		});
		const subagentChat = upcastPartial<IChat>({
			resource: URI.parse('chat:subagent'),
			title: constObservable('Subagent'),
			status: constObservable(SessionStatus.InProgress),
			workspace,
			changesets: constObservable([]),
			changes,
			origin: { kind: ChatOriginKind.Tool, parentChat: chat.resource },
		});
		const forkedChat = upcastPartial<IChat>({
			resource: URI.parse('chat:fork'),
			title: constObservable('Fork'),
			status: constObservable(SessionStatus.InProgress),
			workspace,
			changesets: constObservable([]),
			changes,
			origin: { kind: ChatOriginKind.Fork, parentChat: chat.resource },
		});
		const session = upcastPartial<IActiveSession>({
			loading: constObservable(false),
			sessionId: 'provider:session',
			capabilities: constObservable({ supportsMultipleChats: true }),
			resource: URI.parse('session:1'),
			chats: constObservable([chat, subagentChat, forkedChat]),
			workspace: constObservable(upcastPartial<ISessionWorkspace>({ folders: [] })),
		});
		visibility.toggle(SessionChatPillKind.Subagents);
		const toolbar = store.add(instantiationService.createInstance(SessionChatInputToolbar, false, undefined));
		const read = () => ({
			pills: Array.from(toolbar.element.querySelectorAll('.chat-pill-label, .changes-stats-files')).map(label => label.textContent),
			visible: toolbar.visible,
		});

		toolbar.setSession(session, chat);
		const main = read();
		toolbar.setSession(session, subagentChat);
		const subagent = read();
		toolbar.setSession(session, forkedChat);

		assert.deepStrictEqual({ main, subagent, fork: read() }, {
			main: { pills: ['1 File', '1 Subagent'], visible: true },
			subagent: { pills: [], visible: false },
			fork: { pills: ['1 File'], visible: true },
		});
	});

	test('opens single subagent input pills and every dropdown entry beside the parent chat', () => {
		const { instantiationService, visibility } = createServices();
		visibility.toggle(SessionChatPillKind.Subagents);
		const opened: Parameters<ISessionsService['openChatToSide']>[] = [];
		instantiationService.stub(ISessionsService, {
			visibleSessions: constObservable([]),
			activeSession: constObservable(undefined),
			openChatToSide: async (...args) => { opened.push(args); },
		});
		let entries: { label: string | undefined; select(): void }[] = [];
		let hideDropdown: (() => void) | undefined;
		instantiationService.stub(IActionWidgetService, {
			isVisible: false,
			show: (_id, _preview, items, delegate) => {
				entries = items.map(item => ({
					label: item.label,
					select: () => {
						if (item.item) {
							delegate.onSelect(item.item);
						}
					},
				}));
				hideDropdown = () => delegate.onHide?.();
			},
			hide: () => hideDropdown?.(),
		});
		const workspace = constObservable(upcastPartial<ISessionWorkspace>({ folders: [] }));
		const chat = upcastPartial<IChat>({
			resource: URI.parse('chat:parent'),
			title: constObservable('Parent'),
			status: constObservable(SessionStatus.InProgress),
			workspace,
			changes: constObservable([]),
			changesets: constObservable([]),
		});
		const subagents = [
			{ title: 'Running', status: SessionStatus.InProgress },
			{ title: 'Waiting', status: SessionStatus.NeedsInput },
			{ title: 'Completed', status: SessionStatus.Completed },
		].map(({ title, status }) => upcastPartial<IChat>({
			resource: URI.parse(`chat:${title}`),
			title: constObservable(title),
			status: constObservable(status),
			origin: { kind: ChatOriginKind.Tool, parentChat: chat.resource },
		}));
		const chats = observableValue<readonly IChat[]>('chats', [chat, subagents[0]]);
		const session = upcastPartial<IActiveSession>({
			loading: constObservable(false),
			sessionId: 'provider:session',
			resource: URI.parse('session:1'),
			capabilities: constObservable({ supportsMultipleChats: true }),
			chats,
			workspace,
		});
		const toolbar = store.add(instantiationService.createInstance(SessionChatInputToolbar, false, undefined));
		document.body.appendChild(toolbar.element);
		store.add(toDisposable(() => toolbar.element.remove()));
		toolbar.setSession(session, chat);
		const labels = () => Array.from(toolbar.element.querySelectorAll('.chat-pill-label'), label => label.textContent);
		const clickPill = () => {
			const pill = toolbar.getChatPetPlatformElements()[0];
			assert.ok(pill);
			pill.click();
		};
		const singleLabels = labels();
		clickPill();
		const singleEntry = entries.find(item => item.label === subagents[0].title.get());
		assert.ok(singleEntry);
		singleEntry.select();
		instantiationService.get(IActionWidgetService).hide();
		chats.set([chat, ...subagents], undefined);
		const multipleLabels = labels();
		for (const subagent of subagents) {
			clickPill();
			const entry = entries.find(item => item.label === subagent.title.get());
			assert.ok(entry);
			entry.select();
		}

		assert.deepStrictEqual({
			singleLabels, multipleLabels, opened,
			transcriptSections: toolbar.backgroundActivityPillSections.subagents?.get().map(section => ({ title: section.title, entries: section.entries.map(entry => entry.label) })),
		}, {
			singleLabels: ['1 Subagent'],
			multipleLabels: ['3 Subagents'],
			opened: [subagents[0], ...subagents].map(subagent => [
				session, subagent.resource, { referenceChatResource: chat.resource },
			]),
			transcriptSections: [
				{ title: 'Subagents: In Progress', entries: ['Waiting', 'Running'] },
			],
		});
	});

	test('shares live background shells with the transcript and clears them when switching chats', () => {
		const { instantiationService } = createServices();
		const shells = observableValue<readonly IChatBackgroundShell[]>('shells', [{
			id: 'tests', description: 'Running tests', command: 'npm test', startedAt: new Date(0).toISOString(),
		}]);
		const workspace = constObservable(upcastPartial<ISessionWorkspace>({ folders: [] }));
		const chat = upcastPartial<IChat>({
			resource: URI.parse('chat:parent'),
			title: constObservable('Parent'),
			status: constObservable(SessionStatus.InProgress),
			workspace,
			changes: constObservable([]),
			changesets: constObservable([]),
			backgroundShells: shells,
		});
		const session = upcastPartial<IActiveSession>({
			loading: constObservable(false),
			sessionId: 'provider:session',
			resource: URI.parse('session:1'),
			capabilities: constObservable({ supportsMultipleChats: true }),
			chats: constObservable([chat]),
			workspace,
		});
		const toolbar = store.add(instantiationService.createInstance(SessionChatInputToolbar, false, undefined));
		toolbar.setSession(session, chat);
		const labels = () => toolbar.backgroundActivityPillSections.backgroundShells?.get().map(shell => shell.description);
		const running = labels();
		const initialShells = shells.get();
		shells.set([], undefined);
		const finished = labels();
		shells.set(initialShells, undefined);
		const resumed = labels();
		toolbar.setSession(undefined, undefined);
		assert.deepStrictEqual({ running, finished, resumed, switched: labels() }, {
			running: ['Running tests'], finished: [], resumed: ['Running tests'], switched: [],
		});
	});

	test('shows a canvas title or count, reveals the selected canvas, and closes a canvas from its row', async () => {
		const { instantiationService } = createServices();
		const configurationService = instantiationService.get(IConfigurationService);
		assert.ok(configurationService instanceof TestConfigurationService);
		await configurationService.setUserConfiguration(CanvasesEnabledSettingId, true);
		const commandCalls: { readonly id: string; readonly reference: unknown }[] = [];
		instantiationService.stub(ICommandService, upcastPartial<ICommandService>({
			executeCommand: async (id, reference) => {
				if (id === REVEAL_CANVAS_COMMAND_ID) {
					commandCalls.push({ id, reference });
				}
				return undefined;
			},
		}));
		const closeCalls: { readonly session: string; readonly chat: string; readonly canvas: string }[] = [];
		instantiationService.stub(ISessionsManagementService, upcastPartial<ISessionsManagementService>({
			closeCanvas: async (session, chat, canvas) => {
				closeCalls.push({ session: session.sessionId, chat: chat.resource.toString(), canvas: canvas.resource.toString() });
			},
		}));
		let entries: { label: string | undefined; toolbarActions: readonly IAction[]; select(): void }[] = [];
		let hideDropdown: (() => void) | undefined;
		instantiationService.stub(IActionWidgetService, {
			isVisible: false,
			show: (_id, _preview, items, delegate) => {
				entries = items.map(item => ({
					label: item.label,
					toolbarActions: item.toolbarActions ?? [],
					select: () => {
						if (item.item) {
							delegate.onSelect(item.item);
						}
					},
				}));
				hideDropdown = () => delegate.onHide?.();
			},
			hide: () => hideDropdown?.(),
		});
		const preview: ISessionCanvas = {
			resource: URI.parse('agent-host-canvas:/preview'),
			instanceId: 'preview',
			title: 'Preview',
			source: URI.parse('https://example.test/preview'),
		};
		const dashboard: ISessionCanvas = {
			resource: URI.parse('agent-host-canvas:/dashboard'),
			instanceId: 'dashboard',
			title: 'Dashboard',
			source: URI.parse('https://example.test/dashboard'),
		};
		const canvases = observableValue<readonly ISessionCanvas[] | undefined>('canvases', [preview]);
		const workspace = constObservable(upcastPartial<ISessionWorkspace>({ folders: [] }));
		const chat = upcastPartial<IChat>({
			resource: URI.parse('agent-host-chat:/session/main'),
			canvases,
			workspace,
			changes: constObservable([]),
			changesets: constObservable([]),
		});
		const session = upcastPartial<IActiveSession>({
			loading: constObservable(false),
			providerId: 'local-agent-host',
			sessionId: 'local-agent-host:session',
			resource: URI.parse('agent-host-session:/session'),
			capabilities: constObservable({ supportsCanvases: true, supportsMultipleChats: false }),
			chats: constObservable([chat]),
			workspace,
		});
		const toolbar = store.add(instantiationService.createInstance(SessionChatInputToolbar, false, undefined));
		document.body.appendChild(toolbar.element);
		store.add(toDisposable(() => toolbar.element.remove()));
		toolbar.setSession(session, chat);
		const presentation = () => {
			const pill = toolbar.element.querySelector<HTMLElement>('.chat-dropdown-pill-button');
			return {
				label: pill?.querySelector('.chat-pill-label')?.textContent,
				ariaLabel: pill?.getAttribute('aria-label'),
				closeLabel: toolbar.element.querySelector('.chat-pill-promoted-action')?.getAttribute('aria-label'),
			};
		};
		const single = presentation();
		toolbar.getChatPetPlatformElements()[0]?.click();
		toolbar.element.querySelector<HTMLElement>('.chat-pill-promoted-action')?.click();
		canvases.set([preview, dashboard], undefined);
		const multiple = presentation();
		toolbar.element.querySelector<HTMLElement>('.chat-dropdown-pill-button')?.click();
		const dashboardEntry = entries.find(entry => entry.label === dashboard.title);
		assert.ok(dashboardEntry);
		dashboardEntry.select();
		const rowActionLabels = entries.flatMap(entry => entry.toolbarActions.map(action => action.label));
		await dashboardEntry.toolbarActions.find(action => action.label === 'Close Canvas Dashboard')?.run();

		assert.deepStrictEqual({ single, multiple, commandCalls, rowActionLabels, closeCalls }, {
			single: { label: 'Preview', ariaLabel: 'Open canvas Preview', closeLabel: 'Close Canvas Preview' },
			multiple: { label: '2 Canvases', ariaLabel: 'Show 2 canvases', closeLabel: undefined },
			commandCalls: [
				{
					id: REVEAL_CANVAS_COMMAND_ID,
					reference: {
						providerId: session.providerId,
						session: session.resource,
						chat: chat.resource,
						canvas: preview.resource,
					},
				},
				{
					id: REVEAL_CANVAS_COMMAND_ID,
					reference: {
						providerId: session.providerId,
						session: session.resource,
						chat: chat.resource,
						canvas: dashboard.resource,
					},
				},
			],
			rowActionLabels: ['Pin Preview', 'Close Canvas Preview', 'Pin Dashboard', 'Close Canvas Dashboard'],
			closeCalls: [
				{ session: session.sessionId, chat: chat.resource.toString(), canvas: preview.resource.toString() },
				{ session: session.sessionId, chat: chat.resource.toString(), canvas: dashboard.resource.toString() },
			],
		});
	});

	for (const keyboard of [false, true]) {
		for (const withChanges of [false, true]) {
			test(`groups and restores filtered subagents from ${withChanges ? 'another pill' : 'the empty toolbar'} using ${keyboard ? 'the keyboard' : 'the mouse'}`, async () => {
				const { instantiationService, visibility } = createServices();
				visibility.toggle(SessionChatPillKind.Subagents);
				let menuActions: readonly IAction[] = [];
				instantiationService.stub(IContextMenuService, {
					showContextMenu: delegate => {
						assert.ok(delegate.getActions);
						menuActions = delegate.getActions();
					},
				});
				let dropdownLabels: readonly (string | undefined)[] = [];
				let hideDropdown: (() => void) | undefined;
				instantiationService.stub(IActionWidgetService, {
					isVisible: false,
					show: (_id, _preview, items, delegate) => {
						dropdownLabels = items.map(item => item.label);
						hideDropdown = () => delegate.onHide?.();
					},
					hide: () => hideDropdown?.(),
				});
				const workspace = constObservable(upcastPartial<ISessionWorkspace>({ folders: [] }));
				const chatChanges = constObservable(withChanges ? [{ modifiedUri: URI.file('/change.ts'), insertions: 1, deletions: 0 }] : []);
				const chat = upcastPartial<IChat>({
					resource: URI.parse('chat:main'),
					title: constObservable('Main'),
					status: constObservable(SessionStatus.InProgress),
					workspace,
					changes: chatChanges,
					changesets: constObservable([]),
				});
				const runningStatus = observableValue('runningStatus', SessionStatus.InProgress);
				const waitingStatus = observableValue('waitingStatus', SessionStatus.NeedsInput);
				const subagents = [
					{ title: 'Running', status: runningStatus },
					{ title: 'Waiting', status: waitingStatus },
					{ title: 'Finished', status: constObservable(SessionStatus.Completed) },
					{ title: 'Failed', status: constObservable(SessionStatus.Error) },
				].map(({ title, status }) => upcastPartial<IChat>({
					resource: URI.parse(`chat:${title}`),
					title: constObservable(title),
					status,
					origin: { kind: ChatOriginKind.Tool, parentChat: chat.resource },
				}));
				const session = upcastPartial<IActiveSession>({
					loading: constObservable(false),
					sessionId: 'provider:session',
					capabilities: constObservable({ supportsMultipleChats: true }),
					resource: URI.parse('session:1'),
					chats: constObservable([chat, ...subagents]),
					workspace,
				});
				const toolbar = store.add(instantiationService.createInstance(SessionChatInputToolbar, false, undefined));
				document.body.appendChild(toolbar.element);
				store.add(toDisposable(() => toolbar.element.remove()));
				toolbar.setSession(session, chat);
				const labels = () => Array.from(toolbar.element.querySelectorAll('.chat-pill-label, .changes-stats-files')).map(label => label.textContent);
				const openMenu = (target: HTMLElement) => {
					menuActions = [];
					target.dispatchEvent(keyboard
						? new KeyboardEvent('keydown', { key: 'F10', keyCode: 121, shiftKey: true, bubbles: true })
						: new MouseEvent('contextmenu', { bubbles: true }));
					return menuActions;
				};
				const subagentPill = toolbar.getChatPetPlatformElements().at(-1);
				assert.ok(subagentPill);
				subagentPill.click();
				hideDropdown?.();
				const ownMenu = openMenu(subagentPill);
				const ownOptions = ownMenu.find(action => action instanceof SubmenuAction);
				assert.ok(ownOptions instanceof SubmenuAction);
				const before = ownOptions.actions.map(action => ({ label: action.label, checked: action.checked }));
				await ownOptions.actions[1].run();
				const filtered = labels();
				runningStatus.set(SessionStatus.Completed, undefined);
				waitingStatus.set(SessionStatus.Completed, undefined);
				const afterCompletion = {
					labels: labels(),
					visible: toolbar.visible,
					empty: toolbar.element.classList.contains('empty'),
				};
				const recoveryTarget = toolbar.getChatPetPlatformElements()[0] ?? toolbar.element.querySelector<HTMLElement>('.chat-pills-row-content');
				assert.ok(recoveryTarget);
				const recoveryOptions = openMenu(recoveryTarget).find(action => action instanceof SubmenuAction);
				assert.ok(recoveryOptions instanceof SubmenuAction);
				const after = recoveryOptions.actions.map(action => ({ label: action.label, checked: action.checked }));
				await recoveryOptions.actions[0].run();

				assert.deepStrictEqual({
					dropdownLabels,
					ownMenu: ownMenu.slice(0, 4).map(action => action.label),
					before,
					filtered,
					afterCompletion,
					recoveryOptions: recoveryOptions.label,
					after,
					restored: labels(),
					emptyAfterRestore: toolbar.element.classList.contains('empty'),
				}, {
					dropdownLabels: ['Subagents: In Progress', 'Waiting', 'Running', '', 'Subagents: Completed', 'Failed', 'Finished'],
					ownMenu: ['Hide Subagents', '', 'Subagent Options', ''],
					before: [{ label: 'Show All', checked: true }, { label: 'Show In Progress', checked: false }],
					filtered: [...(withChanges ? ['1 File'] : []), '2 Subagents'],
					afterCompletion: { labels: withChanges ? ['1 File'] : [], visible: true, empty: !withChanges },
					recoveryOptions: 'Subagent Options',
					after: [{ label: 'Show All', checked: false }, { label: 'Show In Progress', checked: true }],
					restored: [...(withChanges ? ['1 File'] : []), '4 Subagents'],
					emptyAfterRestore: false,
				});
			});
		}
	}

	test('exposes live and cached pull request states without treating a closed draft as open', () => {
		const ref: IGitHubPullRequestRef = {
			owner: 'microsoft',
			repo: 'vscode',
			number: 1,
			uri: URI.parse('https://github.com/microsoft/vscode/pull/1'),
		};
		const pullRequests: readonly IResolvedSessionPullRequest[] = [
			{
				ref,
				pullRequest: upcastPartial<IGitHubPullRequest>({
					state: GitHubPullRequestState.Open,
					isDraft: true,
					author: { login: 'octocat', avatarUrl: '' },
					title: 'Open draft',
					body: '',
					baseRef: 'main',
					headRef: 'draft',
					createdAt: '2026-09-01T10:00:00Z',
					updatedAt: '2026-09-05T10:00:00Z',
				}),
				icon: Codicon.gitPullRequestDraft,
				status: {},
				ciStatus: GitHubCIOverallStatus.Pending,
			},
			{
				ref,
				pullRequest: upcastPartial<IGitHubPullRequest>({
					state: GitHubPullRequestState.Closed,
					isDraft: true,
					author: { login: 'octocat', avatarUrl: '' },
					title: 'Closed draft',
					body: '',
					baseRef: 'main',
					headRef: 'draft',
					createdAt: '2026-09-01T10:00:00Z',
					updatedAt: '2026-09-05T10:00:00Z',
					closedAt: '2026-09-04T10:00:00Z',
				}),
				icon: Codicon.gitPullRequestDraft,
				status: {},
			},
			{ ref: { ...ref, state: 'merged' }, pullRequest: upcastPartial<IGitHubPullRequest>({ state: GitHubPullRequestState.Open, isDraft: false }), icon: Codicon.gitPullRequest, status: { hasFailingChecks: true }, ciStatus: GitHubCIOverallStatus.Failure },
			{ ref: { ...ref, liveState: 'closed', state: 'open' }, pullRequest: undefined, icon: Codicon.gitPullRequest, status: {} },
			{ ref: { ...ref, state: 'merged' }, pullRequest: undefined, icon: Codicon.gitPullRequest, status: {} },
			{ ref, pullRequest: undefined, icon: Codicon.gitPullRequestDone, status: {} },
			{ ref, pullRequest: undefined, icon: undefined, status: {} },
		];
		const entries = buildSessionPullRequestSections(
			pullRequests,
			undefined,
			upcastPartial<ICommandService>({}),
			upcastPartial<IClipboardService>({}),
			upcastPartial<IOpenerService>({}),
			upcastPartial<ISessionsService>({}),
		).flatMap(section => section.entries);

		const openDraftHover = typeof entries[0].hover?.content === 'function' ? entries[0].hover.content() : undefined;
		const closedDraftHover = typeof entries[1].hover?.content === 'function' ? entries[1].hover.content() : undefined;
		assert.deepStrictEqual({
			states: entries.map(entry => entry.pullRequestState),
			descriptions: entries.slice(0, 3).map(entry => entry.ariaDescription),
			openDraftHover: {
				status: openDraftHover?.querySelector('.sessions-pr-hover-status')?.textContent,
				date: openDraftHover?.querySelector('.sessions-pr-hover-date')?.textContent,
			},
			closedDraftHover: {
				status: closedDraftHover?.querySelector('.sessions-pr-hover-status')?.textContent,
				date: closedDraftHover?.querySelector('.sessions-pr-hover-date')?.textContent,
			},
		}, {
			states: ['draft', 'closed', 'open', 'closed', 'merged', 'merged', 'open'],
			descriptions: [
				'draft. Checks pending. https://github.com/microsoft/vscode/pull/1',
				'closed. https://github.com/microsoft/vscode/pull/1',
				'failing checks. https://github.com/microsoft/vscode/pull/1',
			],
			openDraftHover: { status: 'Draft', date: 'on Sep 1' },
			closedDraftHover: { status: 'Closed', date: 'on Sep 1' },
		});
	});

	test('removes promoted issue and pull request artifacts by stable id and keeps open and copy actions', async () => {
		const ref = (number: number, recordedReferenceId?: string): IGitHubPullRequestRef => ({
			owner: 'microsoft', repo: 'vscode', number,
			uri: URI.parse(`https://github.com/microsoft/vscode/pull/${number}`),
			recordedReferenceId,
		});
		const duplicateUri = URI.parse('https://github.com/microsoft/vscode/pull/1');
		const refs = [{ ...ref(1, 'reference-a'), uri: duplicateUri }, { ...ref(1, 'reference-b'), uri: duplicateUri }, ref(2)];
		const issueRef: IGitHubIssueRef = {
			owner: 'microsoft', repo: 'vscode', number: 3,
			uri: URI.parse('https://github.com/microsoft/vscode/issues/3'),
			recordedReferenceId: 'issue-reference',
		};
		const removed: string[] = [];
		const copied: string[] = [];
		const opened: object[] = [];
		const recordedOpenIds: string[] = [];
		const pullRequests = refs.map(ref => ({ ref, pullRequest: undefined, icon: Codicon.gitPullRequest, status: {} }));
		const commandService = upcastPartial<ICommandService>({
			executeCommand: async (command, arg) => {
				assert.ok(arg && typeof arg === 'object');
				opened.push({ command, ...arg });
				return undefined;
			},
		});
		const clipboardService = upcastPartial<IClipboardService>({ writeText: async value => { copied.push(value); } });
		const openerService = upcastPartial<IOpenerService>({});
		const sessionsService = upcastPartial<ISessionsService>({});
		const entries = buildSessionPullRequestSections(pullRequests, undefined, commandService, clipboardService, openerService, sessionsService, {
			remove: async ids => { removed.push(...ids); },
			recordOpen: id => recordedOpenIds.push(id),
		})[0].entries;
		const issueEntry = buildSessionIssueSections([{ ref: issueRef, issue: undefined }], undefined, commandService, clipboardService, openerService, sessionsService, {
			remove: async ids => { removed.push(...ids); },
			recordOpen: id => recordedOpenIds.push(id),
		})[0].entries[0];
		const unsupported = buildSessionPullRequestSections(pullRequests, undefined, commandService, clipboardService, openerService, sessionsService)[0].entries;
		await entries[0].promotedAction?.run();
		await entries[1].promotedAction?.run();
		await issueEntry.promotedAction?.run();
		for (const action of entries[0].toolbarActions ?? []) {
			await action.run();
		}
		entries[0].open();
		entries[2].open();
		issueEntry.open();

		assert.deepStrictEqual({
			ids: entries.map(entry => entry.id),
			removable: [...entries.map(entry => !!entry.promotedAction), !!issueEntry.promotedAction],
			removeLabels: [...entries, issueEntry].map(entry => entry.promotedAction && [entry.promotedAction.label, entry.promotedAction.hoverLabel]),
			toolbarLabels: entries[0].toolbarActions?.map(action => [action.label, action.hoverLabel]),
			unsupported: unsupported.map(entry => !!entry.promotedAction),
			removed, copied, recordedOpenIds, opened,
		}, {
			ids: ['reference-a', 'reference-b', refs[2].uri.toString()],
			removable: [true, true, false, true],
			removeLabels: [
				['Remove Pull Request Artifact from Session', 'Remove Artifact'],
				['Remove Pull Request Artifact from Session', 'Remove Artifact'],
				undefined,
				['Remove Issue Artifact from Session', 'Remove Artifact'],
			],
			toolbarLabels: [
				['Open Pull Request Changes', 'Open Changes'],
				['Copy pull request URL', 'Copy URL'],
			],
			unsupported: [false, false, false],
			removed: ['reference-a', 'reference-b', 'issue-reference'],
			copied: [refs[0].uri.toString(true)],
			recordedOpenIds: ['reference-a', 'issue-reference'],
			opened: [
				{ command: OPEN_PULL_REQUEST_CHANGES_ACTION_ID, pullRequest: refs[0] },
				{ command: OPEN_PULL_REQUEST_ACTION_ID, pullRequest: refs[0] },
				{ command: OPEN_PULL_REQUEST_ACTION_ID, pullRequest: refs[2] },
				{ command: OPEN_ISSUE_ACTION_ID, issue: issueRef },
			],
		});
	});

	test('groups issue URLs by repository and number and opens and copies the issue rather than its comments', async () => {
		const uri = URI.parse('https://github.com/microsoft/vscode/issues/42');
		const ref: IGitHubIssueRef = { owner: 'microsoft', repo: 'vscode', number: 42, uri: uri.with({ fragment: 'issuecomment-1' }), recordedReferenceId: 'comment-1' };
		const issue = upcastPartial<IGitHubIssue>({ title: 'Live issue title', state: GitHubIssueState.Closed, stateReason: GitHubIssueStateReason.Completed });
		const refs: IGitHubIssueRef[] = [
			ref,
			{ ...ref, owner: 'Microsoft', repo: 'VSCode', uri: URI.parse('http://www.github.com/Microsoft/VSCode/issues/42/?source=notification#issuecomment-2'), recordedReferenceId: 'comment-2' },
			{ ...ref, uri, recordedReferenceId: 'issue' },
			{ ...ref, uri, recordedReferenceId: undefined },
			ref,
			{ ...ref, number: 43, uri: URI.parse('https://github.com/microsoft/vscode/issues/43'), recordedReferenceId: undefined },
			{ ...ref, repo: 'other', uri: URI.parse('https://github.com/microsoft/other/issues/42'), recordedReferenceId: undefined },
			{ ...ref, owner: 'other', uri: URI.parse('https://github.com/other/vscode/issues/42'), recordedReferenceId: undefined },
		];
		const removed: string[][] = [];
		const copied: string[] = [];
		const opened: object[] = [];
		const entries = buildSessionIssueSections(
			refs.map((ref, index) => ({ ref, issue: index === 2 ? issue : undefined })),
			undefined,
			upcastPartial<ICommandService>({
				executeCommand: async (_command, arg) => {
					assert.ok(arg && typeof arg === 'object');
					opened.push(arg);
					return undefined;
				},
			}),
			upcastPartial<IClipboardService>({ writeText: async value => { copied.push(value); } }),
			upcastPartial<IOpenerService>({}),
			upcastPartial<ISessionsService>({}),
			{ remove: async ids => { removed.push([...ids]); } },
		)[0].entries;
		entries[0].open();
		await entries[0].toolbarActions?.[0].run();
		await entries[0].promotedAction?.run();

		assert.deepStrictEqual({
			entries: entries.map(entry => ({ id: entry.id, label: entry.label, description: entry.ariaDescription, removable: !!entry.promotedAction })),
			removed, copied, opened,
			originalUri: ref.uri.toString(true),
		}, {
			entries: [
				{ id: 'comment-1', label: 'Live issue title', description: 'Closed. https://github.com/microsoft/vscode/issues/42', removable: true },
				{ id: 'https://github.com/microsoft/vscode/issues/43', label: 'Issue', description: 'https://github.com/microsoft/vscode/issues/43', removable: false },
				{ id: 'https://github.com/microsoft/other/issues/42', label: 'Issue', description: 'https://github.com/microsoft/other/issues/42', removable: false },
				{ id: 'https://github.com/other/vscode/issues/42', label: 'Issue', description: 'https://github.com/other/vscode/issues/42', removable: false },
			],
			removed: [['comment-1', 'comment-2', 'issue']],
			copied: [uri.toString(true)],
			opened: [{ issue: { ...ref, uri } }],
			originalUri: 'https://github.com/microsoft/vscode/issues/42#issuecomment-1',
		});
	});

	test('aggregates issue icons from the same grouped identities as the dropdown', () => {
		const { instantiationService } = createServices();
		const artifacts = observableValue<readonly ISessionArtifact[]>('artifacts', [
			{ id: 'comment', kind: SessionArtifactKind.Issue, label: 'Issue 42', isArtifact: true, isGitHub: true, link: URI.parse('https://github.com/Microsoft/VSCode/issues/42#issuecomment-1') },
			{ id: 'issue', kind: SessionArtifactKind.Issue, label: 'Issue 42', isArtifact: true, isGitHub: true, link: URI.parse('https://github.com/microsoft/vscode/issues/42') },
			{ id: 'other-issue', kind: SessionArtifactKind.Issue, label: 'Issue 43', isArtifact: true, isGitHub: true, link: URI.parse('https://github.com/microsoft/vscode/issues/43') },
		]);
		const chat = upcastPartial<IChat>({ resource: URI.parse('chat:main'), title: constObservable('Chat'), status: constObservable(SessionStatus.Completed) });
		const session = upcastPartial<IActiveSession>({
			loading: constObservable(false),
			sessionId: 'quick-chat', resource: URI.parse('session:quick-chat'), artifacts,
			capabilities: constObservable({ supportsMultipleChats: false }),
			chats: constObservable([chat]),
			workspace: constObservable(undefined),
		});
		const closed = upcastPartial<IGitHubIssue>({ title: 'Closed issue', state: GitHubIssueState.Closed, stateReason: GitHubIssueStateReason.Completed });
		const otherIssue = observableValue<IGitHubIssue | undefined>('otherIssue', closed);
		instantiationService.stub(IGitHubService, upcastPartial<IGitHubService>({
			createIssueModelReference: (owner, _repo, number) => new ImmortalReference(upcastPartial<GitHubIssueModel>({
				issue: number === 43 ? otherIssue : constObservable(owner === 'microsoft' ? closed : undefined),
				refresh: async () => { }, startPolling: () => toDisposable(() => { }),
			})),
		}));
		const toolbar = store.add(instantiationService.createInstance(SessionChatInputToolbar, false, undefined));
		toolbar.setSession(session, chat);
		const presentation = () => {
			const pill = toolbar.element.querySelector('.chat-dropdown-pill-button');
			return {
				label: pill?.getAttribute('aria-label'),
				closed: !!pill?.querySelector(`.codicon-${Codicon.issueClosed.id}`),
				open: !!pill?.querySelector(`.codicon-${Codicon.issueOpened.id}`),
			};
		};
		const allClosed = presentation();
		otherIssue.set(undefined, undefined);
		const unresolvedDistinctIssue = presentation();
		otherIssue.set({ ...closed, state: GitHubIssueState.Open }, undefined);
		const openDistinctIssue = presentation();
		otherIssue.set(closed, undefined);

		assert.deepStrictEqual({ allClosed, unresolvedDistinctIssue, openDistinctIssue, resolvedAgain: presentation() }, {
			allClosed: { label: 'Show 2 issues', closed: true, open: false },
			unresolvedDistinctIssue: { label: 'Show 2 issues', closed: false, open: true },
			openDistinctIssue: { label: 'Show 2 issues', closed: false, open: true },
			resolvedAgain: { label: 'Show 2 issues', closed: true, open: false },
		});
	});

	test('shows three recorded issue links as one pill and keeps failed removals available for retry', async () => {
		const { instantiationService } = createServices();
		const artifacts = observableValue<readonly ISessionArtifact[]>('artifacts', ['', '#issuecomment-1', '#issuecomment-2'].map((fragment, index) => ({
			id: `issue-${index}`, kind: SessionArtifactKind.Issue, label: 'Recorded title', isArtifact: true, isGitHub: true,
			link: URI.parse(`https://github.com/microsoft/vscode/issues/42${fragment}`),
		})));
		const chat = upcastPartial<IChat>({ resource: URI.parse('chat:main'), title: constObservable('Chat'), status: constObservable(SessionStatus.Completed) });
		const session = upcastPartial<IActiveSession>({
			loading: constObservable(false),
			sessionId: 'quick-chat', resource: URI.parse('session:quick-chat'), artifacts,
			capabilities: constObservable({ supportsMultipleChats: false, supportsRemoveArtifacts: true }),
			chats: constObservable([chat]),
			workspace: constObservable(undefined),
		});
		instantiationService.stub(IGitHubService, upcastPartial<IGitHubService>({
			createIssueModelReference: () => new ImmortalReference(upcastPartial<GitHubIssueModel>({
				issue: constObservable(undefined), refresh: async () => { }, startPolling: () => toDisposable(() => { }),
			})),
		}));
		const removed: { owningSession: boolean; id: string }[] = [];
		let failRemoval = true;
		instantiationService.stub(ISessionsManagementService, upcastPartial<ISessionsManagementService>({
			removeSessionArtifact: async (target, id) => {
				removed.push({ owningSession: target === session, id });
				if (id === 'issue-1' && failRemoval) {
					throw new Error('offline');
				}
				artifacts.set(artifacts.get().filter(artifact => artifact.id !== id), undefined);
			},
		}));
		const errors: string[] = [];
		instantiationService.stub(INotificationService, { error: error => { errors.push(String(error)); } });
		let menu: readonly IAction[] = [];
		instantiationService.stub(IContextMenuService, { showContextMenu: delegate => { menu = delegate.getActions!(); } });
		const toolbar = store.add(instantiationService.createInstance(SessionChatInputToolbar, false, undefined));
		toolbar.setSession(session, chat);
		const presentation = () => ({
			labels: [...toolbar.element.querySelectorAll('.chat-dropdown-pill-button')].map(pill => pill.getAttribute('aria-label')),
			genericPills: toolbar.element.querySelectorAll('.chat-resource-pill-button').length,
		});
		const remove = async () => {
			const pill = toolbar.element.querySelector<HTMLElement>('.chat-dropdown-pill-button');
			assert.ok(pill);
			pill.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true }));
			const action = menu.find(action => action.id.startsWith('sessionChatPills.removeIssue.'));
			assert.ok(action);
			await action.run();
		};
		const initial = presentation();
		await remove();
		const afterFailure = { ...presentation(), ids: artifacts.get().map(artifact => artifact.id) };
		failRemoval = false;
		await remove();

		assert.deepStrictEqual({ initial, afterFailure, final: presentation(), remaining: artifacts.get(), removed, errors }, {
			initial: { labels: ['Open Issue #42: Recorded title'], genericPills: 0 },
			afterFailure: { labels: ['Open Issue #42: Recorded title'], genericPills: 0, ids: ['issue-1', 'issue-2'] },
			final: { labels: [], genericPills: 0 },
			remaining: [],
			removed: [
				{ owningSession: true, id: 'issue-0' },
				{ owningSession: true, id: 'issue-1' },
				{ owningSession: true, id: 'issue-1' },
				{ owningSession: true, id: 'issue-2' },
			],
			errors: ['Could not remove Issue #42: Recorded title from this session: offline'],
		});
	});

	for (const kind of [SessionArtifactKind.PullRequest, SessionArtifactKind.Issue]) {
		for (const isArtifact of [true, false]) {
			test(`shows and removes a workspace-less ${kind} ${isArtifact ? 'artifact in its dedicated pill' : 'reference in the references pill'}`, async () => {
				const { instantiationService } = createServices();
				const isPullRequest = kind === SessionArtifactKind.PullRequest;
				const link = URI.parse(`https://github.com/microsoft/vscode/${isPullRequest ? 'pull/42' : 'issues/337297'}`);
				const artifacts = observableValue<readonly ISessionArtifact[]>('artifacts', [{
					id: 'recorded', kind, label: 'Recorded title', isArtifact, isGitHub: true, link,
				}]);
				const chat = upcastPartial<IChat>({ resource: URI.parse('chat:main'), title: constObservable('Chat'), status: constObservable(SessionStatus.Completed) });
				const session = upcastPartial<IActiveSession>({
					loading: constObservable(false),
					sessionId: 'quick-chat', resource: URI.parse('session:quick-chat'), artifacts,
					capabilities: constObservable({ supportsMultipleChats: false, supportsRemoveArtifacts: true }),
					chats: constObservable([chat]),
					workspace: constObservable(undefined),
				});
				const modelRequests = new Set<string>();
				let modelReferenceCalls = 0;
				instantiationService.stub(IGitHubService, upcastPartial<IGitHubService>({
					createPullRequestModelReference: (owner, repo, number) => {
						modelReferenceCalls++;
						modelRequests.add(`${owner}/${repo}/pull/${number}`);
						return new ImmortalReference(upcastPartial<GitHubPullRequestModel>({ pullRequest: constObservable(undefined) }));
					},
					createIssueModelReference: (owner, repo, number) => {
						modelReferenceCalls++;
						modelRequests.add(`${owner}/${repo}/issues/${number}`);
						return new ImmortalReference(upcastPartial<GitHubIssueModel>({
							issue: constObservable(undefined), refresh: async () => { }, startPolling: () => toDisposable(() => { }),
						}));
					},
				}));
				instantiationService.stub(ISessionsService, 'setActive', () => { });
				const opened: object[] = [];
				instantiationService.stub(ICommandService, upcastPartial<ICommandService>({
					executeCommand: async (_command, arg) => {
						assert.ok(arg && typeof arg === 'object');
						opened.push(arg);
						return undefined;
					},
				}));
				const removed: { owningSession: boolean; id: string }[] = [];
				instantiationService.stub(ISessionsManagementService, upcastPartial<ISessionsManagementService>({
					removeSessionArtifact: async (target, id) => {
						removed.push({ owningSession: target === session, id });
						artifacts.set([], undefined);
					},
				}));
				let menu: readonly IAction[] = [];
				instantiationService.stub(IContextMenuService, { showContextMenu: delegate => { menu = delegate.getActions!(); } });
				const toolbar = store.add(instantiationService.createInstance(SessionChatInputToolbar, false, undefined));
				toolbar.setSession(session, chat);
				const initialModelReferenceCalls = modelReferenceCalls;
				const recordedEntries = artifacts.get();
				artifacts.set([...recordedEntries, { id: 'file', kind: SessionArtifactKind.File, label: 'Report', isArtifact: true, uri: URI.file('/report.md') }], undefined);
				artifacts.set(recordedEntries, undefined);
				const unrelatedArtifactModelRequests = modelReferenceCalls - initialModelReferenceCalls;
				const pill = toolbar.element.querySelector<HTMLElement>('.chat-dropdown-pill-button');
				assert.ok(pill);
				const initial = {
					label: pill.getAttribute('aria-label'),
					genericPills: toolbar.element.querySelectorAll('.chat-resource-pill-button').length,
				};
				if (isArtifact) {
					pill.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true }));
				}
				pill.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true }));
				const remove = menu.find(action => action.id === (isArtifact ? `sessionChatPills.remove${isPullRequest ? 'PullRequest' : 'Issue'}.recorded` : 'sessions.artifacts.remove.recorded'));
				assert.ok(remove);
				const removeLabel = remove.label;
				await remove.run();
				const ref = {
					owner: 'microsoft', repo: 'vscode', number: isPullRequest ? 42 : 337297, uri: link,
					title: 'Recorded title', recordedReferenceId: 'recorded',
				};
				assert.deepStrictEqual({
					initial, opened, removeLabel, removed, modelRequests: [...modelRequests], unrelatedArtifactModelRequests,
					remainingPills: toolbar.element.querySelectorAll('.chat-dropdown-pill-button, .chat-resource-pill-button').length,
				}, isArtifact ? {
					initial: { label: `Open ${isPullRequest ? 'Pull Request #42' : 'Issue #337297'}: Recorded title`, genericPills: 0 },
					opened: [isPullRequest ? { pullRequest: { ...ref, createdByThisSession: true } } : { issue: ref }],
					removeLabel: `Remove ${isPullRequest ? 'Pull Request' : 'Issue'} Artifact from Session`,
					removed: [{ owningSession: true, id: 'recorded' }],
					modelRequests: [`microsoft/vscode/${isPullRequest ? 'pull/42' : 'issues/337297'}`],
					unrelatedArtifactModelRequests: 0,
					remainingPills: 0,
				} : {
					// A reference never reaches the dedicated pill, so no live GitHub model is requested for it.
					initial: { label: 'Show 1 reference', genericPills: 0 },
					opened: [],
					removeLabel: 'Remove Reference Recorded title from Session',
					removed: [{ owningSession: true, id: 'recorded' }],
					modelRequests: [],
					unrelatedArtifactModelRequests: 0,
					remainingPills: 0,
				});
			});
		}
	}

	test('promotes matched artifacts and references, groups artifacts sharing an integration, keeps unmatched entries grouped, and scopes removal to the clicked pill', async () => {
		const { instantiationService, configuration } = createServices();
		const setEnabled = async (enabled: boolean) => {
			await configuration.setUserConfiguration(ArtifactIntegrationsSettingId, enabled);
			configuration.onDidChangeConfigurationEmitter.fire(upcastPartial<IConfigurationChangeEvent>({
				affectsConfiguration: setting => setting === ArtifactIntegrationsSettingId,
			}));
			await timeout(0);
		};
		const chat = upcastPartial<IChat>({ resource: URI.parse('chat:main'), title: constObservable('Chat'), status: constObservable(SessionStatus.Completed) });
		const records: readonly ISessionArtifact[] = [
			{ id: 'one', kind: SessionArtifactKind.Website, label: 'One', isArtifact: true, link: URI.parse('https://experiments.test/one') },
			{ id: 'two', kind: SessionArtifactKind.Website, label: 'Two', isArtifact: true, link: URI.parse('https://experiments.test/two') },
			{ id: 'reference', kind: SessionArtifactKind.Website, label: 'Reference', isArtifact: false, link: URI.parse('https://experiments.test/reference') },
			{ id: 'plain', kind: SessionArtifactKind.Website, label: 'Plain', isArtifact: true, link: URI.parse('https://example.test/plain') },
		];
		const artifacts = observableValue('artifacts', records);
		const session = upcastPartial<IActiveSession>({
			sessionId: 'quick-chat', resource: URI.parse('session:quick-chat'), artifacts,
			loading: constObservable(false),
			capabilities: constObservable({ supportsMultipleChats: false, supportsRemoveArtifacts: true, supportsArtifactIntegrations: true }),
			chats: constObservable([chat]), workspace: constObservable(undefined),
		});
		const snapshots = new Map(records.map(record => [record.id, observableValue<ArtifactSnapshot>(record.id, {
			authority: { id: 'client', targetHost: 'vendor', location: 'client' }, session: 'vendor-session://opaque',
			artifact: { id: record.id, label: record.label, resource: record.link!.toString(), isArtifact: record.isArtifact },
			contributions: [], runs: [],
		})]));
		const removed: string[] = [];
		const acquired: string[] = [];
		let menu: readonly IAction[] = [];
		instantiationService.stub(IGitHubService, upcastPartial<IGitHubService>({}));
		instantiationService.stub(IContextMenuService, {
			showContextMenu: delegate => {
				assert.ok(delegate.getActions);
				menu = delegate.getActions();
			},
		});
		instantiationService.stub(ISessionsManagementService, upcastPartial<ISessionsManagementService>({
			onDidChangeSessions: Event.None,
			acquireArtifactIntegration: async (_session, id) => {
				acquired.push(id);
				return new ImmortalReference(upcastPartial<IArtifactModel>({ snapshot: snapshots.get(id)! }));
			},
			removeSessionArtifact: async (_session, id) => {
				removed.push(id);
				artifacts.set(artifacts.get().filter(record => record.id !== id), undefined);
			},
		}));
		const toolbar = store.add(instantiationService.createInstance(SessionChatInputToolbar, false, undefined));
		toolbar.setSession(session, chat);
		await timeout(0);
		const initial = {
			integrated: toolbar.element.querySelectorAll('.artifact-integration-pill').length,
			grouped: !!toolbar.element.querySelector('[aria-label="Show 3 artifacts"]'),
			acquired: acquired.length,
		};
		await setEnabled(true);
		for (const id of ['one', 'two', 'reference']) {
			const snapshot = snapshots.get(id)!;
			snapshot.set({
				...snapshot.get(), mainIntegrationId: 'experiments',
				contributions: [{
					integrationId: 'experiments', label: 'Experiments', actions: [], options: [],
					configuration: { revision: 0, values: {}, generations: {}, disablements: {} },
					view: {
						availability: { kind: 'available' }, main: { icon: { id: 'beaker' }, label: id, detailsId: 'main' },
						sections: [], stateActions: [], generalActions: [], automationAvailability: [],
					},
				}],
			}, undefined);
		}
		const integrated = [...toolbar.element.querySelectorAll<HTMLElement>('.artifact-integration-pill')];
		const group = toolbar.element.querySelector<HTMLElement>('.artifact-integration-group-pill')!;
		const promoted = {
			labels: integrated.map(pill => pill.querySelector('.chat-pill-label')?.textContent),
			// Artifacts sharing an integration share one pill; the reference keeps its own.
			group: group.querySelector('.chat-pill-label')?.textContent,
			referencesGrouped: !!toolbar.element.querySelector('[aria-label="Show 1 reference"]'),
			artifactsGrouped: !!toolbar.element.querySelector('[aria-label="Show 3 artifacts"]'),
		};
		group.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true }));
		const groupRemovalIds = menu.filter(action => action.id.startsWith('sessions.artifacts.remove.')).map(action => action.id);
		integrated[0].dispatchEvent(new MouseEvent('contextmenu', { bubbles: true }));
		const removalIds = menu.filter(action => action.id.startsWith('sessions.artifacts.remove.')).map(action => action.id);
		await menu.find(action => action.id === 'sessions.artifacts.remove.reference')!.run();
		snapshots.get('two')!.set({ ...snapshots.get('two')!.get(), contributions: [], mainIntegrationId: undefined }, undefined);
		assert.deepStrictEqual({
			initial, promoted, groupRemovalIds, removalIds, removed,
			remaining: [...toolbar.element.querySelectorAll('.artifact-integration-pill .chat-pill-label')].map(label => label.textContent),
			groupRemaining: !!toolbar.element.querySelector('.artifact-integration-group-pill'),
			regrouped: !!toolbar.element.querySelector('[aria-label="Show 2 artifacts"]'),
		}, {
			initial: { integrated: 0, grouped: true, acquired: 0 },
			promoted: { labels: ['reference'], group: 'Experiments (2)', referencesGrouped: false, artifactsGrouped: false },
			groupRemovalIds: [], removalIds: ['sessions.artifacts.remove.reference'], removed: ['reference'],
			remaining: ['one'], groupRemaining: false, regrouped: true,
		});
		await setEnabled(false);
		const disabled = {
			pills: toolbar.element.querySelectorAll('.artifact-integration-pill').length,
			grouped: !!toolbar.element.querySelector('[aria-label="Show 3 artifacts"]'),
		};
		await setEnabled(true);
		assert.deepStrictEqual({ disabled, restored: toolbar.element.querySelectorAll('.artifact-integration-pill').length }, {
			disabled: { pills: 0, grouped: true }, restored: 1,
		});
	});

	test('pins an artifact out of its integration group from the dropdown and unpins it back from its own pill', async () => {
		const { instantiationService } = createServices(true);
		const host = mainWindow.document.body.appendChild(document.createElement('div'));
		host.classList.add('monaco-workbench');
		host.style.cssText = 'position:fixed;top:0;left:0;width:720px;height:600px;';
		store.add(toDisposable(() => host.remove()));
		instantiationService.stub(ILayoutService, upcastPartial<ILayoutService>({
			mainContainer: host, activeContainer: host, onDidLayoutContainer: Event.None, getContainer: () => host,
			get mainContainerDimension() { return { width: 720, height: 600 }; },
		}));
		instantiationService.stub(IContextViewService, store.add(instantiationService.createInstance(ContextViewService)));
		const chat = upcastPartial<IChat>({ resource: URI.parse('chat:main'), title: constObservable('Chat'), status: constObservable(SessionStatus.Completed) });
		const records: readonly ISessionArtifact[] = ['one', 'two', 'three'].map(id => ({
			id, kind: SessionArtifactKind.Website, label: `Recorded ${id}`, isArtifact: true, link: URI.parse(`https://experiments.test/${id}`),
		}));
		const session = upcastPartial<IActiveSession>({
			sessionId: 'quick-chat', providerId: 'provider', resource: URI.parse('session:quick-chat'), artifacts: constObservable(records),
			loading: constObservable(false),
			capabilities: constObservable({ supportsMultipleChats: false, supportsRemoveArtifacts: true, supportsArtifactIntegrations: true }),
			chats: constObservable([chat]), workspace: constObservable(undefined),
		});
		const priorities: Record<string, number> = { one: 1, two: 3, three: 2 };
		let menu: readonly IAction[] = [];
		instantiationService.stub(IGitHubService, upcastPartial<IGitHubService>({}));
		instantiationService.stub(IContextMenuService, {
			showContextMenu: delegate => {
				assert.ok(delegate.getActions);
				menu = delegate.getActions();
			},
		});
		instantiationService.stub(ISessionsManagementService, upcastPartial<ISessionsManagementService>({
			onDidChangeSessions: Event.None,
			acquireArtifactIntegration: async (_session, id) => new ImmortalReference(upcastPartial<IArtifactModel>({
				snapshot: constObservable<ArtifactSnapshot>({
					authority: { id: 'client', targetHost: 'vendor', location: 'client' }, session: 'vendor-session://opaque',
					artifact: { id, label: `Recorded ${id}`, resource: `https://experiments.test/${id}`, isArtifact: true },
					mainIntegrationId: 'experiments', runs: [],
					contributions: [{
						integrationId: 'experiments', label: 'Experiment', groupLabel: 'Experiments', actions: [], options: [],
						configuration: { revision: 0, values: {}, generations: {}, disablements: {} },
						view: {
							availability: { kind: 'available' }, main: { icon: { id: 'beaker' }, label: id, detailsId: 'main' },
							group: { icon: { id: priorities[id] === 3 ? 'error' : 'beaker' }, priority: priorities[id] },
							sections: [], stateActions: [], generalActions: [], automationAvailability: [],
						},
					}],
				}),
			})),
		}));
		const toolbar = store.add(instantiationService.createInstance(SessionChatInputToolbar, false, undefined));
		host.appendChild(toolbar.element);
		toolbar.setSession(session, chat);
		await timeout(0);
		const describe = () => ({
			group: toolbar.element.querySelector('.artifact-integration-group-pill .chat-pill-label')?.textContent,
			groupIcon: toolbar.element.querySelector('.artifact-integration-group-pill .codicon')?.classList.contains('codicon-error'),
			singles: [...toolbar.element.querySelectorAll<HTMLElement>('.artifact-integration-pill')].map(pill => ({
				label: pill.querySelector('.chat-pill-label')?.textContent,
				unpin: pill.classList.contains('has-promoted-action') ? pill.querySelector('.chat-pill-promoted-action')?.getAttribute('aria-label') : undefined,
			})),
		});
		const grouped = describe();
		toolbar.element.querySelector<HTMLElement>('.artifact-integration-group-pill > .chat-pill-button')!.click();
		const rows = [...host.querySelectorAll<HTMLElement>('.artifact-group-row')];
		const pin = [...rows[1].querySelectorAll<HTMLElement>('.artifact-group-row-action')].find(action => action.getAttribute('aria-label') === 'Pin Recorded two')!;
		pin.click();
		await timeout(0);
		const pinned = { ...describe(), dropdownRows: [...host.querySelectorAll('.artifact-group-row .artifact-group-row-label')].map(label => label.textContent) };
		toolbar.element.querySelector<HTMLElement>('.artifact-integration-pill.has-promoted-action')!.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true }));
		await menu.find(action => action.id.startsWith('chatInputPills.artifacts.unpin.'))!.run();
		await timeout(0);
		assert.deepStrictEqual({ grouped, pinned, unpinned: describe() }, {
			grouped: { group: '3 Experiments', groupIcon: true, singles: [] },
			pinned: { group: '2 Experiments', groupIcon: false, singles: [{ label: 'two', unpin: 'Unpin Recorded two' }], dropdownRows: ['one', 'three'] },
			unpinned: { group: '3 Experiments', groupIcon: true, singles: [] },
		});
	});

	test('decorates a promoted PR as a details disclosure and leaves reference links plain', async () => {
		const { instantiationService } = createServices(true);
		const link = URI.parse('https://github.com/microsoft/vscode/pull/42');
		const chat = upcastPartial<IChat>({ resource: URI.parse('chat:main'), title: constObservable('Chat'), status: constObservable(SessionStatus.Completed) });
		const artifacts = observableValue<readonly ISessionArtifact[]>('artifacts', [
			{ id: 'recorded', kind: SessionArtifactKind.PullRequest, label: 'Recorded title', isArtifact: true, isGitHub: true, link },
			{ id: 'reference', kind: SessionArtifactKind.PullRequest, label: 'Reference title', isArtifact: false, isGitHub: true, link: URI.parse('https://github.com/microsoft/vscode/pull/43') },
		]);
		const session = upcastPartial<IActiveSession>({
			sessionId: 'quick-chat', resource: URI.parse('session:quick-chat'), artifacts,
			loading: constObservable(false),
			capabilities: constObservable({ supportsMultipleChats: false, supportsRemoveArtifacts: true, supportsArtifactIntegrations: true }),
			chats: constObservable([chat]), workspace: constObservable(undefined),
		});
		const snapshot = observableValue<ArtifactSnapshot>('integrated PR', {
			authority: { id: 'host', targetHost: 'self', location: 'host' }, session: 'session:quick-chat',
			artifact: { id: 'recorded', label: 'Recorded title', resource: link.toString(), isArtifact: true },
			mainIntegrationId: 'github.pullRequest', runs: [],
			contributions: [{
				integrationId: 'github.pullRequest', label: 'GitHub Pull Request', actions: [], options: [],
				configuration: { revision: 0, values: {}, generations: {}, disablements: {} },
				view: {
					availability: { kind: 'available' },
					main: { icon: { id: 'git-pull-request' }, label: '#42', detailsId: 'main' },
					sections: [
						{ id: 'checks', icon: { id: 'pending' }, label: '3/5', detailsId: 'checks' },
						{ id: 'comments', icon: { id: 'comment-discussion' }, label: '2', detailsId: 'comments' },
					],
					stateActions: [], generalActions: [], automationAvailability: [],
				},
			}],
		});
		instantiationService.stub(IGitHubService, upcastPartial<IGitHubService>({
			createPullRequestModelReference: () => new ImmortalReference(upcastPartial<GitHubPullRequestModel>({ pullRequest: constObservable(undefined) })),
		}));
		instantiationService.stub(ISessionsManagementService, upcastPartial<ISessionsManagementService>({
			onDidChangeSessions: Event.None,
			acquireArtifactIntegration: async (_session, id) => new ImmortalReference(upcastPartial<IArtifactModel>({
				snapshot: id === 'recorded' ? snapshot : constObservable({ ...snapshot.get(), artifact: { id, label: 'Reference', resource: link.toString() }, contributions: [] }),
				acquireDetails: async () => ({ details: constObservable({ title: 'Recorded title', availability: { kind: 'available' as const }, items: [], links: [], completeness: 'complete' as const }), dispose: () => { } }),
			})),
		}));
		let opened = 0;
		instantiationService.stub(ISessionsService, 'setActive', () => { });
		instantiationService.stub(ICommandService, upcastPartial<ICommandService>({ executeCommand: async () => { opened++; return undefined; } }));
		const toolbar = store.add(instantiationService.createInstance(SessionChatInputToolbar, false, undefined));
		toolbar.setSession(session, chat);
		store.add(autorun(reader => toolbar.activityBarActions.read(reader)));
		await timeout(0);
		const labels = () => [...toolbar.element.querySelectorAll('.artifact-integration-pill .chat-pill-label')].map(element => element.textContent);
		const initial = labels();
		const contribution = snapshot.get().contributions[0];
		snapshot.set({ ...snapshot.get(), contributions: [{ ...contribution, view: { ...contribution.view, sections: [contribution.view.sections[0]] } }] }, undefined);
		toolbar.element.querySelector<HTMLElement>('.artifact-integration-pill .chat-dropdown-pill-button')!.click();
		await toolbar.activityBarActions.get()[0].run();
		assert.deepStrictEqual({
			initial, updated: labels(), integratedPills: toolbar.element.querySelectorAll('.artifact-integration-pill').length, opened,
			referencesPresent: !!toolbar.element.querySelector('.chat-dropdown-pill-button[aria-label="Show 1 reference"]'),
		}, { initial: ['#42', '3/5', '2'], updated: ['#42', '3/5'], integratedPills: 1, opened: 1, referencesPresent: true });
	});
	for (const providerId of [LOCAL_AGENT_HOST_PROVIDER_ID, `${REMOTE_AGENT_HOST_PROVIDER_PREFIX}custom-host`]) {
		test(`renders the explicitly selected PR above the main input with automatic association disabled on ${providerId}`, () => {
			const { instantiationService } = createServices();
			instantiationService.stub(ISessionsProvidersService, 'getProvider', () => upcastPartial<IAgentHostSessionsProvider>({
				id: providerId,
				onDidChangeRootConfig: Event.None,
				getRootConfig: () => ({
					schema: { type: 'object', properties: {} },
					values: { [AgentHostAutoAttachPullRequestsConfigKey]: false },
				}),
				getAgentMergeClientStateObservable: () => constObservable(undefined),
			}));
			instantiationService.stub(IGitHubService, upcastPartial<IGitHubService>({
				createPullRequestModelReference: () => new ImmortalReference(upcastPartial<GitHubPullRequestModel>({ pullRequest: constObservable(undefined) })),
			}));
			const selected = {
				owner: 'owner', repo: 'repo', number: 105, uri: URI.parse('https://github.com/owner/repo/pull/105'),
				createdByThisSession: true, recordedReferenceId: 'selected-pr',
			};
			const root = URI.file('/repo.worktrees/pr-105-session');
			const workspace = constObservable(upcastPartial<ISessionWorkspace>({
				folders: [{
					root, workingDirectory: root, name: 'repo', description: undefined,
					gitRepository: {
						uri: root, workTreeUri: root, baseBranchName: 'main', gitHubInfo: constObservable({
							owner: selected.owner, repo: selected.repo,
							pullRequests: [selected, { owner: selected.owner, repo: selected.repo, number: 106, uri: URI.parse('https://github.com/owner/repo/pull/106'), createdByThisSession: true }],
						})
					},
				}],
			}));
			const chat = (id: string) => upcastPartial<IChat>({
				resource: URI.parse(`custom-chat://host/${id}`), workspace, title: constObservable(id), status: constObservable(SessionStatus.Completed),
				changesets: constObservable([]), changes: constObservable([]),
			});
			const main = chat('main');
			const peer = chat('peer');
			const session = upcastPartial<IActiveSession>({
				loading: constObservable(false),
				providerId, sessionId: 'pr-session', resource: URI.parse('custom-session://host/pr-session'), workspace,
				artifacts: constObservable([{
					id: 'selected-pr', chat: main.resource, kind: SessionArtifactKind.PullRequest, label: '', isArtifact: true, isGitHub: true, link: selected.uri,
				}]), mainChat: constObservable(main), chats: constObservable([main, peer]),
				capabilities: constObservable({ supportsMultipleChats: true }),
			});
			const toolbar = store.add(instantiationService.createInstance(SessionChatInputToolbar, false, undefined));
			const pill = () => toolbar.element.querySelector('.chat-dropdown-pill-button[aria-label^="Open Pull Request"]')?.getAttribute('aria-label') ?? null;
			toolbar.setSession(session, main);
			const mainPill = pill();
			toolbar.setSession(session, peer);
			const peerPill = pill();
			toolbar.setSession(session, main);

			assert.deepStrictEqual({ mainPill, peerPill, restoredMainPill: pill() }, {
				mainPill: 'Open Pull Request #105',
				peerPill: null,
				restoredMainPill: 'Open Pull Request #105',
			});
		});

		test(`PR pills follow chat ownership and react to automatic association on ${providerId}`, async () => {
			const { instantiationService } = createServices();
			const onDidChangeRootConfig = store.add(new Emitter<void>());
			const schema: RootConfigState['schema'] = {
				type: 'object', properties: { [AgentHostAutoAttachPullRequestsConfigKey]: { type: 'boolean', title: 'Automatic Pull Request Association', default: true } },
			};
			let config: RootConfigState | undefined = {
				schema,
				values: { [AgentHostAutoAttachPullRequestsConfigKey]: false },
			};
			const provider = upcastPartial<IAgentHostSessionsProvider>({
				id: providerId,
				onDidChangeRootConfig: onDidChangeRootConfig.event,
				getRootConfig: () => config,
				getAgentMergeClientStateObservable: () => constObservable(undefined),
			});
			instantiationService.stub(ISessionsProvidersService, 'getProvider', () => provider);
			const ref = { owner: 'owner', repo: 'repo', number: 42, uri: URI.parse('https://github.com/owner/repo/pull/42'), createdByThisSession: true };
			instantiationService.stub(IGitHubService, upcastPartial<IGitHubService>({
				createPullRequestModelReference: () => new ImmortalReference(upcastPartial<GitHubPullRequestModel>({ pullRequest: constObservable(undefined) })),
			}));
			const root = URI.file('/shared');
			const workspace = constObservable(upcastPartial<ISessionWorkspace>({
				folders: [{
					root, workingDirectory: root, name: 'shared', description: undefined,
					gitRepository: { uri: root, workTreeUri: undefined, baseBranchName: undefined, gitHubInfo: constObservable({ owner: ref.owner, repo: ref.repo, pullRequests: [ref] }) },
				}],
			}));
			const chat = (id: string) => upcastPartial<IChat>({
				resource: URI.parse(`custom-chat://host/${id}`), workspace, title: constObservable(id), status: constObservable(SessionStatus.Completed),
				changesets: constObservable([]), changes: constObservable([]),
			});
			const main = chat('main');
			const peer = chat('peer');
			const artifacts = observableValue<readonly ISessionArtifact[]>('artifacts', [{
				id: 'peer-pr', chat: peer.resource, kind: SessionArtifactKind.PullRequest, label: 'Peer PR', isArtifact: true, isGitHub: true, link: ref.uri,
			}]);
			const session = upcastPartial<IActiveSession>({
				loading: constObservable(false),
				providerId, sessionId: 'shared', resource: URI.parse('custom-session://host/shared'), workspace, artifacts,
				mainChat: constObservable(main), chats: constObservable([main, peer]),
				capabilities: constObservable({ supportsMultipleChats: true }),
			});
			const toolbar = store.add(instantiationService.createInstance(SessionChatInputToolbar, false, undefined));
			store.add(autorun(reader => toolbar.activityBarActions.read(reader)));
			const activityBarLabels: (string | null)[] = [];
			const pill = () => {
				activityBarLabels.push(toolbar.activityBarActions.get().find(action => action.id === OPEN_PULL_REQUEST_ACTION_ID)?.label ?? null);
				return toolbar.element.querySelector('.chat-dropdown-pill-button[aria-label^="Open Pull Request"]')?.getAttribute('aria-label') ?? null;
			};
			toolbar.setSession(session, main);
			await timeout(0);
			const restrictedMain = pill();
			toolbar.setSession(session, peer);
			await timeout(0);
			const restrictedPeer = pill();
			toolbar.setSession(session, main);
			config = { schema, values: { [AgentHostAutoAttachPullRequestsConfigKey]: true } };
			onDidChangeRootConfig.fire();
			await timeout(0);
			const automaticMain = pill();
			config = { schema, values: { [AgentHostAutoAttachPullRequestsConfigKey]: false } };
			onDidChangeRootConfig.fire();
			await timeout(0);
			const restrictedAgain = pill();
			config = {
				schema: { ...schema, properties: { [AgentHostAutoAttachPullRequestsConfigKey]: { type: 'boolean', title: 'Automatic Pull Request Association', default: false } } },
				values: {},
			};
			onDidChangeRootConfig.fire();
			await timeout(0);
			const restrictedDefault = pill();
			config = undefined;
			onDidChangeRootConfig.fire();
			await timeout(0);
			const absentExtension = pill();
			assert.deepStrictEqual({ restrictedMain, restrictedPeer, automaticMain, restrictedAgain, restrictedDefault, absentExtension, activityBarLabels }, {
				restrictedMain: null,
				restrictedPeer: 'Open Pull Request #42: Peer PR',
				automaticMain: 'Open Pull Request #42',
				restrictedAgain: null,
				restrictedDefault: null,
				absentExtension: 'Open Pull Request #42',
				activityBarLabels: [null, 'Open Pull Request #42: Peer PR', 'Open Pull Request #42', null, null, 'Open Pull Request #42'],
			});
		});
	}

	test('pull request artifact removal reacts to capabilities, targets the owning session, and reports errors without hiding data', async () => {
		const { instantiationService } = createServices();
		const ref: IGitHubPullRequestRef = { owner: 'microsoft', repo: 'vscode', number: 1, uri: URI.parse('https://github.com/microsoft/vscode/pull/1'), recordedReferenceId: 'pr-artifact' };
		const artifacts = observableValue<readonly ISessionArtifact[]>('artifacts', [{
			id: 'pr-artifact', kind: SessionArtifactKind.PullRequest, label: 'PR', isArtifact: true, isGitHub: true, link: ref.uri,
		}, {
			id: 'durable-artifact', kind: SessionArtifactKind.File, label: 'Plan', isArtifact: true, uri: URI.file('/repo/plan.md'),
		}]);
		const capabilities = observableValue('capabilities', { supportsMultipleChats: false, supportsRemoveArtifacts: false });
		const gitHubInfo = observableValue('gitHubInfo', { owner: ref.owner, repo: ref.repo, pullRequests: [ref] });
		const chat = upcastPartial<IChat>({ resource: URI.parse('chat:main'), title: constObservable('Chat'), status: constObservable(SessionStatus.Completed) });
		const session = upcastPartial<IActiveSession>({
			loading: constObservable(false),
			sessionId: 'owning-session', resource: URI.parse('session:owning'), artifacts, capabilities,
			chats: constObservable([chat]),
			workspace: constObservable(upcastPartial<ISessionWorkspace>({
				folders: [{
					root: URI.file('/repo'), workingDirectory: URI.file('/repo'), name: 'repo', description: undefined,
					gitRepository: { uri: URI.file('/repo'), workTreeUri: undefined, baseBranchName: 'main', gitHubInfo },
				}],
			})),
		});
		instantiationService.stub(IGitHubService, upcastPartial<IGitHubService>({
			createPullRequestModelReference: () => new ImmortalReference(upcastPartial<GitHubPullRequestModel>({ pullRequest: constObservable(undefined) })),
		}));
		const calls: { owningSession: boolean; artifactId: string }[] = [];
		instantiationService.stub(ISessionsManagementService, upcastPartial<ISessionsManagementService>({
			removeSessionArtifact: async (target, artifactId) => {
				calls.push({ owningSession: target === session, artifactId });
				if (calls.length === 1) {
					throw new Error('offline');
				}
				artifacts.set(artifacts.get().filter(artifact => artifact.id !== artifactId), undefined);
				gitHubInfo.set({ owner: ref.owner, repo: ref.repo, pullRequests: [] }, undefined);
			},
		}));
		const errors: string[] = [];
		instantiationService.stub(INotificationService, { error: error => { errors.push(String(error)); } });
		let menu: readonly IAction[] = [];
		instantiationService.stub(IContextMenuService, { showContextMenu: delegate => { menu = delegate.getActions!(); } });
		const toolbar = store.add(instantiationService.createInstance(SessionChatInputToolbar, false, undefined));
		toolbar.setSession(session, chat);
		const removal = () => {
			const target = toolbar.element.querySelector<HTMLElement>('.chat-dropdown-pill-button');
			if (!target) {
				return undefined;
			}
			target.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true }));
			return menu.find(action => action.id.startsWith('sessionChatPills.removePullRequest.'));
		};
		const unavailable = !!removal();
		capabilities.set({ supportsMultipleChats: false, supportsRemoveArtifacts: true }, undefined);
		await removal()?.run();
		const afterFailure = { removable: !!removal(), artifacts: artifacts.get().map(artifact => artifact.id) };
		await removal()?.run();

		assert.deepStrictEqual({
			unavailable, afterFailure, errors,
			calls,
			afterSuccess: {
				removable: !!removal(),
				artifactRemovable: (() => {
					const target = toolbar.element.querySelector<HTMLElement>('.chat-resource-pill-button');
					target?.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true }));
					return menu.some(action => action.id === 'sessions.artifacts.remove.durable-artifact');
				})(),
				artifacts: artifacts.get().map(artifact => artifact.id),
				label: toolbar.element.querySelector('.chat-pill-label')?.textContent,
			},
		}, {
			unavailable: false,
			afterFailure: { removable: true, artifacts: ['pr-artifact', 'durable-artifact'] },
			errors: ['Could not remove Pull Request #1: PR from this session: offline'],
			calls: [{ owningSession: true, artifactId: 'pr-artifact' }, { owningSession: true, artifactId: 'pr-artifact' }],
			afterSuccess: { removable: false, artifactRemovable: true, artifacts: ['durable-artifact'], label: undefined },
		});
	});

	test('keeps derived changes and browser pills out of session record removal', async () => {
		const { instantiationService } = createServices();
		const artifacts = observableValue<readonly ISessionArtifact[]>('artifacts', [{
			id: 'durable-artifact', kind: SessionArtifactKind.File, label: 'Plan', isArtifact: true, uri: URI.file('/repo/plan.md'),
		}]);
		const workspace = constObservable(upcastPartial<ISessionWorkspace>({
			folders: [{
				root: URI.file('/repo'), workingDirectory: URI.file('/repo'), name: 'repo', description: undefined,
				gitRepository: { uri: URI.file('/repo'), workTreeUri: undefined, baseBranchName: 'main', gitHubInfo: constObservable(undefined) },
			}],
		}));
		const changes = constObservable([{ modifiedUri: URI.file('/repo/changed.ts'), insertions: 3, deletions: 1 }]);
		const chat = upcastPartial<IChat>({
			resource: URI.parse('chat:main'),
			title: constObservable('Chat'),
			status: constObservable(SessionStatus.Completed),
			workspace,
			changesets: constObservable([]),
			changes,
		});
		// A browser the agent opened, and a file diff: both are live/derived state
		// rather than recorded artifact records, so neither may offer record removal.
		const browser = upcastPartial<BrowserEditorInput>({
			id: 'browser-1', title: 'Example Page', url: 'https://example.com', onDidChangeLabel: Event.None,
			model: upcastPartial<BrowserEditorInput['model']>({ owner: { type: 'agent', sessionId: chat.resource.toString() } }),
		});
		const session = upcastPartial<IActiveSession>({
			loading: constObservable(false),
			sessionId: 'owning-session', resource: URI.parse('session:owning'), artifacts,
			capabilities: constObservable({ supportsMultipleChats: false, supportsRemoveArtifacts: true }),
			chats: constObservable([chat]),
			workspace,
		});
		instantiationService.stub(IBrowserViewWorkbenchService, upcastPartial<IBrowserViewWorkbenchService>({
			onDidChangeBrowserViews: Event.None, getKnownBrowserViews: () => new Map([['browser-1', browser]]),
		}));
		instantiationService.stub(IGitHubService, upcastPartial<IGitHubService>({
			createPullRequestModelReference: () => new ImmortalReference(upcastPartial<GitHubPullRequestModel>({ pullRequest: constObservable(undefined) })),
		}));
		const removeCalls: string[] = [];
		instantiationService.stub(ISessionsManagementService, upcastPartial<ISessionsManagementService>({
			removeSessionArtifact: async (_target, artifactId) => { removeCalls.push(artifactId); },
		}));
		let menu: readonly IAction[] = [];
		instantiationService.stub(IContextMenuService, { showContextMenu: delegate => { menu = delegate.getActions!(); } });
		const toolbar = store.add(instantiationService.createInstance(SessionChatInputToolbar, false, undefined));
		toolbar.setSession(session, chat);

		const pills = Array.from(toolbar.element.querySelectorAll<HTMLElement>(
			'.chat-pill-button, .chat-changes-pill-button, .chat-dropdown-pill-button, .chat-resource-pill-button'));
		const removeActions: IAction[] = [];
		for (const pill of pills) {
			menu = [];
			pill.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true }));
			removeActions.push(...menu.filter(action => /remove/i.test(action.id)));
		}
		for (const action of removeActions) {
			await action.run();
		}

		assert.deepStrictEqual({
			// The browsers and changes pills rendered, so the negative result below is not vacuous.
			renderedPills: pills.length >= 3,
			removeActionIds: removeActions.map(action => action.id),
			removeCalls,
		}, {
			renderedPills: true,
			// Only the recorded artifact is removable; the browser and the file diff are not.
			removeActionIds: ['sessions.artifacts.remove.durable-artifact'],
			removeCalls: ['durable-artifact'],
		});
	});
});
