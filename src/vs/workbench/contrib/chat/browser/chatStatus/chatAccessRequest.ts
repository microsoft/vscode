/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDefaultAccount } from '../../../../../base/common/defaultAccount.js';
import { Emitter } from '../../../../../base/common/event.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize } from '../../../../../nls.js';
import { ChatAIDisabledSettingId } from '../../../../../platform/chat/common/chatSettings.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IDefaultAccountService } from '../../../../../platform/defaultAccount/common/defaultAccount.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { IOpenerService } from '../../../../../platform/opener/common/opener.js';
import { ITelemetryService, TelemetryLevel } from '../../../../../platform/telemetry/common/telemetry.js';
import { getTelemetryLevel } from '../../../../../platform/telemetry/common/telemetryUtils.js';
import { IAuthenticationService } from '../../../../services/authentication/common/authentication.js';
import { IChatEntitlementService } from '../../../../services/chat/common/chatEntitlementService.js';

interface IAccessRequestAssignment {
	readonly variant: 'control' | 'treatment';
	readonly assignmentContext: string;
	readonly dataVersion: number;
	readonly copilotTrackingId: string;
	readonly sessionId: string;
	readonly providerId: string;
}

type AccessRequestEvent = {
	action: 'trigger' | 'impression' | 'click';
	variant: 'control' | 'treatment';
	assignmentContext: string;
	dataVersion: number;
	copilotTrackingId: string;
};

type AccessRequestClassification = {
	owner: 'siddharth-ramesh';
	comment: 'Measures contextual Copilot access discovery, not seat request creation.';
	action: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Eligible visible trigger, displayed action, or action click.' };
	variant: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Explicit server-assigned variant.' };
	assignmentContext: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Server assignment context for this exposure.' };
	dataVersion: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Server assignment configuration version.' };
	copilotTrackingId: { classification: 'EndUserPseudonymizedInformation'; purpose: 'BusinessInsight'; endpoint: 'GoogleAnalyticsId'; comment: 'Canonical analytics ID from the same account entitlement response as the assignment.' };
};

function getAssignment(account: IDefaultAccount | null): IAccessRequestAssignment | undefined {
	const data = account?.entitlementsData;
	const assignment = data?.copilot_access_request_assignment;
	if (!account || data?.can_request_copilot_access !== true ||
		typeof data.analytics_tracking_id !== 'string' || !data.analytics_tracking_id.trim() ||
		!assignment || (assignment.variant !== 'control' && assignment.variant !== 'treatment') ||
		typeof assignment.assignment_context !== 'string' || !assignment.assignment_context.trim() ||
		!Number.isSafeInteger(assignment.data_version) || assignment.data_version < 0) {
		return undefined;
	}

	return {
		variant: assignment.variant,
		assignmentContext: assignment.assignment_context,
		dataVersion: assignment.data_version,
		copilotTrackingId: data.analytics_tracking_id,
		sessionId: account.sessionId,
		providerId: account.authenticationProvider.id
	};
}

function sameAccount(first: IDefaultAccount | null, second: IDefaultAccount | null): boolean {
	return !!first && !!second &&
		first.sessionId === second.sessionId &&
		first.authenticationProvider.id === second.authenticationProvider.id &&
		first.entitlementsData?.analytics_tracking_id === second.entitlementsData?.analytics_tracking_id;
}

function sameAssignment(first: IAccessRequestAssignment | undefined, second: IAccessRequestAssignment | undefined): boolean {
	return !!first && !!second &&
		first.sessionId === second.sessionId && first.providerId === second.providerId &&
		first.copilotTrackingId === second.copilotTrackingId && first.variant === second.variant &&
		first.assignmentContext === second.assignmentContext && first.dataVersion === second.dataVersion;
}

export class ChatAccessRequestController extends Disposable {
	private readonly changeEmitter = this._register(new Emitter<void>());
	readonly onDidChange = this.changeEmitter.event;

	private assignment: IAccessRequestAssignment | undefined;
	private trigger: IAccessRequestAssignment | undefined;
	private impression: IAccessRequestAssignment | undefined;
	private generation = 0;
	private opening = false;

