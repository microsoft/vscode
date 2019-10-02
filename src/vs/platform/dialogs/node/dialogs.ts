/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ITelemetryData } from 'vs/platform/telemetry/common/telemetry';

export interface INativeOpenDialogOptions {
	forceNewWindow?: boolean;

	defaultPath?: string;

	telemetryEventName?: string;
	telemetryExtraData?: ITelemetryData;
}

export interface MessageBoxReturnValue {
	response: number;
	checkboxChecked: boolean;
}

export interface SaveDialogReturnValue {
	filePath?: string;
}

export interface OpenDialogReturnValue {
	filePaths?: string[];
}
