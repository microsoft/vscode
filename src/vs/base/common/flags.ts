/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import {globals} from 'vs/base/common/platform';

// Option for hosts to overwrite the worker script url (used in the standalone editor)
export const getCrossOriginWorkerScriptUrl: (workerId: string, label: string) => string = environment('getWorkerUrl', null);

function environment(name: string, fallback: any = false): any {
	if (globals.MonacoEnvironment && globals.MonacoEnvironment.hasOwnProperty(name)) {
		return globals.MonacoEnvironment[name];
	}

	return fallback;
}
