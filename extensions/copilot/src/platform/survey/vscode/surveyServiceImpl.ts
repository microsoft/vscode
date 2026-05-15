/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as vscode from 'vscode';
import { l10n } from 'vscode';
import { Uri } from '../../../vscodeTypes';
import { IAuthenticationService } from '../../authentication/common/authentication';
import { IEnvService } from '../../env/common/envService';
import { IVSCodeExtensionContext } from '../../extContext/common/extensionContext';
import { IExperimentationService } from '../../telemetry/common/nullExperimentationService';
import { ITelemetryService } from '../../telemetry/common/telemetry';
import { ISurveyService } from '../common/surveyService';

const SURVEY_URI = 'https://aka.ms/vscode-gh-copilot';
const USAGE_DATA_KEY = 'survey.usage';
const NEXT_SURVEY_DATE_KEY = 'survey.nextSurveyDate';
const DAYS_14 = 14 * 24 * 60 * 60 * 1000;
const DAYS_LATER = 7;
const DAYS_COOLDOWN = 90;
const DEBOUNCE_TIME = 3 * 60 * 1000;
const INACTIVE_TIMEOUT = 5 * 60 * 1000;
const MIN_DAYS_USED = 2;
const DEFAULT_SESSION_PROBABILITY = 2;
const DEFAULT_NOTIFICATION_PROBABILITY = 20;
const DEFAULT_SESSION_PROBABILITY_INACTIVE = 1;

interface UsageData {
	firstActive: number;
	activeDays: number[];
}

export class SurveyService implements ISurveyService {
	readonly _serviceBrand: undefined;

	private readonly surveyUri: vscode.Uri;
	private debounceTimeout: any | null = null;
	private lastSource: string | null = null;
	private lastLanguageId: string | null = null;
	private readonly sessionSeed: number;

	constructor(
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@IVSCodeExtensionContext private readonly vscodeExtensionContext: IVSCodeExtensionContext,
		@IEnvService private readonly envService: IEnvService,
		@IExperimentationService private readonly experimentationService: IExperimentationService,
		@IAuthenticationService private readonly authenticationService: IAuthenticationService,
	) {
		this.surveyUri = Uri.parse(SURVEY_URI);
		this.sessionSeed = Math.random();

		// Inactive survey check only runs once
		setTimeout(async () => {
			await this.updateUsageData(false);
			const eligible = await this.checkInactiveUserHeuristic();
			if (eligible) {
				this.promptSurvey('churn');
			}
		}, INACTIVE_TIMEOUT);
	}

	public async signalUsage(source: string, languageId?: string): Promise<void> {
		await this.updateUsageData(true);
		this.lastSource = source;
		if (languageId) {
			this.lastLanguageId = languageId;
		}

		if (!this.debounceTimeout) {
			this.debounceTimeout = setTimeout(async () => {
				const eligible = await this.checkEligibility();
				if (eligible) {
					this.promptSurvey('usage');
				}
				this.debounceTimeout = null;
			}, DEBOUNCE_TIME);
		}
	}

	public async checkInactiveUserHeuristic(): Promise<boolean> {
		const usageData = await this.getUsageData();
		const nextSurveyDate = await this.getNextSurveyDate();

		const now = Date.now();
		const daysUsedInLast14Days = usageData.activeDays.length;

		const isOldEnough = usageData.firstActive > 0 && usageData.firstActive < now - DAYS_14;
		const isCooldownOver = !nextSurveyDate || nextSurveyDate < now;
		const hasNotBeenActiveInLast14Days = daysUsedInLast14Days === 0;

		const isEligible = hasNotBeenActiveInLast14Days && isOldEnough && isCooldownOver;

		if (isEligible) {
			const sessionProbability = this.experimentationService.getTreatmentVariable<number>('copilotchat.feedback.sessionProbability.inactive') ?? DEFAULT_SESSION_PROBABILITY_INACTIVE;
			return (this.sessionSeed < sessionProbability / 100);
		}

		return false;
	}

	private async checkEligibility(): Promise<boolean> {
		const usageData = await this.getUsageData();
		const nextSurveyDate = await this.getNextSurveyDate();

		const now = Date.now();
		const daysUsedInLast14Days = usageData.activeDays.length;

		const isOldEnough = usageData.firstActive < now - DAYS_14;
		const isCooldownOver = !nextSurveyDate || nextSurveyDate < now;
		const hasEnoughUsage = daysUsedInLast14Days >= MIN_DAYS_USED;

		const isEligible = hasEnoughUsage && isOldEnough && isCooldownOver;

		if (isEligible) {
			const sessionProbability = this.experimentationService.getTreatmentVariable<number>('copilotchat.feedback.sessionProbability') ?? DEFAULT_SESSION_PROBABILITY;
			if (this.sessionSeed < sessionProbability / 100) {
				const notificationProbability = this.experimentationService.getTreatmentVariable<number>('copilotchat.feedback.notificationProbability') ?? DEFAULT_NOTIFICATION_PROBABILITY;
				const seed = Math.random();
				return seed < notificationProbability / 100;
			}
		}

		return false;
	}

