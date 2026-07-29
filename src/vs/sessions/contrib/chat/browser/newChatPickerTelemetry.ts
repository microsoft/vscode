/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';

/**
 * Data emitted by a picker in the new chat view pane when the user selects
 * an option. Mirrors the shape of the `actionWidgetDropdownClosed` event
 * so the two can be analyzed with similar queries.
 *
 * The `selectionChanged` field is derived from comparing
 * {@link optionIdBefore} and {@link optionIdAfter}.
 */
export interface INewChatPickerClosedData {
	/** Identifier of the picker emitting the event (e.g. `NewChatWorkspacePicker`). */
	readonly id: string;
	/** Optional descriptive name of the picker. */
	readonly name?: string;
	/** Identifier of the option configured before the picker was opened. */
	readonly optionIdBefore: string | undefined;
	/** Identifier of the option selected when the picker was closed. */
	readonly optionIdAfter: string | undefined;
	/** Label of the option configured before the picker was opened. */
	readonly optionLabelBefore: string | undefined;
	/** Label of the option selected when the picker was closed. */
	readonly optionLabelAfter: string | undefined;
	/**
	 * When `true`, the option id and label values are considered PII and
	 * are omitted from the emitted telemetry event — only {@link id},
	 * {@link name} and the derived `selectionChanged` flag are reported.
	 */
	readonly isPII: boolean;
}

export function reportNewChatPickerClosed(telemetryService: ITelemetryService, data: INewChatPickerClosedData): void {
	telemetryService.publicLog2<NewChatPickerClosedEvent, NewChatPickerClosedClassification>(
		'newChatPickerClosed',
		{
			id: data.id,
			name: data.name,
			selectionChanged: data.optionIdBefore !== data.optionIdAfter,
			optionIdBefore: data.isPII ? undefined : data.optionIdBefore,
			optionIdAfter: data.isPII ? undefined : data.optionIdAfter,
			optionLabelBefore: data.isPII ? undefined : data.optionLabelBefore,
			optionLabelAfter: data.isPII ? undefined : data.optionLabelAfter,
		},
	);
}

type NewChatPickerClosedEvent = {
	id: string;
	name: string | undefined;
	selectionChanged: boolean;
	optionIdBefore: string | undefined;
	optionIdAfter: string | undefined;
	optionLabelBefore: string | undefined;
	optionLabelAfter: string | undefined;
};

type NewChatPickerClosedClassification = {
	id: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The telemetry id of the picker.' };
	name: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The telemetry name of the picker.' };
	selectionChanged: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Whether the user changed the selected option.' };
	optionIdBefore: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The option configured before opening the picker.' };
	optionIdAfter: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The option selected when the picker was closed.' };
	optionLabelBefore: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The label of the option configured before opening the picker.' };
	optionLabelAfter: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The label of the option selected when the picker was closed.' };
	owner: 'benibenj';
	comment: 'Tracks new chat view pane picker usage and selection changes.';
};
