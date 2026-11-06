/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CopilotTelemetryReporter } from '../telemetry';
import * as assert from 'assert';

type ReportedEvent = { name: string; properties: { [key: string]: string }; measurements: { [key: string]: number } };
type ReportedError = {
	name: string;
	properties: { [key: string]: string };
	measurements: { [key: string]: number };
	errorProps?: string[];
};

export class TelemetrySpy implements CopilotTelemetryReporter {
	readonly events: ReportedEvent[] = [];
	readonly errors: ReportedError[] = [];

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

	sendTelemetryErrorEvent(
		eventName: string,
		properties: {
			[key: string]: string;
		} = {},
		measurements: {
			[key: string]: number;
		} = {},
		errorProps?: string[]
	): void {
		this.errors.push({
			name: eventName,
			properties,
			measurements,
			errorProps,
		});
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

	get hasError(): boolean {
		return this.errors.length > 0;
	}

	get exceptions(): ReportedEvent[] {
		return this.events.filter(e => e.name === 'error.exception');
	}

	get hasException(): boolean {
		return this.exceptions.length > 0;
	}

	get firstEvent(): ReportedEvent | undefined {
		return this.events[0];
	}

	get firstError(): ReportedError | undefined {
		return this.errors[0];
	}

	get firstException(): ReportedEvent | undefined {
		return this.exceptions[0];
	}

	eventsMatching(filter: (event: ReportedEvent) => boolean): ReportedEvent[] {
		return this.events.filter(filter);
	}

	eventByName(name: string): ReportedEvent {
		const candidates = this.events.filter(e => e.name === name);
		assert.strictEqual(candidates.length, 1, `Expected exactly one event with name ${name}`);
		return candidates[0];
	}

	errorsMatching(filter: (event: ReportedError) => boolean): ReportedError[] {
		return this.errors.filter(filter);
	}

	exceptionsMatching(filter: (event: ReportedEvent) => boolean): ReportedEvent[] {
		return this.exceptions.filter(filter);
	}

	// equivalent of assertHasProperty in testing/telemetry.ts
	assertHasProperty(assertion: (m: { [key: string]: string }) => boolean) {
		assert.ok(this.eventsMatching(e => e.name !== 'ghostText.produced').every(e => assertion(e.properties)));
	}
}
