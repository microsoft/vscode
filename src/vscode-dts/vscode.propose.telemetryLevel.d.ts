/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	// https://github.com/Microsoft/vscode/issues/137470

	/**
	 * The various levels which telemetry can be set at.
	 */
	export const enum TelemetryLevel {
		/**
		 * No telemetry is sent.
		 */
		NONE = 0,
		/**
		 * Only crash reports are sent.
		 */
		CRASH = 1,
		/**
		 * Only crash reports and error telemetry is sent.
		 */
		ERROR = 2,
		/**
		 * All telemetry is sent.
		 */
		USAGE = 3
	}

	export namespace env {
		/**
		 * Indicated the level of telemetry to send.
		 * Can be a more granular version of {@link isTelemetryEnabled}
		 */
		export const telemetryLevel: TelemetryLevel;

		/**
		 * An {@link Event} which fires when the telemetry level changes.
		 * Can be used as a more granular version of {@link onDidChangeTelemetryEnabled}
		 */
		export const onDidChangeTelemetryLevel: Event<TelemetryLevel>;
	}
}
