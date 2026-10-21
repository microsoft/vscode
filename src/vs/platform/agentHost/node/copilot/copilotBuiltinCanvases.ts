/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type Canvas, type CanvasOptions, type CanvasProviderIdentity, createCanvas } from '@github/copilot-sdk';
import { localize } from '../../../../nls.js';

// The SDK only exposes its canvas provider wire types through the handler signatures.
export type CopilotCanvasOpenRequest = Parameters<CanvasOptions['open']>[0];
export type CopilotCanvasOpenResult = Awaited<ReturnType<CanvasOptions['open']>>;
export type CopilotCanvasCloseRequest = Parameters<NonNullable<CanvasOptions['onClose']>>[0];

/**
 * Stable identity of the canvases the agent host itself contributes to a Copilot session. The runtime
 * uses the id verbatim as the canvas extension id, so it must stay constant across host restarts.
 */
export const COPILOT_BUILTIN_CANVAS_PROVIDER: CanvasProviderIdentity = { id: 'vscode:agent-host', name: 'VS Code' };

export const COPILOT_TODOS_CANVAS_ID = 'todos';

// Read by the model from the canvas catalog, like a tool description; it is not shown in VS Code UI, so it stays English.
const todosCanvasDescription = 'Shows the session plan document together with the todo items tracked in the `todos` and `todo_deps` SQL tables, grouped by status with their blocking dependencies. Open it when planning or implementing multi-step work so the user can follow progress.';

/** Serves and ends the host-provided canvas presentations of one Copilot session. */
export interface ICopilotBuiltinCanvasHost {
	openBuiltinCanvas(request: CopilotCanvasOpenRequest): Promise<CopilotCanvasOpenResult>;
	closeBuiltinCanvas(request: CopilotCanvasCloseRequest): void;
}

/** Declares the canvases the agent host provides in-process when the canvas runtime is enabled. */
export function createCopilotBuiltinCanvases(enabled: boolean, host: ICopilotBuiltinCanvasHost): Canvas[] {
	if (!enabled) {
		return [];
	}
	return [createCanvas({
		id: COPILOT_TODOS_CANVAS_ID,
		displayName: localize('copilotTodosCanvas.displayName', "Todos"),
		description: todosCanvasDescription,
		open: request => host.openBuiltinCanvas(request),
		onClose: request => host.closeBuiltinCanvas(request),
	})];
}
