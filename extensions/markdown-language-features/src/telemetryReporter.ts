/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { default as VSCodeTelemetryReporter } from '@vscode/extension-telemetry';
import * as vscode from 'vscode';

interface IPackageInfo {
	name: string;
	version: string;
	aiKey: string;
}

export interface TelemetryReporter {
	dispose(): void;
	sendTelemetryEvent(eventName: string, properties?: {
		[key: string]: string;
	}): void;
}

const nullReporter = new class NullTelemetryReporter implements TelemetryReporter {
	sendTelemetryEvent() { /** noop */ }
	dispose() { /** noop */ }
};

class ExtensionReporter implements TelemetryReporter {
	private readonly _reporter: VSCodeTelemetryReporter;

	constructor(
		packageInfo: IPackageInfo
	) {
		this._reporter = new VSCodeTelemetryReporter(packageInfo.aiKey);
	}
	sendTelemetryEvent(eventName: string, properties?: {
		[key: string]: string;
	}) {
		this._reporter.sendTelemetryEvent(eventName, properties);
	}

	dispose() {
		this._reporter.dispose();
	}
}

export function loadDefaultTelemetryReporter(): TelemetryReporter {
	const packageInfo = getPackageInfo();
	return packageInfo ? new ExtensionReporter(packageInfo) : nullReporter;
}

function getPackageInfo(): IPackageInfo | null {
	const extension = vscode.extensions.getExtension('Microsoft.vscode-markdown');
	if (extension && extension.packageJSON) {
		return {
			name: extension.packageJSON.name,
			version: extension.packageJSON.version,
			aiKey: extension.packageJSON.aiKey
		};
	}
	return null;
}
