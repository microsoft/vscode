/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RunOnceScheduler } from '../../../../../../base/common/async.js';
import { Event } from '../../../../../../base/common/event.js';
import { Disposable, DisposableMap, DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { ResourceSet } from '../../../../../../base/common/map.js';
import { autorun, derived, IObservable, observableValue } from '../../../../../../base/common/observable.js';
import { extUriBiasedIgnorePathCase } from '../../../../../../base/common/resources.js';
import { URI } from '../../../../../../base/common/uri.js';
import { localize } from '../../../../../../nls.js';
import { ContextKeyExpr } from '../../../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { IWorkspaceContextService } from '../../../../../../platform/workspace/common/workspace.js';
import { IsSessionsWindowContext, RemoteNameContext } from '../../../../../common/contextkeys.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../../common/contributions.js';
import { registerOnboardingTargetProvider } from '../../../../onboarding/browser/spotlight/onboardingTarget.js';
import { ISpotlightPayload, SPOTLIGHT_PRESENTATION_KIND } from '../../../../onboarding/browser/spotlight/spotlightTypes.js';
import { onboardingScenarioRegistry } from '../../../../onboarding/common/onboardingRegistry.js';
import { IOnboardingScenario } from '../../../../onboarding/common/onboardingScenario.js';
import { IOnboardingScenarioService } from '../../../../onboarding/common/onboardingScenarioService.js';
import { ChatContextKeys } from '../../../common/actions/chatContextKeys.js';
import { ChatAgentLocation, ChatConfiguration } from '../../../common/constants.js';
import { isUntitledChatSession } from '../../../common/model/chatUri.js';
import { IChatWidget, IChatWidgetService } from '../../chat.js';
import { IChatViewHostService } from '../../chatViewHost.js';
import { IAgentSessionsService } from '../agentSessionsService.js';
import { IAgentHostNewSessionFolderService } from './agentHostNewSessionFolderService.js';
import { ChatAgentHostFolderChipVisible, ChatAgentHostNewWorktreeSelected, ChatAgentHostNewWorktreeToggleVisible, getWorktreeControl } from './agentHostNewWorktreeToggle.js';
import { IAgentHostWorktreeSessionSources } from './agentHostWorktreeSessionSources.js';

export const AGENT_HOST_WORKTREE_HINT_ID = 'chat.agentHost.worktreeHint';
const AGENT_HOST_WORKTREE_HINT_TARGET_ID = 'chat.agentHost.worktreeControl';
/** Keys of a chat input that decide whether it shows a worktree control, and whether that is set to a new worktree. */
const CONTROL_KEYS = new Set([ChatAgentHostFolderChipVisible.key, ChatAgentHostNewWorktreeToggleVisible.key, ChatAgentHostNewWorktreeSelected.key]);

/**
 * A one-time hint on the chat input's worktree control, once a chat of the window worked in the window's own folder and the
 * user starts another new chat there: that it can work in a new worktree instead, separately from the others.
 *
 * It shows in a new, empty chat of the local agent host that works in the window's own folder, while its input offers a
 * worktree control and has no text, so that it never takes the focus from what the user types. The onboarding engine shows
 * it once per profile, one spotlight at a time, and only with AI features on, worktree support on, in a local editor window.
 */
export class AgentHostWorktreeHint extends Disposable {

	/** Waits for a new chat's input to render its worktree control, and for a quick edit to settle, before it shows. */
	static readonly SETTLE_DELAY_MS = 500;

	private readonly _readyChat = observableValue<IChatWidget | undefined>(this, undefined);
	readonly signal: IObservable<boolean> = derived(this, reader => !!this._readyChat.read(reader));

	/** Chats that a first request started in this window, until it is known where they work. */
	private readonly _started = new ResourceSet();
	private _workedInFolder = false;
	private readonly _widgets = this._register(new DisposableMap<IChatWidget>());
	private readonly _listeners = this._register(new DisposableStore());
	private readonly _update = this._register(new RunOnceScheduler(() => this._evaluate(), AgentHostWorktreeHint.SETTLE_DELAY_MS));

	constructor(
		@IChatWidgetService chatWidgetService: IChatWidgetService,
		@IChatViewHostService chatViewHostService: IChatViewHostService,
		@IAgentSessionsService private readonly _agentSessionsService: IAgentSessionsService,
		@IAgentHostWorktreeSessionSources private readonly _sessionSources: IAgentHostWorktreeSessionSources,
		@IAgentHostNewSessionFolderService private readonly _folderService: IAgentHostNewSessionFolderService,
		@IWorkspaceContextService private readonly _workspaceContextService: IWorkspaceContextService,
		@IOnboardingScenarioService private readonly _onboardingService: IOnboardingScenarioService,
	) {
		super();
		this._register(registerOnboardingTargetProvider(AGENT_HOST_WORKTREE_HINT_TARGET_ID, scope => {
			const chat = this._readyChat.get();
			const element = scope === undefined && chat ? getWorktreeControl(chat.domNode) : undefined;
			return element ? { element } : undefined;
		}));
		this._register(onboardingScenarioRegistry.register(createWorktreeHint(this.signal)));
		if (this._onboardingService.hasBeenShown(AGENT_HOST_WORKTREE_HINT_ID)) {
			return;
		}

		const schedule = () => this._update.schedule();
		this._listeners.add(autorun(reader => {
			// A chat that a first request made works in the window's own folder or a worktree, also if it finished since
			const shown = chatViewHostService.shownSession.read(reader);
			if (shown?.reason === 'commit' && !isUntitledChatSession(shown.resource)) {
				this._started.add(shown.resource);
				schedule();
			}
		}));
		this._listeners.add(Event.any<unknown>(this._agentSessionsService.model.onDidChangeSessions, this._sessionSources.onDidChange, this._folderService.onDidChangeFolder)(schedule));
		for (const widget of chatWidgetService.getAllWidgets()) {
			this._watch(widget, schedule);
		}
		this._listeners.add(chatWidgetService.onDidAddWidget(widget => this._watch(widget, schedule)));
		this._listeners.add(chatWidgetService.onDidRemoveWidget(widget => {
			this._widgets.deleteAndDispose(widget);
			schedule();
		}));
	}

	private _watch(widget: IChatWidget, schedule: () => void): void {
		if (widget.location !== ChatAgentLocation.Chat || this._widgets.has(widget)) {
			return;
		}
		const store = new DisposableStore();
		store.add(widget.onDidChangeViewModel(schedule));
		store.add(widget.inputEditor.onDidChangeModelContent(() => {
			// Typing hides the hint until the input is empty again
			if (this._readyChat.get() === widget) {
				this._readyChat.set(undefined, undefined);
			}
			schedule();
		}));
		store.add(widget.scopedContextKeyService.onDidChangeContext(e => e.affectsSome(CONTROL_KEYS) && schedule()));
		this._widgets.set(widget, store);
		schedule();
	}

	private _evaluate(): void {
		if (this._onboardingService.hasBeenShown(AGENT_HOST_WORKTREE_HINT_ID)) {
			this._readyChat.set(undefined, undefined);
			this._listeners.clear();
			this._widgets.clearAndDisposeAll();
			return;
		}
		const primary = this._primaryFolder();
		for (const resource of [...this._started]) {
			const workingDirectory = this._workingDirectory(resource);
			if (workingDirectory) {
				this._started.delete(resource);
				this._workedInFolder ||= !!primary && extUriBiasedIgnorePathCase.isEqual(workingDirectory, primary);
			}
		}
		const ready = this._workedInFolder && primary ? [...this._widgets.keys()].find(widget => this._isNewChatInFolder(widget, primary) && !!getWorktreeControl(widget.domNode)) : undefined;
		this._readyChat.set(ready, undefined);
	}

	/** Whether `widget` shows a new chat of the local agent host that works in the window's own folder, with nothing typed yet. */
	private _isNewChatInFolder(widget: IChatWidget, primary: URI): boolean {
		const resource = widget.viewModel?.sessionResource;
		if (!resource || !/^agent-host-/.test(resource.scheme) || !isUntitledChatSession(resource) || (widget.viewModel?.model.getRequests().length ?? 0) > 0 || widget.getInput().trim()) {
			return false;
		}
		const keys = widget.scopedContextKeyService;
		const offersWorktree = keys.getContextKeyValue<boolean>(ChatAgentHostFolderChipVisible.key) || keys.getContextKeyValue<boolean>(ChatAgentHostNewWorktreeToggleVisible.key);
		if (!offersWorktree || keys.getContextKeyValue<boolean>(ChatAgentHostNewWorktreeSelected.key) || this._folderService.isNoWorkspace(resource)) {
			return false;
		}
		const folder = this._folderService.getFolder(resource) ?? this._workspaceContextService.getWorkspace().folders[0]?.uri;
		return !!folder && extUriBiasedIgnorePathCase.isEqual(folder, primary);
	}

	/** The window's own folder, rather than a worktree it may be at. */
	private _primaryFolder(): URI | undefined {
		const workspace = this._workspaceContextService.getWorkspace();
		return workspace.uri ?? workspace.folders[0]?.uri;
	}

	private _workingDirectory(resource: URI): URI | undefined {
		const fromSource = this._sessionSources.getWorkingDirectory(resource);
		if (fromSource) {
			return fromSource;
		}
		const path = this._agentSessionsService.getSession(resource)?.metadata?.workingDirectoryPath;
		return typeof path === 'string' && path ? URI.file(path) : undefined;
	}
}

function createWorktreeHint(signal: IObservable<boolean>): IOnboardingScenario<ISpotlightPayload> {
	return {
		id: AGENT_HOST_WORKTREE_HINT_ID,
		when: ContextKeyExpr.and(
			ChatContextKeys.enabled,
			IsSessionsWindowContext.negate(),
			RemoteNameContext.isEqualTo(''),
			ContextKeyExpr.equals(`config.${ChatConfiguration.EditorWindowEnableWorktree}`, true),
		),
		trigger: { kind: 'observable', signal },
		presentation: {
			kind: SPOTLIGHT_PRESENTATION_KIND,
			payload: {
				steps: [{
					id: 'worktree',
					targetId: AGENT_HOST_WORKTREE_HINT_TARGET_ID,
					title: localize('agentHost.worktreeHint.title', "Work in Parallel"),
					description: localize('agentHost.worktreeHint.description', "Start this chat in a new worktree so it works separately from your other chats, on its own branch."),
					endTourLabel: localize('agentHost.worktreeHint.gotIt', "Got It"),
					focusEndTour: true,
					hideNext: true,
					placement: 'above',
					missingTarget: { kind: 'abort' },
				}],
			},
		},
	};
}

class AgentHostWorktreeHintContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.agentHostWorktreeHint';
	constructor(@IInstantiationService instantiationService: IInstantiationService) {
		super();
		this._register(instantiationService.createInstance(AgentHostWorktreeHint));
	}
}

registerWorkbenchContribution2(AgentHostWorktreeHintContribution.ID, AgentHostWorktreeHintContribution, WorkbenchPhase.AfterRestored);
