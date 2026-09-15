/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableStore, MutableDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { disposableTimeout } from '../../../../base/common/async.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IContextKey, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IDefaultAccountService, IManagedSettingsCompatibilityError } from '../../../../platform/defaultAccount/common/defaultAccount.js';
import { IDialogService, IPromptButton } from '../../../../platform/dialogs/common/dialogs.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { INotificationService, Severity } from '../../../../platform/notification/common/notification.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { IManagedSettingsFreshness, ManagedSettingsFreshnessFailure, ManagedSettingsFreshnessState } from '../../../../platform/policy/common/managedSettingsFreshness.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { IStorageService, StorageScope } from '../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { DEFAULT_ACCOUNT_SIGN_IN_COMMAND } from '../../accounts/browser/defaultAccount.js';
import { IChatEntitlementService } from '../../chat/common/chatEntitlementService.js';
import { AccountPolicyGateState, AccountPolicyGateUnsatisfiedReason, ChatAccountPolicyGateActiveContext, IAccountPolicyGateInfo, IAccountPolicyGateService } from '../common/accountPolicyService.js';

const NOTIFICATION_DISMISSED_KEY = 'accountPolicy.gateNotificationDismissed';

type AccountPolicyGateStateEvent = {
	gateActive: boolean;
	gateSatisfied: boolean;
	reasonNotSatisfied: string | undefined;
};

type AccountPolicyGateStateClassification = {
	owner: 'joshspicer';
	comment: 'Tracks the Account Policy gate state for diagnosing account-driven restriction issues.';
	gateActive: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'True if an enterprise account or managed-settings gate is active.' };
	gateSatisfied: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'True if the active enterprise gate is satisfied.' };
	reasonNotSatisfied: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Bucketed reason the gate is unsatisfied: noAccount, wrongProvider, orgNotApproved, policyNotResolved, or managedSettingsRefresh.' };
};

type ManagedSettingsBlockedFreshness = Extract<IManagedSettingsFreshness, { state: ManagedSettingsFreshnessState.Blocked }>;
type ManagedSettingsBlockedDialogFreshness = ManagedSettingsBlockedFreshness & {
	readonly failure: Exclude<ManagedSettingsFreshnessFailure, ManagedSettingsFreshnessFailure.UpdateRequired>;
};

function isManagedSettingsBlockedDialogFreshness(freshness: ManagedSettingsBlockedFreshness): freshness is ManagedSettingsBlockedDialogFreshness {
	return freshness.failure !== ManagedSettingsFreshnessFailure.UpdateRequired;
}

/**
 * UX/observability adapter for the Account Policy gate. Mirrors gate state into
 * a context key, shows a sign-in notification when restricted, and emits telemetry.
 * Does NOT re-evaluate the gate — `AccountPolicyService` owns that.
 */
