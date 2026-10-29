/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as l10n from '@vscode/l10n';
import * as vscode from 'vscode';
import { Uri } from 'vscode';
import { isUri } from '../../../util/common/types';
import { DisposableStore, IDisposable } from '../../../util/vs/base/common/lifecycle';
import { getCopilotCLISessionDir } from '../copilotcli/node/cliHelpers';
import type { ICopilotCLISessionTracker } from '../copilotcli/vscode-node/copilotCLISessionTracker';
import type { ICopilotCLITerminalIntegration, TerminalOpenLocation } from './copilotCLITerminalIntegration';

const OPEN_IN_COPILOT_CLI_COMMAND_ID = 'github.copilot.cli.openInCopilotCLI';

/**
 * Resolves candidate session directories for a CLI terminal, ordered by
 * terminal affinity.
 *
 * Sessions whose owning terminal matches `terminal` are returned first so the
 * link provider's file-existence probing hits the correct session-state dir
 * before unrelated ones. Unrelated sessions are still included at the tail
 * because a new session may not have registered its terminal yet (session IDs
 * arrive later via MCP?).
 */
export async function resolveSessionDirsForTerminal(
	sessionTracker: ICopilotCLISessionTracker,
	terminal: vscode.Terminal,
): Promise<Uri[]> {
	const activeIds = sessionTracker.getSessionIds();
	const sessionTerminals = await Promise.all(activeIds.map(id => sessionTracker.getTerminal(id)));
	const matching: Uri[] = [];
	const rest: Uri[] = [];
	for (let i = 0; i < activeIds.length; i++) {
		const dir = Uri.file(getCopilotCLISessionDir(activeIds[i]));
		if (sessionTerminals[i] === terminal) {
			matching.push(dir);
		} else {
			rest.push(dir);
		}
	}
	return [...matching, ...rest];
}

/**
 * Registers the commands that open the standalone Copilot CLI in an integrated
 * terminal, and wires terminal links to the CLI's session-state directories.
 * Independent of the extension-host Copilot CLI chat session provider.
 */
export function registerCopilotCLITerminalCommands(
	terminalIntegration: ICopilotCLITerminalIntegration,
	sessionTracker: ICopilotCLISessionTracker,
	registerCommand: typeof vscode.commands.registerCommand = (command, callback, thisArg) => vscode.commands.registerCommand(command, callback, thisArg),
): IDisposable {
	const disposableStore = new DisposableStore();

	terminalIntegration.setSessionDirResolver(terminal =>
		resolveSessionDirsForTerminal(sessionTracker, terminal)
	);

	const createCopilotCLITerminal = async (location: TerminalOpenLocation = 'editor', name?: string, cwd?: string): Promise<void> => {
		// TODO@rebornix should be set by CLI
		const terminalName = name || process.env.COPILOTCLI_TERMINAL_TITLE || l10n.t('Copilot CLI');
		await terminalIntegration.openTerminal(terminalName, [], cwd, location);
	};

	disposableStore.add(registerCommand('github.copilot.cli.newSession', async () => {
		await createCopilotCLITerminal('editor', l10n.t('Copilot CLI'));
	}));
	disposableStore.add(registerCommand('github.copilot.cli.newSessionToSide', async () => {
		await createCopilotCLITerminal('editorBeside', l10n.t('Copilot CLI'));
	}));
	disposableStore.add(registerCommand(OPEN_IN_COPILOT_CLI_COMMAND_ID, async (sourceControlContext?: unknown) => {
		const rootUri = getSourceControlRootUri(sourceControlContext);
		await createCopilotCLITerminal('editor', l10n.t('Copilot CLI'), rootUri?.fsPath);
	}));

	return disposableStore;
}

function getSourceControlRootUri(sourceControlContext?: unknown): Uri | undefined {
	if (!sourceControlContext) {
		return undefined;
	}

	if (Array.isArray(sourceControlContext)) {
		return getSourceControlRootUri(sourceControlContext[0]);
	}

	if (isUri(sourceControlContext)) {
		return sourceControlContext;
	}

	if (typeof sourceControlContext !== 'object') {
		return undefined;
	}

	const candidate = sourceControlContext as {
		rootUri?: unknown;
		sourceControl?: { rootUri?: unknown };
		repository?: { rootUri?: unknown };
	};

	if (isUri(candidate.rootUri)) {
		return candidate.rootUri;
	}

	if (isUri(candidate.sourceControl?.rootUri)) {
		return candidate.sourceControl.rootUri;
	}

	if (isUri(candidate.repository?.rootUri)) {
		return candidate.repository.rootUri;
	}

	return undefined;
}
