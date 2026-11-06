/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable } from '../../../../base/common/lifecycle.js';
import { CommandsRegistry } from '../../../../platform/commands/common/commands.js';
import { ICanvasReference, ICanvasService, REVEAL_CANVAS_COMMAND_ID } from '../common/canvas.js';

/** Registers the commands through which chat surfaces such as canvas pills present canvases. */
export function registerCanvasCommands(): IDisposable {
	return CommandsRegistry.registerCommand(REVEAL_CANVAS_COMMAND_ID, (accessor, reference: ICanvasReference) => accessor.get(ICanvasService).revealCanvas(reference));
}
