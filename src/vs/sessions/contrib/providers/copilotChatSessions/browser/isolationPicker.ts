/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../base/browser/dom.js';
import { Gesture, EventType as TouchEventType } from '../../../../../base/browser/touch.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Disposable, DisposableStore, toDisposable } from '../../../../../base/common/lifecycle.js';
import { autorun, IObservable } from '../../../../../base/common/observable.js';
import { renderIcon } from '../../../../../base/browser/ui/iconLabel/iconLabels.js';
import { localize } from '../../../../../nls.js';
import { IActionWidgetService } from '../../../../../platform/actionWidget/browser/actionWidget.js';
import { ActionListItemKind, IActionListDelegate, IActionListItem } from '../../../../../platform/actionWidget/browser/actionList.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IContextKey, IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { reportNewChatPickerClosed } from '../../../chat/browser/newChatPickerTelemetry.js';
import { IActiveSession } from '../../../../services/sessions/common/sessionsManagement.js';
import { ISessionsProvidersService } from '../../../../services/sessions/browser/sessionsProvidersService.js';
import { CopilotChatSessionsProvider } from './copilotChatSessionsProvider.js';
import { markOnboardingTarget } from '../../../../../workbench/contrib/onboarding/browser/spotlight/onboardingTarget.js';
import { SessionIsolationPickerVisibleContext } from '../../../../common/contextkeys.js';

export type IsolationMode = 'worktree' | 'workspace';

interface IIsolationPickerItem {
	readonly mode: IsolationMode;
	readonly checked?: boolean;
}

/**
 * A self-contained widget for selecting the isolation mode.
 *
 * Options:
 * - **Worktree** (`worktree`) — run in a git worktree
 * - **Folder** (`workspace`) — run directly in the folder
 *
 * Only visible when isolation option is enabled, project has a git repo,
 * and the target is CLI.
 *
 * Emits `onDidChange` with the selected `IsolationMode` when the user picks an option.
 */
export class IsolationPicker extends Disposable {

	private _hasGitRepo = false;
	private _isolationOptionEnabled: boolean;

	private readonly _renderDisposables = this._register(new DisposableStore());
	private _slotElement: HTMLElement | undefined;
	private _triggerElement: HTMLElement | undefined;

	/**
	 * Tracks whether the isolation picker is currently visible — i.e. the
	 * isolation option is enabled and the workspace has a usable git
	 * repository. Consumed by the new-session-view onboarding tour to skip the
	 * isolation step when the picker is unavailable.
	 */
	private readonly _visibleKey: IContextKey<boolean>;

