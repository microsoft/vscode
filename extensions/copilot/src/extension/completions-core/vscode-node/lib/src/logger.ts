/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
/**
 * This file is kept with minimal dependencies to avoid circular dependencies
 * breaking module resolution since the Logger class is instantiated at the
 * module level in many places.
 *
 * Do not add any concrete dependencies here.
 */
import { createServiceIdentifier } from '../../../../../util/common/services';
import { ServicesAccessor } from '../../../../../util/vs/platform/instantiation/common/instantiation';
import { ICompletionsTelemetryService } from '../../bridge/src/completionsTelemetryServiceBridge';
import { telemetryException } from './telemetry';

export enum LogLevel {
	DEBUG = 4,
	INFO = 3,
	WARN = 2,
	ERROR = 1,
}

export const ICompletionsLogTargetService = createServiceIdentifier<ICompletionsLogTargetService>('ICompletionsLogTargetService');
export interface ICompletionsLogTargetService {
	readonly _serviceBrand: undefined;
	logIt(level: LogLevel, category: string, ...extra: unknown[]): void;
}

export class Logger {
	constructor(private readonly category: string) { }

	private log(logTarget: ICompletionsLogTargetService, level: LogLevel, ...extra: unknown[]) {
		logTarget.logIt(level, this.category, ...extra);
	}

	debug(logTarget: ICompletionsLogTargetService, ...extra: unknown[]) {
		this.log(logTarget, LogLevel.DEBUG, ...extra);
	}

	info(logTarget: ICompletionsLogTargetService, ...extra: unknown[]) {
		this.log(logTarget, LogLevel.INFO, ...extra);
	}

	warn(logTarget: ICompletionsLogTargetService, ...extra: unknown[]) {
		this.log(logTarget, LogLevel.WARN, ...extra);
	}

	/**
	 * Logs an error message and reports an error to telemetry. This is appropriate for generic
	 * error logging, which might not be associated with an exception. Prefer `exception()` when
	 * logging exception details.
	 */
	error(logTarget: ICompletionsLogTargetService, ...extra: unknown[]) {
		this.log(logTarget, LogLevel.ERROR, ...extra);
	}

	/**
	 * Logs an error message and reports the exception to telemetry. Prefer this method over
	 * `error()` when logging exception details.
	 *
	 * @param accessor The accessor
	 * @param error The Error object that was thrown
	 * @param message An optional message for context (e.g. "Request error"). Must not contain customer data. **Do not include stack trace or messages from the error object.**
	 */
	exception(accessor: ServicesAccessor, error: unknown, origin: string) {
		// ignore VS Code cancellations
		if (error instanceof Error && error.name === 'Canceled' && error.message === 'Canceled') { return; }

		let message = origin;
		if (origin.startsWith('.')) {
			message = origin.substring(1);
			origin = `${this.category}${origin}`;
		}

		telemetryException(accessor.get(ICompletionsTelemetryService), error, origin);

		const safeError: Error = error instanceof Error ? error : new Error(`Non-error thrown: ${String(error)}`);
		this.log(accessor.get(ICompletionsLogTargetService), LogLevel.ERROR, `${message}:`, safeError);
	}
}

export const logger = new Logger('default');
