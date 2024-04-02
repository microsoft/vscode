/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as tas from 'vscode-tas-client';

import { IExperimentationTelemetryReporter } from './experimentTelemetryReporter';

interface ExperimentTypes {
	// None for now.
}

export class ExperimentationService {
	private readonly _experimentationServicePromise: Promise<tas.IExperimentationService>;
	private readonly _telemetryReporter: IExperimentationTelemetryReporter;

	constructor(telemetryReporter: IExperimentationTelemetryReporter, id: string, version: string, globalState: vscode.Memento) {
		this._telemetryReporter = telemetryReporter;
		this._experimentationServicePromise = createTasExperimentationService(this._telemetryReporter, id, version, globalState);
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
}

export async function createTasExperimentationService(
	reporter: IExperimentationTelemetryReporter,
	id: string,
	version: string,
	globalState: vscode.Memento): Promise<tas.IExperimentationService> {
	let targetPopulation: tas.TargetPopulation;
	switch (vscode.env.uriScheme) {
		case 'vscode':
			targetPopulation = tas.TargetPopulation.Public;
			break;
		case 'vscode-insiders':
			targetPopulation = tas.TargetPopulation.Insiders;
			break;
		case 'vscode-exploration':
			targetPopulation = tas.TargetPopulation.Internal;
			break;
		case 'code-oss':
			targetPopulation = tas.TargetPopulation.Team;
			break;
		default:
			targetPopulation = tas.TargetPopulation.Public;
			break;
	}

	const experimentationService = tas.getExperimentationService(id, version, targetPopulation, reporter, globalState);
	await experimentationService.initialFetch;
	return experimentationService;
}