	constructor(
		private readonly _session: IObservable<IActiveSession | undefined>,
		@IActionWidgetService private readonly actionWidgetService: IActionWidgetService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@ISessionsProvidersService private readonly sessionsProvidersService: ISessionsProvidersService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IDialogService private readonly dialogService: IDialogService,
		@ICommandService private readonly commandService: ICommandService,
	) {
		super();
		this._visibleKey = SessionIsolationPickerVisibleContext.bindTo(contextKeyService);
		this._register(toDisposable(() => this._visibleKey.reset()));
		this._isolationOptionEnabled = this.configurationService.getValue<boolean>('github.copilot.chat.cli.isolationOption.enabled') !== false;

		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('github.copilot.chat.cli.isolationOption.enabled')) {
				this._isolationOptionEnabled = this.configurationService.getValue<boolean>('github.copilot.chat.cli.isolationOption.enabled') !== false;
				if (!this._isolationOptionEnabled) {
					this._setModeOnSession('worktree');
				}
				this._updateTriggerLabel();
			}
		}));

		this._register(autorun(reader => {
			const session = this._session.read(reader);
			const isLoading = session?.loading.read(reader);
			const provider = session ? this.sessionsProvidersService.getProvider(session.providerId) : undefined;
			const providerSession = provider instanceof CopilotChatSessionsProvider ? provider.getSession(session!.sessionId) : undefined;
			if (providerSession) {
				const gitRepo = providerSession.gitRepositoryObservable ? providerSession.gitRepositoryObservable.read(reader) : providerSession.gitRepository;
				const repoState = gitRepo?.state?.read?.(reader);
				const hasHeadCommit = repoState ? !!repoState.HEAD?.commit : true;
				// Enable only when git repo exists and HEAD has a valid commit (not an empty repo)
				this._hasGitRepo = !isLoading && !!gitRepo && hasHeadCommit;
				// Read isolation mode from session — session is the source of truth
				providerSession.isolationMode.read(reader);
			} else {
				this._hasGitRepo = false;
			}
			this._updateTriggerLabel();
		}));
	}

	private _getSessionIsolationMode(): IsolationMode {
		const session = this._session.get();
		const provider = session ? this.sessionsProvidersService.getProvider(session.providerId) : undefined;
		const providerSession = provider instanceof CopilotChatSessionsProvider ? provider.getSession(session!.sessionId) : undefined;
		return providerSession?.isolationMode.get() ?? 'worktree';
	}

	render(container: HTMLElement): void {
		this._renderDisposables.clear();

		const slot = dom.append(container, dom.$('.sessions-chat-picker-slot'));
		this._renderDisposables.add({ dispose: () => slot.remove() });
		this._slotElement = slot;
		// Onboarding spotlight target — id is referenced by the "new session" tour
		// in vs/sessions/contrib/onboardingTours.
		this._renderDisposables.add(markOnboardingTarget(slot, 'sessions.newSession.isolation'));

		const trigger = dom.append(slot, dom.$('a.action-label'));
		trigger.tabIndex = 0;
		trigger.role = 'button';
		this._triggerElement = trigger;
		this._updateTriggerLabel();

		this._renderDisposables.add(Gesture.addTarget(trigger));
		for (const eventType of [dom.EventType.CLICK, TouchEventType.Tap]) {
			this._renderDisposables.add(dom.addDisposableListener(trigger, eventType, (e) => {
				dom.EventHelper.stop(e, true);
				this._showPicker();
			}));
		}

		this._renderDisposables.add(dom.addDisposableListener(trigger, dom.EventType.KEY_DOWN, (e) => {
			if (e.key === 'Enter' || e.key === ' ') {
				dom.EventHelper.stop(e, true);
				this._showPicker();
			}
		}));
	}

	private _showPicker(): void {
		if (!this._triggerElement || this.actionWidgetService.isVisible) {
			return;
		}

		if (!this._isolationOptionEnabled) {
			return;
		}

		const currentIsolationMode = this._getSessionIsolationMode();
		const session = this._session.get();
		const provider = session ? this.sessionsProvidersService.getProvider(session.providerId) : undefined;
		const providerSession = provider instanceof CopilotChatSessionsProvider ? provider.getSession(session!.sessionId) : undefined;
		const gitRepo = providerSession ? (providerSession.gitRepositoryObservable ? providerSession.gitRepositoryObservable.get() : providerSession.gitRepository) : undefined;

		let detailText: string | undefined = undefined;
		if (!gitRepo) {
			detailText = localize('isolationMode.worktree.requiresGit', "Requires an initialized Git repository. Select to initialize Git.");
		} else if (!this._hasGitRepo) {
			detailText = localize('isolationMode.worktree.requiresCommit', "Requires at least one commit. Create a commit to enable Worktree.");
		}

		const items: IActionListItem<IIsolationPickerItem>[] = [
			{
				kind: ActionListItemKind.Action,
				label: localize('isolationMode.worktree', "Worktree"),
				group: { title: '', icon: Codicon.worktree },
				item: { mode: 'worktree', checked: currentIsolationMode === 'worktree' || undefined },
				detail: detailText
			},
			{
				kind: ActionListItemKind.Action,
				label: localize('isolationMode.folder', "Folder"),
				group: { title: '', icon: Codicon.folder },
				item: { mode: 'workspace', checked: currentIsolationMode === 'workspace' || undefined },
			},
		];

		const triggerElement = this._triggerElement;
		const delegate: IActionListDelegate<IIsolationPickerItem> = {
			onSelect: async ({ mode }) => {
				this.actionWidgetService.hide();

				if (mode === 'worktree' && !this._hasGitRepo) {
					if (gitRepo) {
						await this.dialogService.prompt({
							message: localize('gitCommit.message', "Initial Commit Required"),
							detail: localize('gitCommit.detail', "To use worktrees, the Git repository must have at least one commit. Please make an initial commit first."),
							buttons: [{
								label: localize('gitCommit.ok', "OK"),
								run: () => { }
							}]
						});
						return;
					}

					const confirmation = await this.dialogService.confirm({
						message: localize('gitInit.message', "Git Repository Required"),
						detail: localize('gitInit.detail', "To use worktrees, you must initialize a Git repository in this folder. Would you like to initialize Git now?"),
						primaryButton: localize('gitInit.button', "Initialize Git"),
					});
					if (confirmation.confirmed) {
						await this.commandService.executeCommand('git.init', true);
						if (providerSession?.resolveGitRepository) {
							await providerSession.resolveGitRepository();
						}
					}
					return;
				}

				reportNewChatPickerClosed(this.telemetryService, {
					id: 'NewChatIsolationPicker',
					name: 'NewChatIsolationPicker',
					optionIdBefore: currentIsolationMode,
					optionIdAfter: mode,
					optionLabelBefore: undefined,
					optionLabelAfter: undefined,
					isPII: false,
				});
				this._setModeOnSession(mode);
			},
			onHide: () => { triggerElement.focus(); },
		};

		this.actionWidgetService.show<IIsolationPickerItem>(
			'isolationPicker',
			false,
			items,
			delegate,
			this._triggerElement,
			undefined,
			[],
			{
				getAriaLabel: (item) => item.label ?? '',
				getWidgetAriaLabel: () => localize('isolationPicker.ariaLabel', "Isolation Mode"),
			},
		);
	}

	private _setModeOnSession(mode: IsolationMode): void {
		const session = this._session.get();
		const provider = session ? this.sessionsProvidersService.getProvider(session.providerId) : undefined;
		const providerSession = provider instanceof CopilotChatSessionsProvider ? provider.getSession(session!.sessionId) : undefined;
		providerSession?.setIsolationMode(mode);
	}

	private _updateTriggerLabel(): void {
		if (!this._triggerElement) {
			this._visibleKey.set(false);
			return;
		}

		dom.clearNode(this._triggerElement);

		const isolationMode = this._getSessionIsolationMode();
		let modeIcon;
		let modeLabel: string;

		switch (isolationMode) {
			case 'workspace':
				modeIcon = Codicon.folder;
				modeLabel = localize('isolationMode.folder', "Folder");
				break;
			case 'worktree':
			default:
				modeIcon = Codicon.worktree;
				modeLabel = localize('isolationMode.worktree', "Worktree");
				break;
		}

		dom.append(this._triggerElement, renderIcon(modeIcon));
		const labelSpan = dom.append(this._triggerElement, dom.$('span.sessions-chat-dropdown-label'));
		labelSpan.textContent = modeLabel;
		dom.append(this._triggerElement, renderIcon(Codicon.chevronDown));

		this._triggerElement.ariaLabel = localize('isolationPicker.triggerAriaLabel', "Pick Isolation Mode, {0}", modeLabel);

		const isDisabled = false;
		this._slotElement?.classList.toggle('disabled', isDisabled);
		this._triggerElement.setAttribute('aria-disabled', String(isDisabled));
		this._triggerElement.tabIndex = isDisabled ? -1 : 0;
		this._visibleKey.set(this._isolationOptionEnabled);
	}
}
