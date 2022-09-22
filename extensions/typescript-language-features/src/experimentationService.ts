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

	constructor(telemetryReporter: ExperimentTelemetryReporter, id: string, version: string, globalState: vscode.Memento) {
		this._telemetryReporter = telemetryReporter;
		this._experimentationServicePromise = createExperimentationService(this._telemetryReporter, id, version, globalState);
	}

	public async getTreatmentVariable<K extends keyof ExperimentTypes>(name: K, defaultValue: ExperimentTypes[K]): Promise<ExperimentTypes[K]> {
		const experimentationService = await this._experimentationServicePromise;
		try {
			const treatmentVariable = experimentationService.getTreatmentVariableAsync('vscode', name, /*checkCache*/ true) as Promise<ExperimentTypes[K]>;
			return treatmentVariable;
		} catch {
			return defaultValue;
		}
	}

	/**
	 * @inheritdoc
	 */
	public dispose() {
		// Assume the extension will dispose of the reporter.
	}
}

/**
 * This reporter *supports* experimentation telemetry,
 * but will only do so when passed to an {@link ExperimentationService}.
 */
export class ExperimentTelemetryReporter
	implements tas.IExperimentationTelemetry, vscode.Disposable {
	private _sharedProperties: Record<string, string> = {};
	private _reporter: VsCodeTelemetryReporter;
	constructor(reporter: VsCodeTelemetryReporter) {
		this._reporter = reporter;
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

	postEventObj(eventName: string, props: { [prop: string]: string }) {
		this._reporter.sendTelemetryEvent(eventName, {
			...this._sharedProperties,
			...props,
		});
	}

	dispose() {
		this._reporter.dispose();
	}
}

async function createExperimentationService(
	reporter: ExperimentTelemetryReporter,
	id: string,
	version: string,
	globalState: vscode.Memento,
): Promise<tas.IExperimentationService> {
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

	const experimentationService = tas.getExperimentationService(id, version, targetPopulation, reporter, globalState);
	await experimentationService.initialFetch;
	return experimentationService;
}
