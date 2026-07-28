/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/chatStatus.css';
import { Disposable, DisposableStore, MutableDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { localize } from '../../../../../nls.js';
import { IWorkbenchContribution } from '../../../../common/contributions.js';
import { IStatusbarEntry, IStatusbarEntryAccessor, IStatusbarService, ShowTooltipCommand, StatusbarAlignment, StatusbarEntryKind } from '../../../../services/statusbar/browser/statusbar.js';
import { ChatEntitlement, ChatEntitlementContextKeys, ChatEntitlementService, IChatEntitlementService, isProUser } from '../../../../services/chat/common/chatEntitlementService.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { disposableLongTimeout, disposableTimeout } from '../../../../../base/common/async.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { getCodeEditor } from '../../../../../editor/browser/editorBrowser.js';
import { IInlineCompletionsService } from '../../../../../editor/browser/services/inlineCompletionsService.js';

import { ChatStatusDashboard } from './chatStatusDashboard.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { $ as h, disposableWindowInterval } from '../../../../../base/browser/dom.js';
import { isNewUser } from './chatStatus.js';
import product from '../../../../../platform/product/common/product.js';
import { isCompletionsEnabled } from '../../../../../editor/common/services/completionsEnablement.js';
import { CHAT_SETUP_ACTION_ID } from '../actions/chatActions.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { isWeb } from '../../../../../base/common/platform.js';
import { InEditorZenModeContext } from '../../../../common/contextkeys.js';
import { ChatConfiguration } from '../../common/constants.js';

/**
 * Tracks whether Copilot is currently blocked by a reached quota limit, has
 * resumed after a limit reset, or neither. Persisted across sessions so a reset
 * that happens while VS Code is closed can still be surfaced on next launch.
 */
export type ChatQuotaResumeState = 'none' | 'blocked' | 'resumed';

type ChatQuotas = IChatEntitlementService['quotas'];

/**
 * Whether this entry tracks quota for the given entitlement. All signed-up plans
 * are tracked via the unified premium chat quota. Transient states (signed out,
 * unresolved, not entitled) are not tracked.
 */
function isTrackedEntitlement(entitlement: ChatEntitlement): boolean {
	switch (entitlement) {
		case ChatEntitlement.Free:
		case ChatEntitlement.EDU:
		case ChatEntitlement.Pro:
		case ChatEntitlement.ProPlus:
		case ChatEntitlement.Business:
		case ChatEntitlement.Enterprise:
			return true;
		default:
			return false;
	}
}

function isQuotaBlocked(quotas: ChatQuotas): boolean {
	const premiumChat = quotas.premiumChat;
	if (premiumChat === undefined) {
		return false;
	}

	return premiumChat.unlimited ? premiumChat.hasQuota === false : premiumChat.percentRemaining === 0;
}

function hasResolvedQuota(quotas: ChatQuotas): boolean {
	return quotas.premiumChat !== undefined;
}

/**
 * Pure state transition for the Copilot quota "resumed" indicator:
 * - Enters `blocked` while a limit is reached and the user is not on additional spend.
 * - Moves `blocked` -> `resumed` only on a genuine limit reset (fresh quota, no additional spend).
 * - Moves `blocked` -> `none` when unblocked via additional spend (not a reset).
 * - Keeps `blocked` while fresh quota has not been resolved yet (e.g. offline) to avoid false positives.
 * - Otherwise preserves the previous state, so `resumed` persists until dismissed.
 * - Resets to `none` for entitlements this entry doesn't track, so the state can't get stuck (e.g. upgrading from Free while `blocked`).
 */
export function computeQuotaResumeState(previous: ChatQuotaResumeState, entitlement: ChatEntitlement, quotas: ChatQuotas): ChatQuotaResumeState {
	if (!isTrackedEntitlement(entitlement)) {
		return 'none';
	}

	const additionalSpend = quotas.additionalUsageEnabled === true;

	if (!additionalSpend && isQuotaBlocked(quotas)) {
		return 'blocked';
	}

	if (previous !== 'blocked') {
		return previous;
	}

	if (additionalSpend) {
		return 'none';
	}

	return hasResolvedQuota(quotas) ? 'resumed' : 'blocked';
}

export class ChatStatusBarEntry extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.chatStatusBarEntry';

	private static readonly TITLE_BAR_CONTEXT_KEYS = new Set(['updateTitleBar', InEditorZenModeContext.key, ChatEntitlementContextKeys.hasByokModels.key]);

	private static readonly QUOTA_RESUME_STATE_KEY = 'chat.quotaResumeState';
	private static readonly QUOTA_RESET_RETRY_DELAY = 5 * 60 * 1000; // re-check 5 min after a passed reset time

	private entry: IStatusbarEntryAccessor | undefined = undefined;

	private readonly activeCodeEditorListener = this._register(new MutableDisposable());
	private readonly entryAnchor = h('span');
	private readonly dashboardTooltip: IStatusbarEntry['tooltip'];

	private quotaResumeState: ChatQuotaResumeState;
	private readonly quotaResetTimer = this._register(new MutableDisposable());
	private readonly quotaRefresh = this._register(new MutableDisposable());
	private readonly clearResumedScheduler = this._register(new MutableDisposable());

	constructor(
		@IChatEntitlementService private readonly chatEntitlementService: ChatEntitlementService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IStatusbarService private readonly statusbarService: IStatusbarService,
		@IEditorService private readonly editorService: IEditorService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IInlineCompletionsService private readonly completionsService: IInlineCompletionsService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IStorageService private readonly storageService: IStorageService,
	) {
		super();

		this.quotaResumeState = this.readPersistedQuotaResumeState();

		this.dashboardTooltip = {
			element: (token: CancellationToken) => {
				this.onDashboardOpened();

				const store = new DisposableStore();
				store.add(token.onCancellationRequested(() => {
					store.dispose();
				}));
				const elem = ChatStatusDashboard.instantiateInContents(this.instantiationService, store, undefined);

				// todo@connor4312/@benibenj: workaround for #257923
				store.add(disposableWindowInterval(mainWindow, () => {
					if (!elem.isConnected) {
						store.dispose();
					}
				}, 2000));

				return elem;
			}
		};

		this.update();

		this.registerListeners();

		this.initializeQuotaResumeState();
	}

	private update(): void {
		const sentiment = this.chatEntitlementService.sentiment;
		if (!sentiment.hidden) {
			const props = this.getEntryProps();
			if (this.entry) {
				this.entry.update(props);
			} else {
				this.entry = this.statusbarService.addEntry(props, 'chat.statusBarEntry', StatusbarAlignment.RIGHT, { location: { id: 'status.editor.mode', priority: 100.1 }, alignment: StatusbarAlignment.RIGHT });
			}
		} else {
			this.entry?.dispose();
			this.entry = undefined;
		}
	}

	private registerListeners(): void {
		this._register(this.chatEntitlementService.onDidChangeQuotaExceeded(() => this.onQuotaChanged()));
		this._register(this.chatEntitlementService.onDidChangeQuotaRemaining(() => this.onQuotaChanged()));
		this._register(this.chatEntitlementService.onDidChangeSentiment(() => this.update()));
		this._register(this.chatEntitlementService.onDidChangeEntitlement(() => this.onQuotaChanged()));
		this._register(this.contextKeyService.onDidChangeContext(e => {
			if (e.affectsSome(ChatStatusBarEntry.TITLE_BAR_CONTEXT_KEYS)) {
				this.update();
			}
		}));

		this._register(this.completionsService.onDidChangeIsSnoozing(() => this.update()));

		this._register(this.editorService.onDidActiveEditorChange(() => this.onDidActiveEditorChange()));

		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(product.defaultChatAgent?.completionsEnablementSetting) || e.affectsConfiguration(ChatConfiguration.TitleBarSignInEnabled)) {
				this.update();
			}
		}));
	}

	private onDidActiveEditorChange(): void {
		this.update();

		this.activeCodeEditorListener.clear();

		// Listen to language changes in the active code editor
		const activeCodeEditor = getCodeEditor(this.editorService.activeTextEditorControl);
		if (activeCodeEditor) {
			this.activeCodeEditorListener.value = activeCodeEditor.onDidChangeModelLanguage(() => {
				this.update();
			});
		}
	}

	//#region --- Quota Resume Tracking

	private onQuotaChanged(): void {
		this.evaluateQuotaResumeState();
		this.update();
	}

	private evaluateQuotaResumeState(): void {
		const next = computeQuotaResumeState(this.quotaResumeState, this.chatEntitlementService.entitlement, this.chatEntitlementService.quotas);
		this.setQuotaResumeState(next);

		// While blocked, schedule a refresh for when the limit is expected to reset.
		if (next === 'blocked') {
			this.scheduleQuotaResetRefresh();
		} else {
			this.quotaResetTimer.clear();
		}
	}

	private getQuotaResetTime(): number | undefined {
		const quotas = this.chatEntitlementService.quotas;

		const premiumResetAt = quotas.premiumChat?.resetAt;
		if (typeof premiumResetAt === 'number') {
			return premiumResetAt * 1000;
		}

		if (quotas.resetDate) {
			const parsed = Date.parse(quotas.resetDate);
			if (!isNaN(parsed)) {
				return parsed;
			}
		}

		return undefined;
	}

	private scheduleQuotaResetRefresh(): void {
		const resetAt = this.getQuotaResetTime();
		if (resetAt === undefined) {
			this.quotaResetTimer.clear(); // no known reset time: rely on quota events and next launch
			return;
		}

		// Back off when the reset time has already passed but we are still blocked,
		// so we re-check periodically instead of hammering the service.
		const delay = resetAt > Date.now() ? resetAt - Date.now() : ChatStatusBarEntry.QUOTA_RESET_RETRY_DELAY;
		this.quotaResetTimer.value = disposableLongTimeout(() => this.refreshQuotaAndEvaluate(), delay);
	}

	private refreshQuotaAndEvaluate(): void {
		const cts = new CancellationTokenSource();
		this.quotaRefresh.value = toDisposable(() => cts.dispose(true));

		(async () => {
			try {
				await this.chatEntitlementService.update(cts.token);
			} catch {
				// Ignore refresh failures: keep the last known state and let a future
				// quota update or the next launch re-evaluate.
			}

			if (cts.token.isCancellationRequested) {
				return;
			}

			this.evaluateQuotaResumeState();
			this.update();
		})();
	}

	private initializeQuotaResumeState(): void {
		if (this.quotaResumeState === 'blocked') {
			// A blocked state was recorded in a previous session: verify against fresh
			// quota data whether the limit has since reset while VS Code was closed.
			this.refreshQuotaAndEvaluate();
		} else {
			this.evaluateQuotaResumeState();
		}
	}

	private readPersistedQuotaResumeState(): ChatQuotaResumeState {
		const stored = this.storageService.get(ChatStatusBarEntry.QUOTA_RESUME_STATE_KEY, StorageScope.PROFILE);
		return stored === 'blocked' || stored === 'resumed' ? stored : 'none';
	}

	private setQuotaResumeState(state: ChatQuotaResumeState): void {
		if (this.quotaResumeState === state) {
			return;
		}

		this.quotaResumeState = state;
		if (state === 'none') {
			this.storageService.remove(ChatStatusBarEntry.QUOTA_RESUME_STATE_KEY, StorageScope.PROFILE);
		} else {
			this.storageService.store(ChatStatusBarEntry.QUOTA_RESUME_STATE_KEY, state, StorageScope.PROFILE, StorageTarget.MACHINE);
		}
	}

	private onDashboardOpened(): void {
		if (this.quotaResumeState !== 'resumed') {
			return;
		}

		// Defer clearing to avoid re-entrant status bar updates while the dashboard
		// tooltip is being built.
		this.clearResumedScheduler.value = disposableTimeout(() => {
			this.setQuotaResumeState('none');
			this.update();
		}, 0);
	}

	//#endregion

	private getEntryProps(): IStatusbarEntry {
		let text = '$(copilot)';
		let ariaLabel = localize('chatStatusAria', "Copilot status");
		let kind: StatusbarEntryKind | undefined;

		if (isNewUser(this.chatEntitlementService)) {
			const entitlement = this.chatEntitlementService.entitlement;

			// Sign In
			if (
				this.chatEntitlementService.sentiment.later ||	// user skipped setup
				entitlement === ChatEntitlement.Available ||	// user is entitled
				isProUser(entitlement) ||						// user is already pro
				entitlement === ChatEntitlement.Free			// user is already free
			) {
				return this.getSetupEntryProps();
			}
		} else {
			const quotas = this.chatEntitlementService.quotas;

			// Disabled
			if (this.chatEntitlementService.sentiment.disabled || this.chatEntitlementService.sentiment.untrusted) {
				text = '$(copilot-unavailable)';
				ariaLabel = localize('copilotDisabledStatus', "Copilot disabled");
			}

			// Signed out — keep showing Sign-in affordance even when BYOK models are present
			// so air-gapped users can still authenticate to unlock the full Copilot experience.
			else if (this.chatEntitlementService.entitlement === ChatEntitlement.Unknown) {
				return this.getSetupEntryProps();
			}

			// Quota Exceeded (all tracked plans share the premium chat quota)
			else if (isTrackedEntitlement(this.chatEntitlementService.entitlement) && isQuotaBlocked(quotas)) {
				const quotaWarning = localize('chatQuotaExceededStatus', "Quota reached");
				text = `$(copilot-warning) ${quotaWarning}`;
				ariaLabel = quotaWarning;
				kind = 'prominent';
			}

			// Copilot Resumed (limit reset after the user was previously blocked)
			else if (this.quotaResumeState === 'resumed') {
				const resumedLabel = localize('chatResumedStatus', "Copilot Resumed");
				text = `$(copilot) ${resumedLabel}`;
				ariaLabel = resumedLabel;
				kind = 'prominent';
			}

			// Completions Disabled
			else if (this.editorService.activeTextEditorLanguageId && !isCompletionsEnabled(this.configurationService, this.editorService.activeTextEditorLanguageId)) {
				text = '$(copilot-unavailable)';
				ariaLabel = localize('completionsDisabledStatus', "Inline suggestions disabled");
			}

			// Completions Snoozed
			else if (this.completionsService.isSnoozing()) {
				text = '$(copilot-snooze)';
				ariaLabel = localize('completionsSnoozedStatus', "Inline suggestions snoozed");
			}
		}

		const baseResult = {
			name: localize('chatStatus', "Copilot Status"),
			text,
			ariaLabel,
			command: ShowTooltipCommand,
			showInAllWindows: true,
			kind,
			content: this.entryAnchor,
			tooltip: this.dashboardTooltip
		} satisfies IStatusbarEntry;

		return baseResult;
	}

	private getSetupEntryProps(): IStatusbarEntry {
		const showSignInLabel = !this.isSignInTitleBarAffordanceVisible();
		const signInLabel = localize('signIn', "Sign In");
		return {
			name: localize('chatStatus', "Copilot Status"),
			text: showSignInLabel ? `$(copilot) ${signInLabel}` : '$(copilot)',
			ariaLabel: showSignInLabel ? signInLabel : localize('chatStatusAria', "Copilot status"),
			command: CHAT_SETUP_ACTION_ID,
			showInAllWindows: true,
			kind: undefined,
			content: this.entryAnchor,
		};
	}

	private isSignInTitleBarAffordanceVisible(): boolean {
		if (isWeb) {
			return false;
		}

		// Title bar sign-in button only shows when user is signed out
		if (this.chatEntitlementService.entitlement !== ChatEntitlement.Unknown) {
			return false;
		}

		if (this.chatEntitlementService.sentiment.hidden || this.chatEntitlementService.sentiment.disabledInWorkspace) {
			return false;
		}

		const hasTitleBarUpdate = Boolean(this.contextKeyService.getContextKeyValue('updateTitleBar'));
		if (hasTitleBarUpdate) {
			return false;
		}

		const inZenMode = Boolean(this.contextKeyService.getContextKeyValue(InEditorZenModeContext.key));
		if (inZenMode) {
			return false;
		}

		const signInTitleBarEnabled = this.configurationService.getValue<boolean>(ChatConfiguration.TitleBarSignInEnabled) !== false;
		return signInTitleBarEnabled;
	}

	override dispose(): void {
		super.dispose();

		this.entry?.dispose();
		this.entry = undefined;
	}
}
