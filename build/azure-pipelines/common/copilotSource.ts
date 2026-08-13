/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export const RUNTIME_REPO = 'github/copilot-agent-runtime';

export interface CopilotGitSource {
	readonly repo: string;
	readonly ref: string;
}

export function sourceBuildVersion(ref: string): string {
	return `0.0.0-src.g${ref.slice(0, 7)}`;
}
