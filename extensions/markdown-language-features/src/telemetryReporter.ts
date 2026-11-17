/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { default as VSCodeTelemetryReporter } from '@vscode/extension-telemetry';
import * as vscode from 'vscode';

export interface TelemetryReporter {
	/** Flushes pending events; the returned promise resolves when they are sent. */
	dispose(): void | Promise<void>;
	sendTelemetryEvent(eventName: string, properties?: {
		[key: string]: string;
	}, measurements?: {
		[key: string]: number;
	}): void;
}

const nullReporter = new class NullTelemetryReporter implements TelemetryReporter {
	sendTelemetryEvent() { /** noop */ }
	dispose() { /** noop */ }
};

class ExtensionReporter implements TelemetryReporter {
	readonly #reporter: VSCodeTelemetryReporter;
	#disposed: Promise<void> | undefined;

	constructor(
		aiKey: string
	) {
		this.#reporter = new VSCodeTelemetryReporter(aiKey);
	}
	sendTelemetryEvent(eventName: string, properties?: {
		[key: string]: string;
	}, measurements?: {
		[key: string]: number;
	}) {
		this.#reporter.sendTelemetryEvent(eventName, properties, measurements);
	}

	dispose(): Promise<void> {
		this.#disposed ??= Promise.resolve(this.#reporter.dispose()).then(() => { });
		return this.#disposed;
	}
}

export function loadDefaultTelemetryReporter(extension: vscode.Extension<unknown>): TelemetryReporter {
	const aiKey: unknown = extension.packageJSON?.aiKey;
	return typeof aiKey === 'string' ? new ExtensionReporter(aiKey) : nullReporter;
}
