/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as vscode from 'vscode';
import { default as VSCodeTelemetryReporter } from 'vscode-extension-telemetry';

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
		this._reporter = new VSCodeTelemetryReporter(packageInfo.name, packageInfo.version, packageInfo.aiKey);
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
	const extention = vscode.extensions.getExtension('Microsoft.vscode-markdown');
	if (extention && extention.packageJSON) {
		return {
			name: extention.packageJSON.name,
			version: extention.packageJSON.version,
			aiKey: extention.packageJSON.aiKey
		};
	}
	return null;
}
