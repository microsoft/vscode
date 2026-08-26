/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export function t(message: string, args: Record<string, any>): string;
export function t(message: string, ...args: Array<string | number | boolean>): string;
export function t(options: { message: string; args?: Array<string | number | boolean> | Record<string, any>; comment: string | string[] }): string;
export function t(...params: [message: string, ...args: Array<string | number | boolean>] | [message: string, args: Record<string, any>] | [{ message: string; args?: Array<string | number | boolean> | Record<string, any>; comment: string | string[] }]): string {
	if (typeof params[0] === 'string') {
		const key = params.shift() as string;

		// We have either rest args which are Array<string | number | boolean> or an array with a single Record<string, any>.
		// This ensures we get a Record<string | number, any> which will be formatted correctly.
		const argsFormatted = !params || typeof params[0] !== 'object' ? params : params[0];
		return getMessage({ message: key, args: argsFormatted as Record<string | number, any> | undefined });
	}

	return getMessage(params[0]);
}

interface IStringDetails {
	message: string;
	args?: Record<string | number, any>;
	comment?: string | string[];
}

function getMessage(details: IStringDetails): string {
	const { message, args } = details;
	return format2(message, (args ?? {}));
}

const _format2Regexp = /{([^}]+)}/g;

function format2(template: string, values: Record<string, unknown>): string {
	return template.replace(_format2Regexp, (match, group) => (values[group] ?? match) as string);
}
