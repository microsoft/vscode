/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as l10n from '@vscode/l10n';
import * as arrays from '../vs/base/common/arrays';
import * as types from '../vs/base/common/types';

/* eslint-disable @typescript-eslint/no-explicit-any */

function exceptionToErrorMessage(exception: unknown, verbose: boolean): string {
	if (verbose && ((exception as any).stack || (exception as any).stacktrace)) {
		const stackStr = stackToString((exception as any).stack) || stackToString((exception as any).stacktrace);
		return `${detectSystemErrorMessage(exception)}: ${stackStr || ''}`;
	}

	return detectSystemErrorMessage(exception);
}

function stackToString(stack: string[] | string | undefined): string | undefined {
	if (Array.isArray(stack)) {
		return stack.join('\n');
	}

	return stack;
}

function detectSystemErrorMessage(exception: any): string {

	// Custom node.js error from us
	if (exception.code === 'ERR_UNC_HOST_NOT_ALLOWED') {
		return l10n.t("{0}. Please update the '{1}' setting if you want to allow this host.", exception.message, 'security.allowedUNCHosts');
	}

	// See https://nodejs.org/api/errors.html#errors_class_system_error
	if (typeof exception.code === 'string' && typeof exception.errno === 'number' && typeof exception.syscall === 'string') {
		return l10n.t('A system error occurred ({0})', exception.message);
	}

	return exception.message || l10n.t('An unknown error occurred. Please consult the log for more details.');
}

/**
 * Tries to generate a human readable error message out of the error. If the verbose parameter
 * is set to true, the error message will include stacktrace details if provided.
 *
 * @returns A string containing the error message.
 */
export function toErrorMessage(error: any = null, verbose: boolean = false): string {
	if (!error) {
		return l10n.t('An unknown error occurred. Please consult the log for more details.');
	}

	if (Array.isArray(error)) {
		const errors: any[] = arrays.coalesce(error);
		const msg = toErrorMessage(errors[0], verbose);

		if (errors.length > 1) {
			return l10n.t('{0} ({1} errors in total)', msg, errors.length);
		}

		return msg;
	}

	if (types.isString(error)) {
		return error;
	}

	if (error.detail) {
		const detail = error.detail;

		if (detail.error) {
			return exceptionToErrorMessage(detail.error, verbose);
		}

		if (detail.exception) {
			return exceptionToErrorMessage(detail.exception, verbose);
		}
	}

	if (error.stack) {
		return exceptionToErrorMessage(error, verbose);
	}

	if (error.message) {
		return error.message;
	}

	return l10n.t('An unknown error occurred. Please consult the log for more details.');
}
