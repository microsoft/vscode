/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import TelemetryReporter from 'vscode-extension-telemetry';
import { getExperimentationService, IExperimentationService, IExperimentationTelemetry, TargetPopulation } from 'vscode-tas-client';

export class ExperimentationTelemetry implements IExperimentationTelemetry {
	private sharedProperties: Record<string, string> = {};
	private experimentationService: IExperimentationService | undefined;

	constructor(private readonly context: vscode.ExtensionContext, private baseReporter: TelemetryReporter) { }

	/**
	 * @returns A promise that you shouldn't need to await because this is just telemetry.
	 */
	async sendTelemetryEvent(eventName: string, properties?: Record<string, string>, measurements?: Record<string, number>) {
		if (!this.experimentationService) {
			this.experimentationService = await createExperimentationService(this.context, this);
		}

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
		if (!this.experimentationService) {
			this.experimentationService = await createExperimentationService(this.context, this);
		}

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

function getTargetPopulation(): TargetPopulation {
	switch (vscode.env.uriScheme) {
		case 'vscode':
			return TargetPopulation.Public;
		case 'vscode-insiders':
			return TargetPopulation.Insiders;
		case 'vscode-exploration':
			return TargetPopulation.Internal;
		case 'code-oss':
			return TargetPopulation.Team;
		default:
			return TargetPopulation.Public;
	}
}

async function createExperimentationService(context: vscode.ExtensionContext, telemetry: ExperimentationTelemetry): Promise<IExperimentationService> {
	const id = context.extension.id;
	const version = context.extension.packageJSON.version;
	const experimentationService = getExperimentationService(id, version, getTargetPopulation(), telemetry, context.globalState);
	await experimentationService.initialFetch;
	return experimentationService;
}
