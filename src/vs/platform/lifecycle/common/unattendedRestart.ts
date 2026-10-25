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
