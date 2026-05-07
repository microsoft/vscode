/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { homedir } from 'os';
import { join } from 'path';

const COPILOT_HOME_DIRECTORY = '.copilot';

export function getCopilotHome(): string {
	const copilotHome = process.env.COPILOT_HOME;
	if (copilotHome) {
		return copilotHome;
	}

	const xdgHome = process.env.XDG_STATE_HOME;
	return xdgHome
		? join(xdgHome, COPILOT_HOME_DIRECTORY)
		: join(homedir(), COPILOT_HOME_DIRECTORY);
}

export function getCopilotCliStateDir(): string {
	return join(getCopilotHome(), 'ide');
}

export function getCopilotCLISessionStateDir(): string {
	return join(getCopilotHome(), 'session-state');
}

export function getCopilotCLISessionDir(sessionId: string): string {
	return join(getCopilotCLISessionStateDir(), sessionId);
}

export function getCopilotCLISessionEventsFile(sessionId: string) {
	return join(getCopilotCLISessionDir(sessionId), 'events.jsonl');
}

export function getCopilotCLIWorkspaceFile(sessionId: string) {
	return join(getCopilotCLISessionDir(sessionId), 'workspace.yaml');
}

/**
 * Path of the shared bulk metadata cache file. This file is shared by all VS Code
 * installs (Stable, Insiders, OSS, Exploration) and the Agents application.
 */
export function getCopilotBulkMetadataFile(): string {
	return join(getCopilotHome(), 'vscode.session.metadata.cache.json');
}
