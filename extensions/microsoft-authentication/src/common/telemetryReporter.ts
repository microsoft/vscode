/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AuthError } from '@azure/msal-node';
import TelemetryReporter, { TelemetryEventProperties } from '@vscode/extension-telemetry';
import { IExperimentationTelemetry } from 'vscode-tas-client';

export const enum MicrosoftAccountType {
	AAD = 'aad',
	MSA = 'msa',
	Unknown = 'unknown'
}

export class MicrosoftAuthenticationTelemetryReporter implements IExperimentationTelemetry {
	private sharedProperties: Record<string, string> = {};
	protected _telemetryReporter: TelemetryReporter;
	constructor(aiKey: string) {
		this._telemetryReporter = new TelemetryReporter(aiKey);
	}

	get telemetryReporter(): TelemetryReporter {
		return this._telemetryReporter;
	}

	setSharedProperty(name: string, value: string): void {
		this.sharedProperties[name] = value;
	}

	postEvent(eventName: string, props: Map<string, string>): void {
		const eventProperties: TelemetryEventProperties = { ...this.sharedProperties, ...Object.fromEntries(props) };
		this._telemetryReporter.sendTelemetryEvent(
			eventName,
			eventProperties
		);
	}

	sendActivatedWithMsalNoBrokerEvent(): void {
		/* __GDPR__
			"activatingMsalNoBroker" : { "owner": "TylerLeonhardt", "comment": "Used to determine how often users use the msal-no-broker login flow. This only fires if the user explictly opts in to this." }
		*/
		this._telemetryReporter.sendTelemetryEvent('activatingmsalnobroker');
	}

	sendActivatedWithClassicImplementationEvent(reason: 'setting' | 'web'): void {
		/* __GDPR__
			"activatingClassic" : {
				"owner": "TylerLeonhardt",
				"comment": "Used to determine how often users use the classic login flow.",
				"reason": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Why classic was used" }
			}
		*/
		this._telemetryReporter.sendTelemetryEvent('activatingClassic', { reason });
	}

	sendLoginEvent(scopes: readonly string[]): void {
		/* __GDPR__
			"login" : {
				"owner": "TylerLeonhardt",
				"comment": "Used to determine the usage of the Microsoft Auth Provider.",
				"scopes": { "classification": "PublicNonPersonalData", "purpose": "FeatureInsight", "comment": "Used to determine what scope combinations are being requested." }
			}
		*/
		this._telemetryReporter.sendTelemetryEvent('login', {
			// Get rid of guids from telemetry.
			scopes: JSON.stringify(this._scrubGuids(scopes)),
		});
	}
	sendLoginFailedEvent(): void {
		/* __GDPR__
			"loginFailed" : { "owner": "TylerLeonhardt", "comment": "Used to determine how often users run into issues with the login flow." }
		*/
		this._telemetryReporter.sendTelemetryEvent('loginFailed');
	}
	sendLogoutEvent(): void {
		/* __GDPR__
			"logout" : { "owner": "TylerLeonhardt", "comment": "Used to determine how often users log out." }
		*/
		this._telemetryReporter.sendTelemetryEvent('logout');
	}
	sendLogoutFailedEvent(): void {
		/* __GDPR__
			"logoutFailed" : { "owner": "TylerLeonhardt", "comment": "Used to determine how often fail to log out." }
		*/
		this._telemetryReporter.sendTelemetryEvent('logoutFailed');
	}

	sendTelemetryErrorEvent(error: Error | string): void {
		let errorMessage: string | undefined;
		let errorName: string | undefined;
		let errorCode: string | undefined;
		let errorCorrelationId: string | undefined;
		if (typeof error === 'string') {
			errorMessage = error;
		} else {
			const authError: AuthError = error as AuthError;
			// don't set error message or stack because it contains PII
			errorCode = authError.errorCode;
			errorCorrelationId = authError.correlationId;
			errorName = authError.name;
		}

		/* __GDPR__
			"msalError" : {
				"owner": "TylerLeonhardt",
				"comment": "Used to determine how often users run into issues with the login flow.",
				"errorMessage": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The error message." },
				"errorName": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The name of the error." },
				"errorCode": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The error code." },
				"errorCorrelationId": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The error correlation id." }
			}
		*/
		this._telemetryReporter.sendTelemetryErrorEvent('msalError', {
			errorMessage,
			errorName,
			errorCode,
			errorCorrelationId,
		});
	}

	/**
	 * Sends an event for an account type available at startup.
	 * @param scopes The scopes for the session
	 * @param accountType The account type for the session
	 * @todo Remove the scopes since we really don't care about them.
	 */
	sendAccountEvent(scopes: string[], accountType: MicrosoftAccountType): void {
		/* __GDPR__
			"account" : {
				"owner": "TylerLeonhardt",
				"comment": "Used to determine the usage of the Microsoft Auth Provider.",
				"scopes": { "classification": "PublicNonPersonalData", "purpose": "FeatureInsight", "comment": "Used to determine what scope combinations are being requested." },
				"accountType": { "classification": "PublicNonPersonalData", "purpose": "FeatureInsight", "comment": "Used to determine what account types are being used." }
			}
		*/
		this._telemetryReporter.sendTelemetryEvent('account', {
			// Get rid of guids from telemetry.
			scopes: JSON.stringify(this._scrubGuids(scopes)),
			accountType
		});
	}

	protected _scrubGuids(scopes: readonly string[]): string[] {
		return scopes.map(s => s.replace(/[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}/i, '{guid}'));
	}
}

export class MicrosoftSovereignCloudAuthenticationTelemetryReporter extends MicrosoftAuthenticationTelemetryReporter {
	override sendLoginEvent(scopes: string[]): void {
		/* __GDPR__
			"loginMicrosoftSovereignCloud" : {
				"owner": "TylerLeonhardt",
				"comment": "Used to determine the usage of the Microsoft Auth Provider.",
				"scopes": { "classification": "PublicNonPersonalData", "purpose": "FeatureInsight", "comment": "Used to determine what scope combinations are being requested." }
			}
		*/
		this._telemetryReporter.sendTelemetryEvent('loginMicrosoftSovereignCloud', {
			// Get rid of guids from telemetry.
			scopes: JSON.stringify(this._scrubGuids(scopes)),
		});
	}
	override sendLoginFailedEvent(): void {
		/* __GDPR__
			"loginMicrosoftSovereignCloudFailed" : { "owner": "TylerLeonhardt", "comment": "Used to determine how often users run into issues with the login flow." }
		*/
		this._telemetryReporter.sendTelemetryEvent('loginMicrosoftSovereignCloudFailed');
	}
	override sendLogoutEvent(): void {
		/* __GDPR__
			"logoutMicrosoftSovereignCloud" : { "owner": "TylerLeonhardt", "comment": "Used to determine how often users log out." }
		*/
		this._telemetryReporter.sendTelemetryEvent('logoutMicrosoftSovereignCloud');
	}
	override sendLogoutFailedEvent(): void {
		/* __GDPR__
			"logoutMicrosoftSovereignCloudFailed" : { "owner": "TylerLeonhardt", "comment": "Used to determine how often fail to log out." }
		*/
		this._telemetryReporter.sendTelemetryEvent('logoutMicrosoftSovereignCloudFailed');
	}
}
