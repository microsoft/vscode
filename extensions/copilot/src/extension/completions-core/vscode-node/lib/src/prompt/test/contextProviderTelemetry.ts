/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ContextProviderTelemetry } from '../contextProviderRegistry';
import assert from 'assert';

export function assertContextProviderTelemetry(
	actualContextProviderTelemetryJson: string,
	expectedContextProviderTelemetry: Omit<ContextProviderTelemetry, 'resolutionTimeMs'>[]
) {
	const parsedContextProviderTelemetry = JSON.parse(actualContextProviderTelemetryJson) as ContextProviderTelemetry[];
	// Assert that timing information is present
	parsedContextProviderTelemetry.map(t => {
		assert.ok(t.resolutionTimeMs >= 0);
	});
	// Assert the rest of the telemetry (without timing) matches
	assert.deepStrictEqual(
		parsedContextProviderTelemetry.map(t => {
			const { resolutionTimeMs, ...rest } = t;
			return rest;
		}),
		expectedContextProviderTelemetry
	);
}
