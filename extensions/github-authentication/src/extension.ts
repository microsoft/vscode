/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { GitHubAuthenticationProvider, AuthProviderType } from './github';
import TelemetryReporter from 'vscode-extension-telemetry';
import { createExperimentationService, ExperimentationTelemetry } from './experimentationService';

export async function activate(context: vscode.ExtensionContext) {
	const { name, version, aiKey } = require('../package.json') as { name: string, version: string, aiKey: string };
	const telemetryReporter = new ExperimentationTelemetry(new TelemetryReporter(name, version, aiKey));

	const experimentationService = await createExperimentationService(context, telemetryReporter);
	await experimentationService.initialFetch;

	[
		AuthProviderType.github,
		AuthProviderType['github-enterprise']
	].forEach(async type => {
		const loginService = new GitHubAuthenticationProvider(context, type, telemetryReporter);
		await loginService.initialize();
	});
}

// this method is called when your extension is deactivated
export function deactivate() { }