export class AccountPolicyGateContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.accountPolicyGate';

	private readonly contextKey: IContextKey<boolean>;
	private lastInfo: IAccountPolicyGateInfo;

	private readonly notificationHandle = this._register(new MutableDisposable());
	private readonly managedSettingsPendingNotificationHandle = this._register(new MutableDisposable());
	private managedSettingsDialogVisibleKey: string | undefined;
	private managedSettingsDialogDismissedKey: string | undefined;
	private dismissedKey: string | undefined;

	private initialised = false;

	constructor(
		@IAccountPolicyGateService private readonly gateService: IAccountPolicyGateService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IChatEntitlementService private readonly chatEntitlementService: IChatEntitlementService,
		@IDefaultAccountService private readonly defaultAccountService: IDefaultAccountService,
		@ILogService private readonly logService: ILogService,
		@INotificationService private readonly notificationService: INotificationService,
		@IDialogService private readonly dialogService: IDialogService,
		@ICommandService private readonly commandService: ICommandService,
		@IOpenerService private readonly openerService: IOpenerService,
		@IProductService private readonly productService: IProductService,
		@IStorageService private readonly storageService: IStorageService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
	) {
		super();
		this.contextKey = ChatAccountPolicyGateActiveContext.bindTo(contextKeyService);
		this.lastInfo = this.gateService.gateInfo;
		this.updateManagedSettingsCompatibilityState();

		// Apply context key + setForceHidden immediately (fail-closed), but defer the
		// notification until either the first onDidChangeGateInfo or a 5s timeout —
		// without this, a startup race shows "sign in" before the default account loads.
		this.apply(this.lastInfo, /*forceTelemetry*/ true, /*showNotification*/ false);

		this._register(this.gateService.onDidChangeGateInfo(info => {
			this.initialised = true;
			this.apply(info, /*forceTelemetry*/ false, /*showNotification*/ true);
		}));
		this._register(this.defaultAccountService.onDidChangeManagedSettingsCompatibilityError(() => this.updateManagedSettingsCompatibilityState()));

		this._register(disposableTimeout(() => {
			if (!this.initialised) {
				this.initialised = true;
				this.apply(this.lastInfo, /*forceTelemetry*/ false, /*showNotification*/ true);
			}
		}, 5000));
	}

	private apply(info: IAccountPolicyGateInfo, forceTelemetry: boolean, showNotification: boolean): void {
		const stateChanged = forceTelemetry || info.state !== this.lastInfo.state || info.reason !== this.lastInfo.reason;
		this.lastInfo = info;

		// Suppress the context key during the transient `policyNotResolved` state
		// (user IS in approved org, just waiting for data) so the UI doesn't flash.
		const isRestricted = this.isGateRestricted(info);
		this.updatePolicyGateState();
		this.logService.info(`[AccountPolicyGate] apply: state=${info.state}, reason=${info.reason}, isRestricted=${isRestricted}`);

		if (stateChanged) {
			this.telemetryService.publicLog2<AccountPolicyGateStateEvent, AccountPolicyGateStateClassification>('accountPolicy.gateState', {
				gateActive: info.state !== AccountPolicyGateState.Inactive,
				gateSatisfied: info.state === AccountPolicyGateState.Satisfied,
				reasonNotSatisfied: info.reason,
			});
		}

		if (info.reason === AccountPolicyGateUnsatisfiedReason.ManagedSettingsRefresh) {
			this.notificationHandle.clear();
			this.dismissedKey = undefined;
			this.updateManagedSettingsPendingNotification(info.managedSettingsFreshness);
			if (showNotification) {
				this.maybeShowManagedSettingsDialog();
			}
			return;
		}
		this.managedSettingsPendingNotificationHandle.clear();
		if (showNotification) {
			this.maybeShowManagedSettingsDialog();
		}

		if (info.state !== AccountPolicyGateState.Restricted) {
			this.notificationHandle.clear();
			this.dismissedKey = undefined;
			this.storageService.remove(NOTIFICATION_DISMISSED_KEY, StorageScope.APPLICATION);
			return;
		}

		if (!showNotification) {
			return;
		}

		if (info.reason === AccountPolicyGateUnsatisfiedReason.PolicyNotResolved) {
			return;
		}

		const accountName = this.defaultAccountService.currentDefaultAccount?.accountName;
		const notificationKey = `${info.reason ?? ''}:${accountName ?? ''}`;

		if (this.dismissedKey !== undefined && this.dismissedKey !== notificationKey) {
			this.notificationHandle.clear();
			this.dismissedKey = undefined;
		}
		this.maybeShowNotification(info, notificationKey);
	}

	private maybeShowNotification(info: IAccountPolicyGateInfo, notificationKey: string): void {
		if (this.notificationHandle.value) {
			return;
		}
		if (this.dismissedKey === notificationKey) {
			return;
		}
		const persistedDismissed = this.storageService.get(NOTIFICATION_DISMISSED_KEY, StorageScope.APPLICATION);
		if (persistedDismissed === notificationKey) {
			return;
		}

		const accountName = this.defaultAccountService.currentDefaultAccount?.accountName;
		const approvedOrgs = info.approvedOrganizations ?? [];
		const hasConcreteOrgs = approvedOrgs.length > 0 && !approvedOrgs.includes('*');

		// Notifications render as plain inline text — comma-separate orgs.
		const orgList = approvedOrgs.join(', ');
		let message: string;
		if (accountName && hasConcreteOrgs) {
			message = localize(
				'accountPolicy.notification.orgWithAccount',
				"Your administrator restricts AI features to GitHub accounts in the following organizations: {0}. The account \"{1}\" is not a member of any of these.",
				orgList,
				accountName
			);
		} else if (accountName) {
			message = localize(
				'accountPolicy.notification.orgWithAccountNoList',
				"Your administrator restricts AI features to specific GitHub accounts. The account \"{0}\" does not qualify.",
				accountName
			);
		} else if (hasConcreteOrgs) {
			message = localize(
				'accountPolicy.notification.signinWithOrgs',
				"Your administrator restricts AI features to GitHub accounts in the following organizations: {0}.",
				orgList
			);
		} else {
			message = localize(
				'accountPolicy.notification.signin',
				"Your administrator restricts AI features to specific GitHub accounts."
			);
		}

		const handleDisposables = new DisposableStore();
		const handle = this.notificationService.prompt(
			Severity.Warning,
			message,
			[
				{
					label: localize('accountPolicy.notification.signin.action', "Sign In"),
					run: () => this.commandService.executeCommand(DEFAULT_ACCOUNT_SIGN_IN_COMMAND),
				},
				{
					label: localize('accountPolicy.notification.learnMore', "Learn More"),
					run: () => this.openerService.open(URI.parse('https://code.visualstudio.com/docs/enterprise/overview')),
				},
			],
			{ sticky: true }
		);

		handleDisposables.add(handle.onDidClose(() => {
			this.dismissedKey = notificationKey;
			this.notificationHandle.clear();
		}));
		handleDisposables.add({ dispose: () => handle.close() });
		this.notificationHandle.value = handleDisposables;
	}

	private isGateRestricted(info: IAccountPolicyGateInfo): boolean {
		return info.state === AccountPolicyGateState.Restricted
			&& info.reason !== AccountPolicyGateUnsatisfiedReason.PolicyNotResolved;
	}

	private updatePolicyGateState(): void {
		const blocked = this.isGateRestricted(this.lastInfo) || this.defaultAccountService.managedSettingsCompatibilityError !== null;
		this.contextKey.set(blocked);
		this.chatEntitlementService.setForceHidden(blocked);
	}

	private updateManagedSettingsCompatibilityState(): void {
		this.updatePolicyGateState();
		this.maybeShowManagedSettingsDialog();
	}

	private updateManagedSettingsPendingNotification(freshness: IManagedSettingsFreshness | undefined): void {
		if (freshness?.state !== ManagedSettingsFreshnessState.Pending) {
			this.managedSettingsPendingNotificationHandle.clear();
			return;
		}
		if (this.managedSettingsPendingNotificationHandle.value) {
			return;
		}

		const store = new DisposableStore();
		this.managedSettingsPendingNotificationHandle.value = store;
		store.add(disposableTimeout(() => {
			const handle = this.notificationService.prompt(
				Severity.Info,
				localize('managedSettingsRefresh.notification.pending', "{0} is resolving your organization's policy. AI features will remain unavailable until this completes.", this.productService.nameShort),
				[],
				{ sticky: true }
			);
			store.add(toDisposable(() => handle.close()));
		}, 5000));
	}

	private maybeShowManagedSettingsDialog(): void {
		const key = this.getManagedSettingsDialogKey();
		if (!key) {
			const freshness = this.lastInfo.reason === AccountPolicyGateUnsatisfiedReason.ManagedSettingsRefresh
				? this.lastInfo.managedSettingsFreshness
				: undefined;
			if (!this.managedSettingsDialogVisibleKey && freshness?.state !== ManagedSettingsFreshnessState.Pending) {
				this.managedSettingsDialogDismissedKey = undefined;
			}
			return;
		}
		if (this.managedSettingsDialogVisibleKey || this.managedSettingsDialogDismissedKey === key) {
			return;
		}

		this.managedSettingsDialogVisibleKey = key;
		void this.showManagedSettingsDialog().finally(() => {
			this.managedSettingsDialogVisibleKey = undefined;
			this.managedSettingsDialogDismissedKey = key;
			this.maybeShowManagedSettingsDialog();
		});
	}

	private getManagedSettingsDialogKey(): string | undefined {
		if (this.defaultAccountService.managedSettingsCompatibilityError) {
			return ManagedSettingsFreshnessFailure.UpdateRequired;
		}
		const freshness = this.getBlockedManagedSettingsFreshness();
		return freshness?.failure === ManagedSettingsFreshnessFailure.UpdateRequired ? undefined : freshness?.failure;
	}

	private getBlockedManagedSettingsFreshness(): ManagedSettingsBlockedFreshness | undefined {
		const freshness = this.lastInfo.reason === AccountPolicyGateUnsatisfiedReason.ManagedSettingsRefresh
			? this.lastInfo.managedSettingsFreshness
			: undefined;
		return freshness?.state === ManagedSettingsFreshnessState.Blocked ? freshness : undefined;
	}

	private showManagedSettingsDialog(): Promise<unknown> {
		const compatibilityError = this.defaultAccountService.managedSettingsCompatibilityError;
		if (compatibilityError) {
			return this.showManagedSettingsCompatibilityDialog(compatibilityError);
		}
		const freshness = this.getBlockedManagedSettingsFreshness();
		return freshness && isManagedSettingsBlockedDialogFreshness(freshness)
			? this.showManagedSettingsBlockedDialog(freshness)
			: Promise.resolve();
	}

	private getManagedSettingsBlockedMessage(freshness: ManagedSettingsBlockedDialogFreshness): string {
		switch (freshness.failure) {
			case ManagedSettingsFreshnessFailure.NoToken:
				return localize('managedSettingsRefresh.dialog.noToken', "AI features are unavailable because {0} must refresh your organization's managed settings. Sign in to continue.", this.productService.nameShort);
			case ManagedSettingsFreshnessFailure.NoUrl:
				return localize('managedSettingsRefresh.dialog.noUrl', "AI features are unavailable because {0} cannot locate your organization's managed settings service. Contact your administrator.", this.productService.nameShort);
			case ManagedSettingsFreshnessFailure.RateLimited:
				return localize('managedSettingsRefresh.dialog.rateLimited', "AI features are temporarily unavailable because your organization's managed settings service is rate limiting requests. Try again later.");
			case ManagedSettingsFreshnessFailure.HttpError:
				return localize('managedSettingsRefresh.dialog.httpError', "AI features are unavailable because {0} could not refresh your organization's managed settings (HTTP {1}). Retry after checking your connection.", this.productService.nameShort, freshness.httpStatus);
			case ManagedSettingsFreshnessFailure.Malformed:
				return localize('managedSettingsRefresh.dialog.malformed', "AI features are unavailable because {0} received an invalid managed settings response. Retry or contact your administrator.", this.productService.nameShort);
			case ManagedSettingsFreshnessFailure.Network:
				return localize('managedSettingsRefresh.dialog.network', "Your organization requires {0} to refresh managed settings whenever it starts or reloads.\n\nAn error prevented the required policy from being retrieved, so AI features are unavailable. Retry, or contact your organization's administrator if the issue persists.", this.productService.nameShort);
		}
	}

	private showManagedSettingsBlockedDialog(freshness: ManagedSettingsBlockedDialogFreshness): Promise<unknown> {
		const buttons: IPromptButton<unknown>[] = [];
		if (freshness.failure === ManagedSettingsFreshnessFailure.NoToken) {
			buttons.push({
				label: localize('managedSettingsRefresh.dialog.signIn', "Sign In"),
				run: () => this.commandService.executeCommand(DEFAULT_ACCOUNT_SIGN_IN_COMMAND),
			});
		} else if (freshness.failure !== ManagedSettingsFreshnessFailure.NoUrl) {
			buttons.push({
				label: localize('managedSettingsRefresh.dialog.retry', "Retry"),
				run: () => {
					void this.defaultAccountService.refresh({ forceRefresh: true, retryManagedSettings: true });
				},
			});
		}

		const title = freshness.failure === ManagedSettingsFreshnessFailure.Malformed
			? localize('managedSettingsRefresh.dialog.invalidTitle', "Invalid Managed Settings")
			: localize('managedSettingsRefresh.dialog.title', "Managed Settings Unavailable");
		return this.dialogService.prompt({
			type: Severity.Warning,
			title,
			message: this.getManagedSettingsBlockedMessage(freshness),
			custom: true,
			buttons,
			cancelButton: localize('managedSettingsRefresh.dialog.close', "Close"),
		});
	}

	private showManagedSettingsCompatibilityDialog(error: IManagedSettingsCompatibilityError): Promise<unknown> {
		const message = error.minimumClientVersion
			? localize(
				'managedSettingsUpdate.notificationWithMinimumVersion',
				"Your version of {0} cannot enforce your organization's managed settings. Update {0} to version {1} or later to continue using AI features.",
				this.productService.nameShort,
				error.minimumClientVersion
			)
			: localize(
				'managedSettingsUpdate.notification',
				"Your version of {0} cannot enforce your organization's managed settings. Update {0} to continue using AI features.",
				this.productService.nameShort
			);
		return this.dialogService.prompt({
			type: Severity.Warning,
			title: localize('managedSettingsUpdate.dialog.title', "Update Required"),
			message,
			custom: true,
			buttons: [
				{
					label: localize('managedSettingsUpdate.dialog.update', "Check for Updates"),
					run: () => this.commandService.executeCommand('update.checkForUpdate'),
				},
				{
					label: localize('managedSettingsUpdate.dialog.learnMore', "Learn More"),
					run: () => this.openerService.open(URI.parse('https://code.visualstudio.com/docs/enterprise/overview')),
				},
			],
			cancelButton: localize('managedSettingsUpdate.dialog.close', "Close"),
		});
	}
}