	private async getUsageData(): Promise<UsageData> {
		const usageData = this.vscodeExtensionContext.globalState.get<UsageData>(USAGE_DATA_KEY);
		if (usageData) {
			return usageData;
		}
		return { firstActive: 0, activeDays: [] };
	}

	private async getNextSurveyDate(): Promise<number | null> {
		return this.vscodeExtensionContext.globalState.get<number>(NEXT_SURVEY_DATE_KEY) ?? null;
	}

	private async updateUsageData(wasActive: boolean): Promise<void> {
		const usageData = await this.getUsageData();
		const now = Date.now();

		if (wasActive) {
			// Set firstActive if not already set
			if (!usageData.firstActive) {
				usageData.firstActive = now;
			}

			const today = new Date().setHours(0, 0, 0, 0);
			// Add today's timestamp if not already present
			if (!usageData.activeDays.includes(today)) {
				usageData.activeDays.push(today);
			}
		}

		// Prune timestamps older than 14 days
		usageData.activeDays = usageData.activeDays.filter(timestamp => timestamp >= now - DAYS_14);

		await this.vscodeExtensionContext.globalState.update(USAGE_DATA_KEY, usageData);
	}

	private async updateNextSurveyDate(days: number): Promise<void> {
		await this.vscodeExtensionContext.globalState.update(NEXT_SURVEY_DATE_KEY, Date.now() + days * 24 * 60 * 60 * 1000);
	}

	private async promptSurvey(surveyType: 'churn' | 'usage'): Promise<void> {
		const usage = await this.getUsageData();
		const source = this.lastSource || '';
		const language = this.lastLanguageId || '';
		const firstSeenInDays = Math.floor((Date.now() - usage.firstActive) / (1000 * 60 * 60 * 24));
		/* __GDPR__
			"survey.show" : {
				"owner": "digitarald",
				"comment": "Measures survey notification result",
				"source": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The last used feature before the survey." },
				"language": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The last used editor language before the survey." },
				"activeDays": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "The number of days the user has used the extension." },
				"firstActive": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "The number of days since the user first used the extension." },
				"surveyType": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The type of survey being prompted." }
			}
		*/
		this.telemetryService.sendMSFTTelemetryEvent('survey.show', {
			source,
			language,
			surveyType
		}, {
			activeDays: usage.activeDays.length,
			firstActive: firstSeenInDays,
		});
		await this.updateNextSurveyDate(DAYS_COOLDOWN);

		const confirmation = l10n.t('Give Feedback');
		const later = l10n.t('Later');
		const skip = l10n.t('Skip');
		vscode.window.showInformationMessage(l10n.t('Got a minute? Help us make GitHub Copilot better.'), confirmation, later, skip).then(async selection => {
			const accepted = selection === confirmation;
			const postponed = selection === later;

			/* __GDPR__
				"survey.action" : {
					"owner": "digitarald",
					"comment": "Measures survey notification result",
					"source": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The source of the survey prompt." },
					"language": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The last used editor language before the survey." },
					"selection": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The user's selection." },
					"surveyType": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The type of survey being prompted." }
				}
			*/
			this.telemetryService.sendMSFTTelemetryEvent('survey.action', {
				source,
				language,
				selection: accepted ? 'accepted' : postponed ? 'postponed' : 'skipped',
				surveyType
			});

			if (accepted) {
				const copilotToken = await this.authenticationService.getCopilotToken();
				const params: Record<string, string> = {
					m: this.envService.machineId,
					s: this.envService.sessionId,
					k: copilotToken.sku ?? '',
					d: usage.activeDays.length.toString(),
					f: firstSeenInDays.toString(),
					v: this.envService.getVersion(),
					l: language,
					src: source,
					type: surveyType
				};
				const surveyUriWithParams = this.surveyUri.with({
					query: new URLSearchParams(params).toString(),
				});
				vscode.env.openExternal(surveyUriWithParams);
			} else if (postponed) {
				await this.updateNextSurveyDate(DAYS_LATER);
			}
		});
	}
}
