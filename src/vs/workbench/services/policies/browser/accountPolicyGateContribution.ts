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
 * Observes the Account Policy gate computed by `IAccountPolicyGateService` and:
 *   - mirrors the gate state into a workbench context key so welcome views/menus can react;
 *   - shows a notification with a Sign In action when the gate is active but unsatisfied;
 *   - emits telemetry whenever the gate state changes.
 *
 * The actual restriction of feature values lives in `AccountPolicyService` itself; this
 * contribution is a thin UX/observability adapter and does NOT re-evaluate the gate.
 */
export class AccountPolicyGateContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.accountPolicyGate';

	private readonly contextKey: IContextKey<boolean>;
	private lastInfo: IAccountPolicyGateInfo;

	private readonly notificationHandle = this._register(new MutableDisposable());
	private dismissedKey: string | undefined; // tracks reason+account combo for session-scoped dismissal

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

		// Seed context key + setForceHidden immediately (fail-closed) but
		// defer the notification until the first onDidChangeGateInfo event
		// so the default account has had time to resolve. Without this, a
		// race on startup shows "sign in" even when the user is already
		// signed in (just not yet loaded).
		this.apply(this.lastInfo, /*forceTelemetry*/ true, /*showNotification*/ false);

		this._register(this.gateService.onDidChangeGateInfo(info => {
			this.initialised = true;
			this.apply(info, /*forceTelemetry*/ false, /*showNotification*/ true);
		}));

		// If the gate never fires a change (already stable), show the
		// notification after a short delay to let the account service load.
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

		// `policyNotResolved` is transient — the user IS in an approved org but account
		// data hasn't loaded yet. Don't set the context key for this state so the UI
		// stays visible (policies aren't being restricted either — see AccountPolicyService).
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

		// `policyNotResolved` is transient — don't show a notification for it.
		if (info.reason === AccountPolicyGateUnsatisfiedReason.PolicyNotResolved) {
			return;
		}

		// Build a composite key from the reason + current account name so that
		// swapping to a different account (while still blocked) re-shows the notification.
		const accountName = this.defaultAccountService.currentDefaultAccount?.accountName;
		const notificationKey = `${info.reason ?? ''}:${accountName ?? ''}`;

		// If the key changed (different reason or different account), close the old
		// notification and reset the session-scoped dismissal.
		if (this.dismissedKey !== undefined && this.dismissedKey !== notificationKey) {
			this.notificationHandle.clear();
			this.dismissedKey = undefined;
		}
		this.maybeShowNotification(info, notificationKey);
	}

	private maybeShowNotification(info: IAccountPolicyGateInfo, notificationKey: string): void {
		if (this.notificationHandle.value) {
			return; // already showing for this reason+account
		}
		if (this.dismissedKey === notificationKey) {
			return; // user dismissed for this reason+account this session
		}
		const persistedDismissed = this.storageService.get(NOTIFICATION_DISMISSED_KEY, StorageScope.APPLICATION);
		if (persistedDismissed === notificationKey) {
			return; // user clicked "Don't Show Again" for this same combo on this machine
		}

		const reason = info.reason;
		const accountName = this.defaultAccountService.currentDefaultAccount?.accountName;
		const approvedOrgs = info.approvedOrganizations ?? [];
		const hasConcreteOrgs = approvedOrgs.length > 0 && !approvedOrgs.includes('*');

		// Build the message — notifications render as plain inline text, so use
		// a comma-separated org list rather than bullet points / newlines.
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
