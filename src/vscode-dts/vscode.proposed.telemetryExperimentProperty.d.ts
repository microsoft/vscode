/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	export namespace env {
		/**
		 * Sets an experiment property that will be attached to telemetry events
		 * sent by the current window's telemetry service. This is intended for
		 * trusted built-in extensions that need to propagate server-side experiment
		 * assignments to the host telemetry pipeline.
		 *
		 * Note: This follows the same per-window scope as other experiment properties
		 * (e.g., TAS assignment context).
		 *
		 * @param name The property name (e.g., 'capi.assignmentcontext')
		 * @param value The property value
		 */
		export function setTelemetryExperimentProperty(name: string, value: string): void;
	}
}
