/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { default as VSCodeTelemetryReporter } from '@vscode/extension-telemetry';
import * as vscode from 'vscode';

export interface TelemetryReporter {
	dispose(): void;
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

	dispose() {
		this.#reporter.dispose();
	}
}

export function loadDefaultTelemetryReporter(extension: vscode.Extension<unknown>): TelemetryReporter {
	const aiKey: unknown = extension.packageJSON?.aiKey;
	return typeof aiKey === 'string' ? new ExtensionReporter(aiKey) : nullReporter;
}
