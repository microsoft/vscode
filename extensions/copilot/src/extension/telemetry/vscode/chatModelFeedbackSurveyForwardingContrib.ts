/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { commands } from 'vscode';
import { ITelemetryService, TelemetryEventMeasurements, TelemetryEventProperties } from '../../../platform/telemetry/common/telemetry';
import { Disposable } from '../../../util/vs/base/common/lifecycle';
import { IExtensionContribution } from '../../common/contributions';

/**
 * Command the workbench invokes to report inline model feedback survey results.
 *
 * Keep in sync with `CHAT_MODEL_FEEDBACK_SURVEY_TELEMETRY_COMMAND_ID` in
 * `src/vs/workbench/contrib/chat/common/feedbackSurvey/chatModelFeedbackSurveyTelemetry.ts`.
 */
const REPORT_SURVEY_COMMAND_ID = '_github.copilot.chat.reportModelFeedbackSurvey';

const TELEMETRY_EVENT_NAME = 'vscode.chatModelFeedbackSurvey';

const KNOWN_EVENT_KINDS: readonly string[] = ['shown', 'opened', 'step', 'submitted', 'dismissed'];

/** Mirrors the workbench payload in `chatModelFeedbackSurveyTelemetry.ts`. */
interface IChatModelFeedbackSurveyTelemetryEvent {
	readonly kind: 'shown' | 'opened' | 'step' | 'submitted' | 'dismissed';
	readonly surveyId: string;
	readonly surveyInstanceId: string;
	readonly stepCount: number;
	readonly trigger?: 'manual' | 'chance' | 'modelSwitchedAway';
	readonly stepId?: string;
	readonly stepIndex?: number;
	readonly answerId?: string;
	readonly comment?: string;
	readonly modelId?: string;
	readonly resolvedModelId?: string;
	readonly modeId?: string;
	readonly harness?: string;
	readonly sessionType?: string;
	readonly requestId: string;
}

/**
 * Forwards inline model feedback survey results to GitHub restricted telemetry.
 *
 * The workbench cannot reach that endpoint, so it hands each result over as a command, which
 * also activates this extension so early results are not lost. Every event is sent enhanced,
 * including the ones carrying no answer, so the whole funnel shares one consent boundary. When
 * the user has not opted in to restricted telemetry the send is a no op.
 *
 * Core already has a sender for the same table in
 * `src/vs/platform/agentHost/node/agentHostRestrictedTelemetry.ts`, using the same enhanced
 * ingestion key. It is node layer and lives in the agent host process with no channel to the
 * renderer, so it cannot serve workbench events today. Exposing it to the renderer would let
 * this contribution and `GithubTelemetryForwardingContrib` both go away.
 */
export class ChatModelFeedbackSurveyForwardingContrib extends Disposable implements IExtensionContribution {

	constructor(
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
	) {
		super();

		this._register(commands.registerCommand(REPORT_SURVEY_COMMAND_ID, (event: unknown) => {
			this._report(event);
		}));
	}

	private _report(event: unknown): void {
		if (!isSurveyEvent(event)) {
			return;
		}

		const properties: Record<string, string> = {
			kind: event.kind,
			surveyId: event.surveyId,
			surveyInstanceId: event.surveyInstanceId,
		};
		const measurements: Record<string, number> = {
			stepCount: event.stepCount,
		};

		addProperty(properties, 'trigger', event.trigger);
		addProperty(properties, 'stepId', event.stepId);
		addProperty(properties, 'answerId', event.answerId);
		addProperty(properties, 'comment', event.comment);
		addProperty(properties, 'modelId', event.modelId);
		addProperty(properties, 'resolvedModelId', event.resolvedModelId);
		addProperty(properties, 'modeId', event.modeId);
		addProperty(properties, 'harness', event.harness);
		addProperty(properties, 'sessionType', event.sessionType);
		addProperty(properties, 'requestId', event.requestId);

		if (typeof event.stepIndex === 'number') {
			measurements.stepIndex = event.stepIndex;
		}

		const telemetryProperties: TelemetryEventProperties = properties;
		const telemetryMeasurements: TelemetryEventMeasurements = measurements;
		this._telemetryService.sendEnhancedGHTelemetryEvent(TELEMETRY_EVENT_NAME, telemetryProperties, telemetryMeasurements);
	}
}

function isSurveyEvent(event: unknown): event is IChatModelFeedbackSurveyTelemetryEvent {
	if (typeof event !== 'object' || event === null) {
		return false;
	}
	const candidate = event as IChatModelFeedbackSurveyTelemetryEvent;
	return KNOWN_EVENT_KINDS.includes(candidate.kind)
		&& typeof candidate.surveyId === 'string'
		&& typeof candidate.surveyInstanceId === 'string'
		&& typeof candidate.stepCount === 'number'
		&& typeof candidate.requestId === 'string';
}

function addProperty(properties: Record<string, string>, key: string, value: string | undefined): void {
	if (typeof value === 'string' && value.length > 0) {
		properties[key] = value;
	}
}
