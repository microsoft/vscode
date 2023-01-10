/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	/**
	 * A special value wrapper denoting a value that is safe to not clean.
	 * This is to be used when you can guarantee no identifiable information is contained in the value and the cleaning is improperly redacting it.
	 */
	export class TelemetryTrustedValue<T = any> {
		readonly value: T;

		constructor(value: T);
	}

	/**
	 * A telemetry logger which can be used by extensions to log usage and error telementry.
	 *
	 * A logger wraps around an {@link TelemetrySender sender} but it guarantees that
	 * - user settings to disable or tweak telemetry are respected, and that
	 * - potential sensitive data is removed
	 *
	 * It also enables an "echo UI" that prints whatever data is send and it allows the editor
	 * to forward unhandled errors to the respective extensions.
	 *
	 * To get an instance of a `TelemetryLogger`, use
	 * {@link env.createTelemetryLogger `createTelemetryLogger`}.
	 */
	export interface TelemetryLogger {

		/**
		 * An {@link Event} which fires when the enablement state of usage or error telemetry changes.
		 */
		readonly onDidChangeEnableStates: Event<TelemetryLogger>;

		/**
		 * Whether or not usage telemetry is enabled for this logger.
		 */
		readonly isUsageEnabled: boolean;

		/**
		 * Whether or not error telemetry is enabled for this logger.
		 */
		readonly isErrorsEnabled: boolean;

		/**
		 * Log a usage event.
		 *
		 * After completing cleaning, telemetry setting checks, and data mix-in calls `TelemetrySender.sendEventData` to log the event.
		 * Automatically supports echoing to extension telemetry output channel.
		 * @param eventName The event name to log
		 * @param data The data to log
		 */
		logUsage(eventName: string, data?: Record<string, any | TelemetryTrustedValue>): void;

		/**
		 * Log an error event.
		 *
		 * After completing cleaning, telemetry setting checks, and data mix-in calls `TelemetrySender.sendEventData` to log the event. Differs from `logUsage` in that it will log the event if the telemetry setting is Error+.
		 * Automatically supports echoing to extension telemetry output channel.
		 * @param eventName The event name to log
		 * @param data The data to log
		 */
		logError(eventName: string, data?: Record<string, any | TelemetryTrustedValue>): void;

		/**
		 * Log an error event.
		 *
		 * Calls `TelemetrySender.sendErrorData`. Does cleaning, telemetry checks, and data mix-in.
		 * Automatically supports echoing to extension telemetry output channel.
		 * Will also automatically log any exceptions thrown within the extension host process.
		 * @param error The error object which contains the stack trace cleaned of PII
		 * @param data Additional data to log alongside the stack trace
		 */
		logError(error: Error, data?: Record<string, any | TelemetryTrustedValue>): void;

		/**
		 * Dispose this object and free resources.
		 */
		dispose(): void;
	}

	/**
	 * The telemetry sender is the contract between a telemetry logger and some telemetry service. **Note** that extensions must NOT
	 * call the methods of their sender directly as the logger provides extra guards and cleaning.
	 *
	 * ```js
	 * const sender: vscode.TelemetrySender = {...};
	 * const logger = vscode.env.createTelemetryLogger(sender);
	 *
	 * // GOOD - uses the logger
	 * logger.logUsage('myEvent', { myData: 'myValue' });
	 *
	 * // BAD - uses the sender directly: no data cleansing, ignores user settings, no echoing to the telemetry output channel etc
	 * sender.logEvent('myEvent', { myData: 'myValue' });
	 * ```
	 */
	export interface TelemetrySender {
		/**
		 * Function to send event data without a stacktrace. Used within a {@link TelemetryLogger}
		 *
		 * @param eventName The name of the event which you are logging
		 * @param data A serializable key value pair that is being logged
		 */
		sendEventData(eventName: string, data?: Record<string, any>): void;

		/**
		 * Function to send an error. Used within a {@link TelemetryLogger}
		 *
		 * @param error The error being logged
		 * @param data Any additional data to be collected with the exception
		 */
		sendErrorData(error: Error, data?: Record<string, any>): void;

		/**
		 * Optional flush function which will give this sender a chance to send any remaining events
		 * as its {@link TelemetryLogger} is being disposed
		 */
		flush?(): void | Thenable<void>;
	}

	/**
	 * Options for creating a {@link TelemetryLogger}
	 */
	export interface TelemetryLoggerOptions {
		/**
		 * Whether or not you want to avoid having the built-in common properties such as os, extension name, etc injected into the data object.
		 * Defaults to `false` if not defined.
		 */
		readonly ignoreBuiltInCommonProperties?: boolean;

		/**
		 * Whether or not unhandled errors on the extension host caused by your extension should be logged to your sender.
		 * Defaults to `false` if not defined.
		 */
		readonly ignoreUnhandledErrors?: boolean;

		/**
		 * Any additional common properties which should be injected into the data object.
		 */
		readonly additionalCommonProperties?: Record<string, any>;
	}

	export namespace env {
		/**
		 * Creates a new {@link TelemetryLogger telemetry logger}.
		 *
		 * @param sender The telemetry sender that is used by the telemetry logger.
		 * @param options Options for the telementry logger.
		 * @returns A new telemetry logger
		 */
		export function createTelemetryLogger(sender: TelemetrySender, options?: TelemetryLoggerOptions): TelemetryLogger;
	}
}
