/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {IEnvironment} from 'vs/platform/workspace/common/workspace';
import {ITelemetryAppender, combinedAppender} from 'vs/platform/telemetry/common/telemetry';
import {createAIAdapter} from 'vs/base/parts/ai/node/ai';

const eventPrefix = 'monacoworkbench';

export function createAppender(env: IEnvironment): ITelemetryAppender {
	const result: ITelemetryAppender[] = [];
	const { key, asimovKey } = env.aiConfig;

	if (key) {
		result.push(createAIAdapter(key, eventPrefix, undefined));
	}

	if (asimovKey) {
		result.push(createAIAdapter(asimovKey, eventPrefix, undefined));
	}

	return combinedAppender(...result);
}
