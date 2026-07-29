/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { autorun, IObservable } from '../../../../../base/common/observable.js';
import { localize } from '../../../../../nls.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IContextKey, IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { markOnboardingTarget } from '../../../../../workbench/contrib/onboarding/browser/spotlight/onboardingTarget.js';
import { reportNewChatPickerClosed } from '../../../chat/browser/newChatPickerTelemetry.js';
import { BranchPicker as SharedBranchPicker } from '../../../chat/browser/branchPicker.js';
import { SessionIsolationPickerVisibleContext } from '../../../../common/contextkeys.js';
import { IActiveSession } from '../../../../services/sessions/common/sessionsManagement.js';
import { ISessionsProvidersService } from '../../../../services/sessions/browser/sessionsProvidersService.js';
import { CopilotChatSessionsProvider, ICopilotChatSession } from './copilotChatSessionsProvider.js';

/**
 * Copilot-specific adapter that drives the shared BranchPicker with
 * session state, including the optional isolation checkbox.
 */
export class BranchPicker extends Disposable {
	private readonly _picker: SharedBranchPicker;
	private readonly _visibleKey: IContextKey<boolean>;
	private _hasGitRepo = false;
	private _isolationOptionEnabled: boolean;
	private _rendered = false; // Guards context key until DOM exists (#323361)

	constructor(
		private readonly _session: IObservable<IActiveSession | undefined>,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@ISessionsProvidersService private readonly sessionsProvidersService: ISessionsProvidersService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();

		this._visibleKey = SessionIsolationPickerVisibleContext.bindTo(contextKeyService);
		this._register(toDisposable(() => this._visibleKey.reset()));
		this._isolationOptionEnabled = this._configurationService.getValue<boolean>('github.copilot.chat.cli.isolationOption.enabled') !== false;

		this._register(this._configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('github.copilot.chat.cli.isolationOption.enabled')) {
				this._isolationOptionEnabled = this._configurationService.getValue<boolean>('github.copilot.chat.cli.isolationOption.enabled') !== false;
				if (!this._isolationOptionEnabled) {
					this._setModeOnSession('worktree');
				}
				this._update();
			}
		}));

		this._picker = this._register(instantiationService.createInstance(SharedBranchPicker, {
			user: 'branchPicker',
			onSelectBranch: branch => {
				const session = this._getSession();
				const selectedBranch = session?.branch.get();
				reportNewChatPickerClosed(this.telemetryService, {
					id: 'NewChatBranchPicker',
					name: 'NewChatBranchPicker',
					optionIdBefore: selectedBranch,
					optionIdAfter: branch,
					optionLabelBefore: selectedBranch,
					optionLabelAfter: branch,
					isPII: true,
				});
				session?.setBranch(branch);
			},
			isolation: {
				label: localize('isolationMode.worktree', "New Worktree"),
				ariaLabel: localize('isolationPicker.checkboxAriaLabel', "Worktree isolation"),
				onToggle: checked => this._applyIsolationToggle(checked),
				markTarget: element => markOnboardingTarget(element, 'sessions.newSession.isolation'),
			},
		}));

		this._register(autorun(reader => {
			const session = this._session.read(reader);
			const provider = session ? this.sessionsProvidersService.getProvider(session.providerId) : undefined;
			const providerSession = provider instanceof CopilotChatSessionsProvider ? provider.getSession(session!.sessionId) : undefined;
			if (providerSession) {
				const isLoading = session?.loading.read(reader);
				const gitRepo = providerSession.gitRepository;
				const repoState = gitRepo?.state?.read?.(reader);
				const hasHeadCommit = repoState ? !!repoState.HEAD?.commit : true;
				this._hasGitRepo = !isLoading && !!gitRepo && hasHeadCommit;
				providerSession.branches.read(reader);
				providerSession.branch.read(reader);
				providerSession.isolationMode.read(reader);
			} else {
				this._hasGitRepo = false;
			}
			this._update();
		}));
	}

	private _getSession(): ICopilotChatSession | undefined {
		const session = this._session.get();
		if (!session) {
			return undefined;
		}
		const provider = this.sessionsProvidersService.getProvider(session.providerId);
		return provider instanceof CopilotChatSessionsProvider ? provider.getSession(session.sessionId) : undefined;
	}

	private _getIsolationMode(): 'worktree' | 'workspace' {
		return this._getSession()?.isolationMode.get() ?? 'worktree';
	}

	private _setModeOnSession(mode: 'worktree' | 'workspace'): void {
		this._getSession()?.setIsolationMode(mode);
	}

	private _applyIsolationToggle(checked: boolean): void {
		const before = this._getIsolationMode();
		const after: 'worktree' | 'workspace' = checked ? 'worktree' : 'workspace';
		reportNewChatPickerClosed(this.telemetryService, {
			id: 'NewChatIsolationPicker',
			name: 'NewChatIsolationPicker',
			optionIdBefore: before,
			optionIdAfter: after,
			optionLabelBefore: undefined,
			optionLabelAfter: undefined,
			isPII: false,
		});
		this._setModeOnSession(after);
	}

	render(container: HTMLElement): void {
		this._rendered = true;
		this._picker.render(container);
		this._update();
	}

	showPicker(): void {
		this._picker.showPicker();
	}

	private _update(): void {
		const session = this._getSession();
		const branches = session?.branches.get() ?? [];
		const selectedBranch = session?.branch.get();
		const isLoading = session?.loading.get() ?? false;
		const isWorkspace = session?.isolationMode.get() === 'workspace';

		const isolationState: 'enabled' | 'disabled' | 'hidden' =
			!this._isolationOptionEnabled ? 'hidden' :
				this._hasGitRepo ? 'enabled' : 'disabled';

		this._picker.update({
			label: selectedBranch ?? localize('branchPicker.select', "Branch"),
			branches: branches.map(branch => ({ name: branch, selected: branch === selectedBranch })),
			status: isLoading ? 'loading' : branches.length > 0 ? 'ready' : 'empty',
			canOpen: !isLoading && !isWorkspace && branches.length > 0,
			isolation: {
				checked: this._getIsolationMode() === 'worktree',
				state: isolationState,
				disabledReason: !this._hasGitRepo ? localize('isolationPicker.noGitRepo', "Git repository required for worktree isolation") : undefined,
			},
		});
		this._visibleKey.set(this._rendered && this._hasGitRepo && this._isolationOptionEnabled);
	}
}
