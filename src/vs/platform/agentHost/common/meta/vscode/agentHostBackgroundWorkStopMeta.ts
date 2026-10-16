/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/** Marks background work that the host stops through the VS Code-only `vscode/stopBackgroundWork` request. */
const BACKGROUND_WORK_STOPPABLE_META_KEY = 'vscode.stopBackgroundWork';

/** Builds the `_meta` that lets clients stop a background work entry. */
export function toStoppableBackgroundWorkMeta(): Record<string, unknown> {
	return { [BACKGROUND_WORK_STOPPABLE_META_KEY]: true };
}

/** Whether the host accepts `vscode/stopBackgroundWork` for this entry. */
export function canStopBackgroundWork(work: { readonly _meta?: Record<string, unknown> }): boolean {
	return work._meta?.[BACKGROUND_WORK_STOPPABLE_META_KEY] === true;
}