	constructor(
		@IDefaultAccountService private readonly defaultAccountService: IDefaultAccountService,
		@IChatEntitlementService private readonly chatEntitlementService: IChatEntitlementService,
		@IAuthenticationService authenticationService: IAuthenticationService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@IOpenerService private readonly openerService: IOpenerService,
		@INotificationService private readonly notificationService: INotificationService,
		@ILogService private readonly logService: ILogService,
	) {
		super();

		let account = this.defaultAccountService.currentDefaultAccount;
		this._register(this.defaultAccountService.onDidChangeDefaultAccount(current => {
			if (!sameAccount(account, current)) {
				this.generation++;
				this.trigger = this.impression = undefined;
			}
			account = current;
			if (!sameAssignment(this.assignment, getAssignment(current))) {
				this.clear();
			}
		}));
		this._register(authenticationService.onDidChangeSessions(e => {
			if (e.providerId === account?.authenticationProvider.id) {
				this.generation++;
				this.clear();
			}
		}));
		this._register(this.chatEntitlementService.onDidChangeSentiment(() => {
			if (!this.enabled) {
				this.generation++;
				this.clear();
			}
		}));
		this._register(this.configurationService.onDidChangeConfiguration(() => {
			if (!this.enabled) {
				this.generation++;
				this.clear();
			}
		}));
	}

	private get enabled(): boolean {
		const sentiment = this.chatEntitlementService.sentiment;
		return !this._store.isDisposed && !sentiment.hidden && !sentiment.disabled &&
			!sentiment.disabledInWorkspace && !sentiment.untrusted &&
			this.configurationService.getValue(ChatAIDisabledSettingId) !== true &&
			getTelemetryLevel(this.configurationService) === TelemetryLevel.USAGE;
	}

	get visible(): boolean {
		return this.enabled && this.assignment?.variant === 'treatment' &&
			sameAssignment(this.assignment, getAssignment(this.defaultAccountService.currentDefaultAccount));
	}

	private clear(): void {
		this.assignment = undefined;
		this.changeEmitter.fire();
	}

	/** Uses the dashboard's existing entitlement refresh when provided. */
	async refresh(entitlementRefresh?: Promise<void>): Promise<void> {
		const generation = ++this.generation;
		const account = this.defaultAccountService.currentDefaultAccount;
		const startedAt = Date.now();
		this.clear();
		if (!this.enabled || !account) {
			return;
		}

		try {
			if (entitlementRefresh) {
				await entitlementRefresh;
			} else {
				await this.defaultAccountService.refresh({ refreshEntitlements: true });
			}
		} catch (error) {
			this.logService.error('[chat access request] Failed to refresh entitlements', error);
			return;
		}

		const current = this.defaultAccountService.currentDefaultAccount;
		if (!this.enabled || generation !== this.generation || !sameAccount(account, current) ||
			typeof current?.entitlementsDataFetchedAt !== 'number' || !Number.isFinite(current.entitlementsDataFetchedAt) ||
			current.entitlementsDataFetchedAt < startedAt ||
			(account.entitlementsDataFetchedAt !== undefined && current.entitlementsDataFetchedAt <= account.entitlementsDataFetchedAt)) {
			return;
		}
		this.assignment = getAssignment(current);
		this.changeEmitter.fire();
	}

	recordTrigger(): void {
		if (this.enabled && this.assignment && sameAssignment(this.assignment, getAssignment(this.defaultAccountService.currentDefaultAccount)) &&
			!sameAssignment(this.trigger, this.assignment)) {
			this.trigger = this.assignment;
			this.log('trigger', this.assignment);
		}
	}

	recordImpression(): void {
		if (this.visible && this.assignment && !sameAssignment(this.impression, this.assignment)) {
			this.recordTrigger();
			this.impression = this.assignment;
			this.log('impression', this.assignment);
		}
	}

	async open(): Promise<void> {
		if (!this.visible || !this.assignment || this.opening) {
			return;
		}
		this.opening = true;
		const clickedAssignment = this.assignment;
		this.log('click', clickedAssignment);
		try {
			await this.refresh();
			if (!this.visible || !sameAssignment(clickedAssignment, this.assignment)) {
				if (this.enabled) {
					this.notificationService.info(localize('accessRequestChanged', "Copilot access options have changed. Open Copilot status to try again."));
				}
				return;
			}
			const opened = await this.openerService.open(URI.parse('https://github.com/settings/copilot/features?contextual_access=1#copilot-access-requests'), {
				openExternal: true,
				allowContributedOpeners: false,
				allowCommands: false
			});
			if (!opened) {
				this.notificationService.warn(localize('accessRequestNotOpened', "Unable to open Copilot settings in your browser."));
			}
		} catch (error) {
			this.logService.error('[chat access request] Failed to open Copilot settings', error);
			if (this.enabled) {
				this.notificationService.error(localize('accessRequestOpenFailed', "Unable to open Copilot settings in your browser."));
			}
		} finally {
			this.opening = false;
		}
	}

	private log(action: AccessRequestEvent['action'], assignment: IAccessRequestAssignment): void {
		this.telemetryService.publicLog2<AccessRequestEvent, AccessRequestClassification>('copilotAccessRequest', {
			action,
			variant: assignment.variant,
			assignmentContext: assignment.assignmentContext,
			dataVersion: assignment.dataVersion,
			copilotTrackingId: assignment.copilotTrackingId
		});
	}
}
