/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'path';
import * as vscode from 'vscode';
import TelemetryReporter from 'vscode-extension-telemetry';
import { getExperimentationService, IExperimentationService, IExperimentationTelemetry, TargetPopulation } from 'vscode-tas-client';

export class ExperimentationTelemetry implements IExperimentationTelemetry {
	private sharedProperties: Record<string, string> = {};

	constructor(private baseReporter: TelemetryReporter) { }

	sendTelemetryEvent(eventName: string, properties?: Record<string, string>, measurements?: Record<string, number>) {
		this.baseReporter.sendTelemetryEvent(
			eventName,
			{
				...this.sharedProperties,
				...properties,
			},
			measurements,
		);
	}

	sendTelemetryErrorEvent(
		eventName: string,
		properties?: Record<string, string>,
		_measurements?: Record<string, number>,
	) {
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

interface ProductConfiguration {
	quality?: 'stable' | 'insider' | 'exploration';
}

async function getProductConfig(appRoot: string): Promise<ProductConfiguration> {
	const raw = await vscode.workspace.fs.readFile(vscode.Uri.file(path.join(appRoot, 'product.json')));
	return JSON.parse(raw.toString());
}

function getTargetPopulation(product: ProductConfiguration): TargetPopulation {
	switch (product.quality) {
		case 'stable':
			return TargetPopulation.Public;
		case 'insider':
			return TargetPopulation.Insiders;
		case 'exploration':
			return TargetPopulation.Internal;
		case undefined:
			return TargetPopulation.Team;
		default:
			return TargetPopulation.Public;
	}
}

export async function createExperimentationService(context: vscode.ExtensionContext, telemetry: ExperimentationTelemetry): Promise<IExperimentationService> {
	const id = context.extension.id;
	const version = context.extension.packageJSON.version;
	const product = await getProductConfig(vscode.env.appRoot);
	const targetPopulation = getTargetPopulation(product);
	return getExperimentationService(id, version, targetPopulation, telemetry, context.globalState);
}
