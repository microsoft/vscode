/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { commands } from 'vscode';
import { ITelemetryService, TelemetryEventMeasurements, TelemetryEventProperties } from '../../../platform/telemetry/common/telemetry';
import { Disposable } from '../../../util/vs/base/common/lifecycle';
import { IExtensionContribution } from '../../common/contributions';

const REPORT_SURVEY_COMMAND_ID = '_github.copilot.chat.reportHarnessSwitchFeedbackSurvey';
const TELEMETRY_EVENT_NAME = 'vscode.chatHarnessSwitchFeedbackSurvey';
const KNOWN_EVENT_KINDS: readonly string[] = ['shown', 'step', 'submitted', 'dismissed'];

/** Mirrors the workbench payload in `chatHarnessSwitchFeedbackSurveyTelemetry.ts`. */
interface IChatHarnessSwitchFeedbackSurveyTelemetryEvent {
	readonly kind: 'shown' | 'step' | 'submitted' | 'dismissed';
	readonly surveyId: string;
	readonly surveyInstanceId: string;
	readonly stepCount: number;
	readonly stepId?: string;
	readonly stepIndex?: number;
	readonly answerId?: string;
	readonly comment?: string;
	readonly mode: string;
	readonly fromHarness: 'copilot';
	readonly toHarness: 'local';
	readonly surface: 'sidebar' | 'editor';
	readonly chatSessionId?: string;
	readonly sessionType?: string;
	readonly harness?: string;
}

/** Forwards Copilot-to-Local switch survey results to GitHub restricted telemetry. */
export class ChatHarnessSwitchFeedbackSurveyForwardingContrib extends Disposable implements IExtensionContribution {

	constructor(
		@ITelemetryService private readonly telemetryService: ITelemetryService,
	) {
		super();

		this._register(commands.registerCommand(REPORT_SURVEY_COMMAND_ID, (event: unknown) => this.report(event)));
	}

	private report(event: unknown): void {
		if (!isSurveyEvent(event)) {
			return;
		}

		const properties: Record<string, string> = {
			kind: event.kind,
			surveyId: event.surveyId,
			surveyInstanceId: event.surveyInstanceId,
			mode: event.mode,
			fromHarness: event.fromHarness,
			toHarness: event.toHarness,
			surface: event.surface,
		};
		const measurements: Record<string, number> = {
			stepCount: event.stepCount,
		};

		addProperty(properties, 'stepId', event.stepId);
		addProperty(properties, 'answerId', event.answerId);
		addProperty(properties, 'comment', event.comment);
		addProperty(properties, 'chatSessionId', event.chatSessionId);
		addProperty(properties, 'sessionType', event.sessionType);
		addProperty(properties, 'harness', event.harness);

		if (typeof event.stepIndex === 'number') {
			measurements.stepIndex = event.stepIndex;
		}

		const telemetryProperties: TelemetryEventProperties = properties;
		const telemetryMeasurements: TelemetryEventMeasurements = measurements;
		this.telemetryService.sendEnhancedGHTelemetryEvent(TELEMETRY_EVENT_NAME, telemetryProperties, telemetryMeasurements);
	}
}

function isSurveyEvent(event: unknown): event is IChatHarnessSwitchFeedbackSurveyTelemetryEvent {
	if (typeof event !== 'object' || event === null) {
		return false;
	}

	const candidate = event as IChatHarnessSwitchFeedbackSurveyTelemetryEvent;
	return KNOWN_EVENT_KINDS.includes(candidate.kind)
		&& typeof candidate.surveyId === 'string'
		&& typeof candidate.surveyInstanceId === 'string'
		&& typeof candidate.stepCount === 'number'
		&& typeof candidate.mode === 'string'
		&& candidate.fromHarness === 'copilot'
		&& candidate.toHarness === 'local'
		&& (candidate.surface === 'sidebar' || candidate.surface === 'editor');
}

function addProperty(properties: Record<string, string>, key: string, value: string | undefined): void {
	if (typeof value === 'string' && value.length > 0) {
		properties[key] = value;
	}
}
