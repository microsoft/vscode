/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	export interface TelemetryLogger {
		//TODO feels weird having this on all loggers
		readonly onDidChangeEnableStates: Event<TelemetryLogger>;
		readonly isUsageEnabled: boolean;
		readonly isErrorsEnabled: boolean;

		/**
		 * After completing cleaning, telemetry setting checks, and data mix-in calls `TelemetryAppender.logEvent` to log the event.
		 * Automatically supports echoing to extension telemetry output channel.
		 * @param eventName The event name to log
		 * @param data The data to log
		 */
		logUsage(eventName: string, data?: Record<string, string | number | boolean>): void;

		/**
		 * After completing cleaning, telemetry setting checks, and data mix-in calls `TelemetryAppender.logEvent` to log the event. Differs from `logUsage` in that it will log the event if the telemetry setting is Error+.
		 * Automatically supports echoing to extension telemetry output channel.
		 * @param eventName The event name to log
		 * @param data The data to log
		 */
		logError(eventName: string, data?: Record<string, any>): void;

		/**
		 * Calls `TelemetryAppender.logException`. Does cleaning, telemetry checks, and data mix-in.
		 * Automatically supports echoing to extension telemetry output channel.
		 * Will also automatically log any exceptions thrown within the extension host process.
		 * @param exception The error object which contains the stack trace cleaned of PII
		 * @param data Additional data to log alongside the stack trace
		 */
		logError(exception: Error, data?: Record<string, any>): void;

		dispose(): void;
	}

	export interface TelemetryAppender {
		/**
		 * Whether or not you want to avoid having the built-in common properties such as os, extension name, etc injected into the data object.
		 */
		readonly ignoreBuiltInCommonProperties: boolean;

		/**
		 * Any additional common properties which should be injected into the data object.
		 */
		readonly additionalCommonProperties?: Record<string, any>;

		/**
		 * User-defined function which logs an event, used within the TelemetryLogger
		 * @param eventName The name of the event which you are logging
		 * @param data A serializable key value pair that is being logged
		 */
		logEvent(eventName: string, data?: Record<string, any>): void;

		/**
		 * User-defined function which logs an error, used within the TelemetryLogger
		 * @param exception The exception being logged
		 * @param data Any additional data to be collected with the exception
		 */
		logException(exception: Error, data?: Record<string, any>): void;

		/**
		 * Optional flush function which will give your appender one last chance to send any remaining events as the TelemetryLogger is being disposed
		 */
		flush?(): void | Thenable<void>;
	}

	export namespace env {
		/**
		 * A wrapper around a TelemetryAppender which provides built-in setting checks, common properties, data cleaning, output channel logging, and internal ext host process exception catching.
		 * @param appender The core piece which we call when it is time to log telemetry. It is highly recommended that you don't call the methods within the appender directly as the logger provides extra guards and cleaning.
		 * @returns An instantiated telemetry logger which you can use for recording telemetry
		 */
		export function createTelemetryLogger(appender: TelemetryAppender): TelemetryLogger;
	}
}
