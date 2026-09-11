/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export const workbenchClientProfileRunnerSource = `/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

const { writeFile } = require('fs/promises');
const vscode = require('vscode');

exports.run = async () => {
	const output = process.env.AGENT_HOST_CLIENT_PROFILE_OUTPUT;
	if (!output) {
		throw new Error('AGENT_HOST_CLIENT_PROFILE_OUTPUT is required.');
	}
	try {
		const extension = vscode.extensions.getExtension('GitHub.copilot-chat');
		if (!extension) {
			throw new Error('The real GitHub.copilot-chat extension is not available.');
		}
		if (!extension.isActive) {
			await extension.activate();
		}
		const tools = await vscode.commands.executeCommand('_test.captureAgentHostClientProfile', { toolSets: ['vscode-general', 'vscode-browser'] });
		if (!Array.isArray(tools) || !tools.length) {
			throw new Error('The workbench capture command returned no client tools.');
		}
		await writeFile(output, JSON.stringify({ tools }));
	} catch (error) {
		await writeFile(output, JSON.stringify({ error: String(error?.stack ?? error).slice(-16_384) }));
		throw error;
	}
};
`;
