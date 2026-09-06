/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TelemetryTrustedValue } from './telemetryUtils.js';

export type ModelTelemetryKind = 'trusted' | 'byok' | 'unknown';

export function toTelemetryModel(model: string | undefined, kind: ModelTelemetryKind | undefined): 'byokModel' | 'unknown' | TelemetryTrustedValue<string> | undefined {
	if (model === undefined) {
		return undefined;
	}
	if (kind === 'trusted') {
		return new TelemetryTrustedValue(model);
	}
	return kind === 'byok' ? 'byokModel' : 'unknown';
}
