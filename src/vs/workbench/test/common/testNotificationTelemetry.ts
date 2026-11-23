/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { NullTelemetryServiceShape } from '../../../platform/telemetry/common/telemetryUtils.js';

export class TestNotificationTelemetryService extends NullTelemetryServiceShape {
	readonly events: { readonly eventName: string; readonly data: Record<string, unknown> }[] = [];

	override publicLog2(eventName?: string, data?: Record<string, unknown>): void {
		assert.ok(eventName);
		this.events.push({ eventName, data: data ?? {} });
	}

	get shown(): Record<string, unknown>[] {
		return this.events.filter(event => event.eventName === 'notificationShown').map(event => event.data);
	}

	get interactions(): Record<string, unknown>[] {
		return this.events.filter(event => event.eventName === 'notificationInteraction').map(event => event.data);
	}
}
