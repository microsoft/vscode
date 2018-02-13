/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'path';
import VsCodeTelemetryReporter from 'vscode-extension-telemetry';

interface IPackageInfo {
	name: string;
	version: string;
	aiKey: string;
}

export default class TelemetryReporter {
	private _packageInfo: IPackageInfo | null = null;
	private _reporter: VsCodeTelemetryReporter | null = null;

	dispose() {
		if (this._reporter) {
			this._reporter.dispose();
			this._reporter = null;
		}
	}

	constructor(
		private readonly clientVersionDelegate: () => string
	) { }

	public logTelemetry(eventName: string, properties?: { [prop: string]: string }) {
		if (this.reporter) {
			if (!properties) {
				properties = {};
			}
			properties['version'] = this.clientVersionDelegate();

			this.reporter.sendTelemetryEvent(eventName, properties);
		}
	}

	private get reporter(): VsCodeTelemetryReporter | null {
		if (typeof this._reporter !== 'undefined') {
			return this._reporter;
		}

		if (this.packageInfo && this.packageInfo.aiKey) {
			this._reporter = new VsCodeTelemetryReporter(
				this.packageInfo.name,
				this.packageInfo.version,
				this.packageInfo.aiKey);
		} else {
			this._reporter = null;
		}
		return this._reporter;
	}

	private get packageInfo(): IPackageInfo | null {
		if (this._packageInfo !== undefined) {
			return this._packageInfo;
		}
		const packagePath = path.join(__dirname, '..', '..', 'package.json');
		const extensionPackage = require(packagePath);
		if (extensionPackage) {
			this._packageInfo = {
				name: extensionPackage.name,
				version: extensionPackage.version,
				aiKey: extensionPackage.aiKey
			};
		} else {
			this._packageInfo = null;
		}

		return this._packageInfo;
	}
}