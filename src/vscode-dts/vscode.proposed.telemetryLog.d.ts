/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	export namespace window {
		/**
		 * Logs a telemetry event to a shared extension output channel when the log level is set to trace.
		 * This is similar in function to cores' telemetry output channel that can be seen when log level is set to trace.
		 * Extension authors should only log to the output channel when sending telemetry.
		 *
		 * @param eventName The name of the telemetry event
		 * @param data The data associated with the telemetry event
		 */
		export function logTelemetryToOutputChannel(eventName: string, data: Record<string, any>): void;
	}
}
