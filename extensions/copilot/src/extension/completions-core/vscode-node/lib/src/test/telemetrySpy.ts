/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CopilotTelemetryReporter } from '../telemetry';
import * as assert from 'assert';

type ReportedEvent = { name: string; properties: { [key: string]: string }; measurements: { [key: string]: number } };

export class TelemetrySpy implements CopilotTelemetryReporter {
	readonly events: ReportedEvent[] = [];

	sendTelemetryEvent(
		eventName: string,
		properties: {
			[key: string]: string;
		} = {},
		measurements: {
			[key: string]: number;
		} = {}
	): void {
		this.events.push({
			name: eventName,
			properties,
			measurements,
		});
	}

	sendTelemetryErrorEvent(..._args: Parameters<CopilotTelemetryReporter['sendTelemetryErrorEvent']>): void {
		// noop
	}

	sendTelemetryException(
		error: Error,
		properties: {
			[key: string]: string;
		} = {},
		measurements: {
			[key: string]: number;
		} = {}
	): void {
		this.events.push({
			name: 'error.exception',
			properties: { message: error.message, ...properties },
			measurements,
		});
	}

	dispose(): Promise<void> {
		return Promise.resolve();
	}

	get hasEvent(): boolean {
		return this.events.length > 0;
	}

	get exceptions(): ReportedEvent[] {
		return this.events.filter(e => e.name === 'error.exception');
	}

	get hasException(): boolean {
		return this.exceptions.length > 0;
	}

	eventsMatching(filter: (event: ReportedEvent) => boolean): ReportedEvent[] {
		return this.events.filter(filter);
	}

	eventByName(name: string): ReportedEvent {
		const candidates = this.events.filter(e => e.name === name);
		assert.strictEqual(candidates.length, 1, `Expected exactly one event with name ${name}`);
		return candidates[0];
	}
}
