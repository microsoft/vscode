/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * IPC channel every workbench window registers so that the main process can ask
 * whether the window can be restarted without the user being present.
 */
export const UnattendedRestartChannelName = 'unattendedRestart';

/**
 * Whether a window can be restarted and restored exactly as it was without
 * user involvement. The restart is only allowed when there are no blockers.
 */
export interface IUnattendedRestartReadiness {

	/**
	 * Stable, non-localized identifiers (for example `terminal.runningProcess`)
	 * of the conditions that prevent the restart.
	 */
	readonly blockers: readonly string[];

	/**
	 * What exactly blocks, by blocker, for example the editors that cannot be
	 * restored. Only for the log: unlike the blockers, these are never sent in
	 * telemetry, because they can contain names of files.
	 */
	readonly details?: Readonly<Record<string, string>>;
}

/**
 * Describes blockers for the log, each with what exactly blocks if known, for
 * example `workbench.editorNotRestorable (Release Notes: 1.145.0 [releaseNotes])`.
 */
export function describeUnattendedRestartBlockers(blockers: readonly string[], details: ReadonlyMap<string, string>): string {
	return blockers.map(blocker => {
		const detail = details.get(blocker);
		return detail ? `${blocker} (${detail})` : blocker;
	}).join(', ');
}

/**
 * What a window reports to the main process over {@link UnattendedRestartChannelName}.
 */
export interface IUnattendedRestartWindowReadiness extends IUnattendedRestartReadiness {

	/**
	 * Whether `update.restartWhenIdle` is enabled. Experiments can enable it by
	 * default, but they only resolve in windows.
	 */
	readonly enabled: boolean;
}

/**
 * The part of a window that the main process calls over {@link UnattendedRestartChannelName}.
 */
export interface IUnattendedRestartReadinessProvider {
	canRestartUnattended(): Promise<IUnattendedRestartWindowReadiness>;
}
