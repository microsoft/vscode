/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableStore, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { disposableTimeout } from '../../../../base/common/async.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IContextKey, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IDefaultAccountService } from '../../../../platform/defaultAccount/common/defaultAccount.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { INotificationService, Severity } from '../../../../platform/notification/common/notification.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
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
	gateActive: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'True if an admin has activated the Approved Account gate (non-empty approved-organization list).' };
	gateSatisfied: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'True if the gate is satisfied (signed-in approved account with resolved policy).' };
	reasonNotSatisfied: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Bucketed reason the gate is unsatisfied: noAccount, wrongProvider, orgNotApproved, policyNotResolved.' };
};

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
	private dismissedKey: string | undefined;

	private initialised = false;

	constructor(
		@IAccountPolicyGateService private readonly gateService: IAccountPolicyGateService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IChatEntitlementService private readonly chatEntitlementService: IChatEntitlementService,
		@IDefaultAccountService private readonly defaultAccountService: IDefaultAccountService,
		@ILogService private readonly logService: ILogService,
		@INotificationService private readonly notificationService: INotificationService,
		@ICommandService private readonly commandService: ICommandService,
		@IOpenerService private readonly openerService: IOpenerService,
		@IStorageService private readonly storageService: IStorageService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
	) {
		super();
		this.contextKey = ChatAccountPolicyGateActiveContext.bindTo(contextKeyService);
		this.lastInfo = this.gateService.gateInfo;

		// Apply context key + setForceHidden immediately (fail-closed), but defer the
		// notification until either the first onDidChangeGateInfo or a 5s timeout —
		// without this, a startup race shows "sign in" before the default account loads.
		this.apply(this.lastInfo, /*forceTelemetry*/ true, /*showNotification*/ false);

		this._register(this.gateService.onDidChangeGateInfo(info => {
			this.initialised = true;
			this.apply(info, /*forceTelemetry*/ false, /*showNotification*/ true);
		}));

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
		const isRestricted = info.state === AccountPolicyGateState.Restricted
			&& info.reason !== AccountPolicyGateUnsatisfiedReason.PolicyNotResolved;
		this.contextKey.set(isRestricted);
		this.chatEntitlementService.setForceHidden(isRestricted);
		this.logService.info(`[AccountPolicyGate] apply: state=${info.state}, reason=${info.reason}, isRestricted=${isRestricted}`);

		if (stateChanged) {
			this.telemetryService.publicLog2<AccountPolicyGateStateEvent, AccountPolicyGateStateClassification>('accountPolicy.gateState', {
				gateActive: info.state !== AccountPolicyGateState.Inactive,
				gateSatisfied: info.state === AccountPolicyGateState.Satisfied,
				reasonNotSatisfied: info.reason,
			});
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

		// Composite key so swapping accounts (while still blocked) re-shows the notification.
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

		const reason = info.reason;
		const accountName = this.defaultAccountService.currentDefaultAccount?.accountName;
		const approvedOrgs = info.approvedOrganizations ?? [];
		const hasConcreteOrgs = approvedOrgs.length > 0 && !approvedOrgs.includes('*');

		// Notifications render as plain inline text — comma-separate orgs.
		const orgList = approvedOrgs.join(', ');
		let message: string;
		if (reason === AccountPolicyGateUnsatisfiedReason.OrgNotApproved) {
			if (accountName && hasConcreteOrgs) {
				message = localize(
					'accountPolicy.notification.orgWithAccount',
					"The account \"{0}\" is not a member of an approved organization ({1}). Sign into an approved GitHub account to use AI features. Contact your administrator for more information.",
					accountName,
					orgList
				);
			} else if (accountName) {
				message = localize(
					'accountPolicy.notification.orgWithAccountNoList',
					"The account \"{0}\" is not a member of an approved organization. Sign into an approved GitHub account to use AI features. Contact your administrator for more information.",
					accountName
				);
			} else {
				message = localize('accountPolicy.notification.org', "Sign in with a GitHub account from an approved organization to use AI features. Contact your administrator for more information.");
			}
		} else {
			// noAccount / wrongProvider
			if (hasConcreteOrgs) {
				message = localize(
					'accountPolicy.notification.signinWithOrgs',
					"Sign in with a GitHub account from an approved organization ({0}) to use AI features.",
					orgList
				);
			} else {
				message = localize('accountPolicy.notification.signin', "Sign in with an approved GitHub account to use AI features. Contact your administrator for more information.");
			}
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
}
