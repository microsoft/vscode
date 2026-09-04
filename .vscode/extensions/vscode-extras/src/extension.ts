/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { NpmUpToDateFeature } from './npmUpToDateFeature';

interface FeatureDefinition {
	configKey: string;
	factory: (output: vscode.LogOutputChannel) => vscode.Disposable;
}

export class Extension extends vscode.Disposable {
	private readonly _output: vscode.LogOutputChannel;
	private readonly _featureInstances = new Map<string, vscode.Disposable>();
	
	// Yeni özellikler eklemek istediğinde buraya tanımlaman yeterli olacak dostum.
	private readonly _features: FeatureDefinition[] = [
		{
			configKey: 'vscode-extras.npmUpToDateFeature.enabled',
			factory: (output) => new NpmUpToDateFeature(output)
		}
	];

	constructor(_context: vscode.ExtensionContext) {
		const disposables: vscode.Disposable[] = [];
		super(() => {
			disposables.forEach(d => d.dispose());
			this._disposeAllFeatures();
		});

		this._output = vscode.window.createOutputChannel('VS Code Extras', { log: true });
		disposables.push(this._output);

		this._syncAllFeatures();

		disposables.push(
			vscode.workspace.onDidChangeConfiguration(e => {
				for (const feature of this._features) {
					if (e.affectsConfiguration(feature.configKey)) {
						this._updateFeature(feature);
					}
				}
			})
		);
	}

	private _syncAllFeatures(): void {
		for (const feature of this._features) {
			this._updateFeature(feature);
		}
	}

	private _updateFeature(feature: FeatureDefinition): void {
		const enabled = vscode.workspace.getConfiguration().get<boolean>(feature.configKey, true);
		const existingInstance = this._featureInstances.get(feature.configKey);

		if (enabled && !existingInstance) {
			const instance = feature.factory(this._output);
			this._featureInstances.set(feature.configKey, instance);
		} else if (!enabled && existingInstance) {
			existingInstance.dispose();
			this._featureInstances.delete(feature.configKey);
		}
	}

	private _disposeAllFeatures(): void {
		for (const instance of this._featureInstances.values()) {
			instance.dispose();
		}
		this._featureInstances.clear();
	}
}

let extension: Extension | undefined;

export function activate(context: vscode.ExtensionContext) {
	extension = new Extension(context);
	context.subscriptions.push(extension);
}

export function deactivate() {
	extension = undefined;
}
