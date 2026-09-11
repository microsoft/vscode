/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Re-exports the canvas-context variable-entry helpers from
 * `workbench/contrib/chat/common/attachments/chatCanvasContext.ts`, which
 * owns the shared implementation. `src/vs/sessions/` may import from
 * `vs/workbench` (not vice versa), so this package depends on that shared
 * module rather than duplicating its logic.
 *
 * `sessionCanvasContext.contribution.ts` (this package's owned,
 * visible/removable attach-picker UI) is the only consumer of
 * {@link toCanvasContextVariableEntry} here: it builds the attachment at
 * pick-time from a target captured when the picker was shown, using that
 * target's `getContextReference`. Once attached, `AgentHostSessionHandler`
 * (out of this package's ownership) collects every such entry off the
 * outgoing request via {@link collectCanvasContextReferences} /
 * {@link withCanvasVariableContext} and hoists it onto the wire message's
 * top-level `_meta` before submission — that wiring is not duplicated here.
 */
export {
	CanvasContextVariableMid,
	collectCanvasContextReferences,
	getCanvasContextReference,
	isCanvasContextVariableEntry,
	toCanvasContextVariableEntry,
	withCanvasVariableContext,
	type ICanvasContextVariableValue,
} from '../../../../workbench/contrib/chat/common/attachments/chatCanvasContext.js';
