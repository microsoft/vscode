/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { globals } from 'vs/base/common/platform';

function getWorkersCount(): number {
	var defaultValue = 2;
	var url_matches = (globals.location ? globals.location.search : '').match(/monaco-workers=(\d+)/i);
	if (url_matches) {
		defaultValue = parseInt(url_matches[1], 10);
	}
	return environment('workersCount', defaultValue);
}

export const workersCount = getWorkersCount();
export const enableTasks = environment('enableTasks');
export const enableSendASmile = environment('enableSendASmile');
export const enableJavaScriptRewriting = environment('enableJavaScriptRewriting');
export const enableTypeScriptServiceMode = environment('enableTypeScriptServiceMode');
export const enableTypeScriptServiceModeForJS = environment('enableTypeScriptServiceModeForJS');

// Telemetry endpoint (used in the standalone editor) for hosts that want to collect editor telemetry
export const standaloneEditorTelemetryEndpoint:string = environment('telemetryEndpoint', null);

// Option for hosts to overwrite the worker script url (used in the standalone editor)
export const getCrossOriginWorkerScriptUrl:(workerId:string, label:string)=>string = environment('getWorkerUrl', null);

function environment(name:string, fallback:any = false):any {
	if (globals.MonacoEnvironment && globals.MonacoEnvironment.hasOwnProperty(name)) {
		return globals.MonacoEnvironment[name];
	}

	return fallback;
}