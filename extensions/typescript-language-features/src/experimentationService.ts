/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import VsCodeTelemetryReporter from '@vscode/extension-telemetry';
import * as tas from 'vscode-tas-client';

interface ExperimentTypes {
	// None for now.
}

export class ExperimentationService implements vscode.Disposable {
	private _experimentationServicePromise: Promise<tas.IExperimentationService>;
	private _telemetryReporter: ExperimentTelemetryReporter;

	constructor(private readonly _extensionContext: vscode.ExtensionContext) {
		this._telemetryReporter = new ExperimentTelemetryReporter(_extensionContext);
		this._experimentationServicePromise = this.createExperimentationService();
	}

	public async getTreatmentVariable<K extends keyof ExperimentTypes>(name: K, defaultValue: ExperimentTypes[K]): Promise<ExperimentTypes[K]> {
		const experimentationService = await this._experimentationServicePromise;
		try {
			const treatmentVariable = experimentationService.getTreatmentVariableAsync('vscode', name, /*checkCache*/ true) as ExperimentTypes[K];
			return treatmentVariable;
		} catch {
			return defaultValue;
		}
	}

	private async createExperimentationService(): Promise<tas.IExperimentationService> {
		let targetPopulation: tas.TargetPopulation;
		switch (vscode.env.uriScheme) {
			case 'vscode':
				targetPopulation = tas.TargetPopulation.Public;
			case 'vscode-insiders':
				targetPopulation = tas.TargetPopulation.Insiders;
			case 'vscode-exploration':
				targetPopulation = tas.TargetPopulation.Internal;
			case 'code-oss':
				targetPopulation = tas.TargetPopulation.Team;
			default:
				targetPopulation = tas.TargetPopulation.Public;
		}

		const id = this._extensionContext.extension.id;
		const version = this._extensionContext.extension.packageJSON.version || '';
		const experimentationService = tas.getExperimentationService(id, version, targetPopulation, this._telemetryReporter, this._extensionContext.globalState);
		await experimentationService.initialFetch;
		return experimentationService;
	}


	/**
	 * @inheritdoc
	 */
	public dispose() {
		this._telemetryReporter.dispose();
	}
}

export class ExperimentTelemetryReporter
	implements tas.IExperimentationTelemetry, vscode.Disposable {
	private _sharedProperties: Record<string, string> = {};
	private _reporter: VsCodeTelemetryReporter;
	constructor(ctxt: vscode.ExtensionContext) {
		const extension = ctxt.extension;
		const packageJSON = extension.packageJSON;
		this._reporter = new VsCodeTelemetryReporter(
			extension.id,
			packageJSON.version || '',
			packageJSON.aiKey || '');

	}

	setSharedProperty(name: string, value: string): void {
		this._sharedProperties[name] = value;
	}

	postEvent(eventName: string, props: Map<string, string>): void {
		const propsObject = {
			...this._sharedProperties,
			...Object.fromEntries(props),
		};
		this._reporter.sendTelemetryEvent(eventName, propsObject);
	}

	dispose() {
		this._reporter.dispose();
	}
}
