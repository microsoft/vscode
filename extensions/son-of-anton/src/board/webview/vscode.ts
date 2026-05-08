/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
/**
 * @fileoverview Thin wrapper around `acquireVsCodeApi()` so every component
 * uses the same singleton — VS Code only allows one acquire per webview load.
 */

import type { WebviewToHostMessage } from './protocol';

declare global {
	interface VsCodeApi {
		postMessage(message: unknown): void;
		setState(state: unknown): void;
		getState(): unknown;
	}

	function acquireVsCodeApi(): VsCodeApi;
}

let cached: VsCodeApi | undefined;

export function vscode(): VsCodeApi {
	if (!cached) {
		cached = acquireVsCodeApi();
	}
	return cached;
}

export function postToHost(message: WebviewToHostMessage): void {
	vscode().postMessage(message);
}
