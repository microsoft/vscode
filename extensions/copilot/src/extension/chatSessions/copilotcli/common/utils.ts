/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Uri } from 'vscode';
import { URI } from '../../../../util/vs/base/common/uri';
import type { internal } from '@github/copilot/sdk';

export type LocalSession = NonNullable<Awaited<ReturnType<internal.LocalSessionManager['getSession']>>>;
export type Session = LocalSession;

/**
 * The vendor of the language models that the Copilot CLI registers for its chat sessions.
 */
export const COPILOT_CLI_MODEL_VENDOR = 'copilotcli';

/**
 * Returns the identifier VS Code assigns to the Copilot CLI language model with the
 * given id. Chat history must report models by this identifier, so that VS Code can
 * restore the model that a session uses when the session is opened.
 */
export function getCopilotCLIModelIdentifier(modelId: string): string {
	return `${COPILOT_CLI_MODEL_VENDOR}/${modelId}`;
}

export namespace SessionIdForCLI {
	export function getResource(sessionId: string): Uri {
		return URI.from({ scheme: 'copilotcli', path: `/${sessionId}` }) as unknown as Uri;
	}

	export function parse(resource: Uri): string {
		return resource.path.slice(1);
	}

	export function isCLIResource(resource: Uri): boolean {
		return resource.scheme === 'copilotcli';
	}
}
