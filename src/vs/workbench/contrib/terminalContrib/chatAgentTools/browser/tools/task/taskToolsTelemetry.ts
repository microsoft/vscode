/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/


export type TaskToolClassification = {
	taskId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The ID of the task.' };
	bufferLength: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The length of the terminal buffer as a string.' };
	pollDurationMs: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'How long polling for output took (ms).' };
	inputToolManualAcceptCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'The number of times the user manually accepted a detected suggestion' };
	inputToolManualRejectCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'The number of times the user manually rejected a detected suggestion' };
	inputToolManualChars: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'The number of characters input by manual acceptance of suggestions' };
	inputToolManualShownCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'The number of times the user was prompted to manually accept an input suggestion' };
	inputToolFreeFormInputShownCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'The number of times the user was prompted to provide free form input' };
	inputToolFreeFormInputCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'The number of times the user provided free form input after prompting' };
	owner: 'meganrogge';
	comment: 'Understanding the usage of the task tools';
};
export type TaskToolEvent = {
	taskId: string;
	bufferLength: number;
	pollDurationMs: number | undefined;
	inputToolManualAcceptCount: number;
	inputToolManualRejectCount: number;
	inputToolManualChars: number;
	inputToolManualShownCount: number;
	inputToolFreeFormInputShownCount: number;
	inputToolFreeFormInputCount: number;
};
