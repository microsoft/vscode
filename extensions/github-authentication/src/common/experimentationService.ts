/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import TelemetryReporter from '@vscode/extension-telemetry';
import { getExperimentationService, IExperimentationService, IExperimentationTelemetry, TargetPopulation } from 'vscode-tas-client';

export class ExperimentationTelemetry implements IExperimentationTelemetry {
	private sharedProperties: Record<string, string> = {};
	private experimentationServicePromise: Promise<IExperimentationService> | undefined;

	constructor(private readonly context: vscode.ExtensionContext, private baseReporter: TelemetryReporter) { }

	private async createExperimentationService(): Promise<IExperimentationService> {
		let targetPopulation: TargetPopulation;
		switch (vscode.env.uriScheme) {
			case 'vscode':
				targetPopulation = TargetPopulation.Public;
				break;
			case 'vscode-insiders':
				targetPopulation = TargetPopulation.Insiders;
				break;
			case 'vscode-exploration':
				targetPopulation = TargetPopulation.Internal;
				break;
			case 'code-oss':
				targetPopulation = TargetPopulation.Team;
				break;
			default:
				targetPopulation = TargetPopulation.Public;
				break;
		}

		const id = this.context.extension.id;
		const version = this.context.extension.packageJSON.version;
		const experimentationService = getExperimentationService(id, version, targetPopulation, this, this.context.globalState);
		await experimentationService.initialFetch;
		return experimentationService;
	}

	/**
	 * @returns A promise that you shouldn't need to await because this is just telemetry.
	 */
	async sendTelemetryEvent(eventName: string, properties?: Record<string, string>, measurements?: Record<string, number>) {
		if (!this.experimentationServicePromise) {
			this.experimentationServicePromise = this.createExperimentationService();
		}
		await this.experimentationServicePromise;

		this.baseReporter.sendTelemetryEvent(
			eventName,
			{
				...this.sharedProperties,
				...properties,
			},
			measurements,
		);
	}

	/**
	 * @returns A promise that you shouldn't need to await because this is just telemetry.
	 */
	async sendTelemetryErrorEvent(
		eventName: string,
		properties?: Record<string, string>,
		_measurements?: Record<string, number>
	) {
		if (!this.experimentationServicePromise) {
			this.experimentationServicePromise = this.createExperimentationService();
		}
		await this.experimentationServicePromise;

		this.baseReporter.sendTelemetryErrorEvent(eventName, {
			...this.sharedProperties,
			...properties,
		});
	}

	setSharedProperty(name: string, value: string): void {
		this.sharedProperties[name] = value;
	}

	postEvent(eventName: string, props: Map<string, string>): void {
		const event: Record<string, string> = {};
		for (const [key, value] of props) {
			event[key] = value;
		}
		this.sendTelemetryEvent(eventName, event);
	}

	dispose(): Promise<any> {
		return this.baseReporter.dispose();
	}
}
