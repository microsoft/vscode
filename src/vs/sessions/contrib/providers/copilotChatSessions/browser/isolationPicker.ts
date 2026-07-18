/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../base/browser/dom.js';
import './media/isolationPicker.css';
import { Gesture, EventType as TouchEventType } from '../../../../../base/browser/touch.js';
import { Disposable, DisposableStore, toDisposable } from '../../../../../base/common/lifecycle.js';
import { autorun, IObservable } from '../../../../../base/common/observable.js';
import { Checkbox } from '../../../../../base/browser/ui/toggle/toggle.js';
import { localize } from '../../../../../nls.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IContextKey, IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { defaultCheckboxStyles } from '../../../../../platform/theme/browser/defaultStyles.js';
import { reportNewChatPickerClosed } from '../../../chat/browser/newChatPickerTelemetry.js';
import { IActiveSession } from '../../../../services/sessions/common/sessionsManagement.js';
import { ISessionsProvidersService } from '../../../../services/sessions/browser/sessionsProvidersService.js';
import { CopilotChatSessionsProvider } from './copilotChatSessionsProvider.js';
import { markOnboardingTarget } from '../../../../../workbench/contrib/onboarding/browser/spotlight/onboardingTarget.js';
import { SessionIsolationPickerVisibleContext } from '../../../../common/contextkeys.js';

export type IsolationMode = 'worktree' | 'workspace';

/**
 * A self-contained widget for selecting the isolation mode.
 *
 * Rendered as a "Worktree" checkbox: checked runs the session in a git
 * worktree (`worktree`), unchecked runs it directly in the folder
 * (`workspace`).
 *
 * Only visible when isolation option is enabled, project has a git repo,
 * and the target is CLI.
 */
export class IsolationPicker extends Disposable {

	private _hasGitRepo = false;
	private _isolationOptionEnabled: boolean;

	private readonly _renderDisposables = this._register(new DisposableStore());
	private _slotElement: HTMLElement | undefined;
	private _triggerElement: HTMLElement | undefined;
	private _checkbox: Checkbox | undefined;

	/**
	 * Tracks whether the isolation picker is currently visible — i.e. the
	 * isolation option is enabled and the workspace has a usable git
	 * repository. Consumed by the new-session-view onboarding tour to skip the
	 * isolation step when the picker is unavailable.
	 */
	private readonly _visibleKey: IContextKey<boolean>;

	constructor(
		private readonly _session: IObservable<IActiveSession | undefined>,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@ISessionsProvidersService private readonly sessionsProvidersService: ISessionsProvidersService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@IContextKeyService contextKeyService: IContextKeyService,
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
				this._updateTrigger();
			}
		}));

		this._register(autorun(reader => {
			const session = this._session.read(reader);
			const isLoading = session?.loading.read(reader);
			const provider = session ? this.sessionsProvidersService.getProvider(session.providerId) : undefined;
			const providerSession = provider instanceof CopilotChatSessionsProvider ? provider.getSession(session!.sessionId) : undefined;
			if (providerSession) {
				const gitRepo = providerSession.gitRepository;
				const repoState = gitRepo?.state?.read?.(reader);
				const hasHeadCommit = repoState ? !!repoState.HEAD?.commit : true;
				// Enable only when git repo exists and HEAD has a valid commit (not an empty repo)
				this._hasGitRepo = !isLoading && !!gitRepo && hasHeadCommit;
				// Read isolation mode from session — session is the source of truth
				providerSession.isolationMode.read(reader);
			} else {
				this._hasGitRepo = false;
			}
			this._updateTrigger();
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

		const slot = dom.append(container, dom.$('.sessions-chat-picker-slot.sessions-chat-isolation-checkbox'));
		this._renderDisposables.add({ dispose: () => slot.remove() });
		this._slotElement = slot;
		// Onboarding spotlight target — id is referenced by the "new session" tour
		// in vs/sessions/contrib/onboardingTours.
		this._renderDisposables.add(markOnboardingTarget(slot, 'sessions.newSession.isolation'));

		const label = localize('isolationMode.worktree', "New Worktree");
		const row = dom.append(slot, dom.$('.action-label'));
		this._triggerElement = row;
		row.setAttribute('aria-label', localize('isolationPicker.checkboxAriaLabel', "Worktree isolation"));

		// The checkbox instance is kept stable across state updates so that
		// toggling it (which re-enters `_updateTrigger` via the isolation
		// observable) doesn't recreate the DOM and drop keyboard focus.
		const checkbox = this._renderDisposables.add(new Checkbox(label, this._getSessionIsolationMode() === 'worktree', { ...defaultCheckboxStyles, size: 14 }));
		this._checkbox = checkbox;
		dom.append(row, checkbox.domNode);
		const labelSpan = dom.append(row, dom.$('span.sessions-chat-dropdown-label'));
		labelSpan.textContent = label;

		this._renderDisposables.add(checkbox.onChange(() => this._applyChecked(checkbox.checked)));
		// Toggle from anywhere on the row so the visible hit target
		// (padding + checkbox/label gap) matches the interactive one. The
		// checkbox stops its own click from bubbling here. `Gesture` +
		// tap keeps this custom non-button target reliable on iOS.
		this._renderDisposables.add(Gesture.addTarget(row));
		for (const eventType of [dom.EventType.CLICK, TouchEventType.Tap]) {
			this._renderDisposables.add(dom.addDisposableListener(row, eventType, e => {
				if (!checkbox.enabled) {
					return;
				}
				dom.EventHelper.stop(e, true);
				checkbox.checked = !checkbox.checked;
				this._applyChecked(checkbox.checked);
			}));
		}

		this._updateTrigger();
	}

	private _setModeOnSession(mode: IsolationMode): void {
		const session = this._session.get();
		const provider = session ? this.sessionsProvidersService.getProvider(session.providerId) : undefined;
		const providerSession = provider instanceof CopilotChatSessionsProvider ? provider.getSession(session!.sessionId) : undefined;
		providerSession?.setIsolationMode(mode);
	}

	private _applyChecked(checked: boolean): void {
		const before: IsolationMode = this._getSessionIsolationMode();
		const mode: IsolationMode = checked ? 'worktree' : 'workspace';
		reportNewChatPickerClosed(this.telemetryService, {
			id: 'NewChatIsolationPicker',
			name: 'NewChatIsolationPicker',
			optionIdBefore: before,
			optionIdAfter: mode,
			optionLabelBefore: undefined,
			optionLabelAfter: undefined,
			isPII: false,
		});
		this._setModeOnSession(mode);
	}

	private _updateTrigger(): void {
		if (!this._triggerElement || !this._checkbox) {
			this._visibleKey.set(false);
			return;
		}

		const isDisabled = !this._hasGitRepo;
		this._checkbox.checked = this._getSessionIsolationMode() === 'worktree';
		if (isDisabled) {
			this._checkbox.disable();
		} else {
			this._checkbox.enable();
		}
		this._slotElement?.classList.toggle('disabled', isDisabled);
		this._visibleKey.set(this._hasGitRepo && this._isolationOptionEnabled);
	}
}
