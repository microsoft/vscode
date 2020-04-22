/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as Proto from '../protocol';
import { escapeRegExp } from '../utils/regexp';
import { TypeScriptVersion } from '../utils/versionProvider';


export class TypeScriptServerError extends Error {
	public static create(
		serverId: string,
		version: TypeScriptVersion,
		response: Proto.Response
	): TypeScriptServerError {
		const parsedResult = TypeScriptServerError.parseErrorText(version, response);
		return new TypeScriptServerError(serverId, version, response, parsedResult?.message, parsedResult?.stack);
	}

	private constructor(
		serverId: string,
		public readonly version: TypeScriptVersion,
		private readonly response: Proto.Response,
		public readonly serverMessage: string | undefined,
		public readonly serverStack: string | undefined
	) {
		super(`<${serverId}> TypeScript Server Error (${version.displayName})\n${serverMessage}\n${serverStack}`);
	}

	public get serverErrorText() { return this.response.message; }

	public get serverCommand() { return this.response.command; }

	public get telemetry() {
		/* __GDPR__FRAGMENT__
			"TypeScriptRequestErrorProperties" : {
				"command" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
				"message" : { "classification": "CallstackOrException", "purpose": "PerformanceAndHealth" },
				"stack" : { "classification": "CallstackOrException", "purpose": "PerformanceAndHealth" },
				"errortext" : { "classification": "CallstackOrException", "purpose": "PerformanceAndHealth" }
			}
		*/
		return {
			command: this.serverCommand,
			message: this.serverMessage || '',
			stack: this.serverStack || '',
			errortext: this.serverErrorText || '',
		} as const;
	}

	/**
	 * Given a `errorText` from a tsserver request indicating failure in handling a request,
	 * prepares a payload for telemetry-logging.
	 */
	private static parseErrorText(version: TypeScriptVersion, response: Proto.Response) {
		const errorText = response.message;
		if (errorText) {
			const errorPrefix = 'Error processing request. ';
			if (errorText.startsWith(errorPrefix)) {
				let prefixFreeErrorText = errorText.substr(errorPrefix.length);

				// Prior to https://github.com/microsoft/TypeScript/pull/32785, this error
				// returned and excessively long and detailed list of paths.  Since server-side
				// filtering doesn't have sufficient granularity to drop these specific
				// messages, we sanitize them here.
				if (prefixFreeErrorText.indexOf('Could not find sourceFile') >= 0) {
					prefixFreeErrorText = prefixFreeErrorText.replace(/ in \[[^\]]*\]/g, '');
				}

				const newlineIndex = prefixFreeErrorText.indexOf('\n');
				if (newlineIndex >= 0) {
					// Newline expected between message and stack.
					return {
						message: prefixFreeErrorText.substring(0, newlineIndex),
						stack: TypeScriptServerError.normalizeMessageStack(version, prefixFreeErrorText.substring(newlineIndex + 1))
					};
				}
			}
		}
		return undefined;
	}

	/**
	 * Try to replace full TS Server paths with 'tsserver.js' so that we don't have to post process the data as much
	 */
	private static normalizeMessageStack(version: TypeScriptVersion, message: string | undefined) {
		if (!message) {
			return '';
		}
		return message.replace(new RegExp(`${escapeRegExp(version.path)}[/\\\\]tsserver.js:`, 'gi'), 'tsserver.js:');
	}
}
