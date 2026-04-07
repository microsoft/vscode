/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ThemeIcon } from '../../../../util/vs/base/common/themables';

/**
 * Represents a specific point in time.
*/
export type Instant = number;

let overridenNowValue = -1;

export function overrideNowValue(value: number): void {
	overridenNowValue = value;
}

export function now(): Instant {
	if (overridenNowValue !== -1) {
		return overridenNowValue;
	}
	return Date.now();
}

export namespace Icon {
	export type t = {
		themeIcon: ThemeIcon;
		svg: string;
	};

	export const circleSlash: t = {
		themeIcon: ThemeIcon.fromId('circle-slash'),
		svg: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16"><path fill="currentColor" d="M8 1a7 7 0 1 1-7 7a7.01 7.01 0 0 1 7-7M2 8c0 1.418.504 2.79 1.423 3.87l8.447-8.447A5.993 5.993 0 0 0 2 8m12 0c0-1.418-.504-2.79-1.423-3.87L4.13 12.577A5.993 5.993 0 0 0 14 8"/></svg>`,
	};

	export const error: t = {
		themeIcon: ThemeIcon.fromId('error'),
		svg: `<svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 16 16"><path fill="currentColor" fill-rule="evenodd" d="M8.6 1c1.6.1 3.1.9 4.2 2c1.3 1.4 2 3.1 2 5.1c0 1.6-.6 3.1-1.6 4.4c-1 1.2-2.4 2.1-4 2.4s-3.2.1-4.6-.7s-2.5-2-3.1-3.5S.8 7.5 1.3 6c.5-1.6 1.4-2.9 2.8-3.8C5.4 1.3 7 .9 8.6 1m.5 12.9c1.3-.3 2.5-1 3.4-2.1c.8-1.1 1.3-2.4 1.2-3.8c0-1.6-.6-3.2-1.7-4.3c-1-1-2.2-1.6-3.6-1.7c-1.3-.1-2.7.2-3.8 1S2.7 4.9 2.3 6.3c-.4 1.3-.4 2.7.2 4q.9 1.95 2.7 3c1.2.7 2.6.9 3.9.6M7.9 7.5L10.3 5l.7.7l-2.4 2.5l2.4 2.5l-.7.7l-2.4-2.5l-2.4 2.5l-.7-.7l2.4-2.5l-2.4-2.5l.7-.7z" clip-rule="evenodd"/></svg>`,
	};

	export const skipped: t = {
		themeIcon: ThemeIcon.fromId('testing-skipped-icon'),
		svg: `<svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 16 16"><path fill="currentColor" fill-rule="evenodd" d="M14.25 5.75v-4h-1.5v2.542c-1.145-1.359-2.911-2.209-4.84-2.209c-3.177 0-5.92 2.307-6.16 5.398l-.02.269h1.501l.022-.226c.212-2.195 2.202-3.94 4.656-3.94c1.736 0 3.244.875 4.05 2.166h-2.83v1.5h4.163l.962-.975V5.75zM8 14a2 2 0 1 0 0-4a2 2 0 0 0 0 4" clip-rule="evenodd"/></svg>`,
	};

	export const lightbulbFull: t = {
		themeIcon: ThemeIcon.fromId('refactor-preview-view-icon'),
		svg: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16"><path fill="currentColor" fill-rule="evenodd" d="M11.67 8.658a3.7 3.7 0 0 0-.781 1.114a3.3 3.3 0 0 0-.268 1.329v1.6a1.3 1.3 0 0 1-.794 1.197a1.3 1.3 0 0 1-.509.102H7.712a1.3 1.3 0 0 1-.922-.379a1.3 1.3 0 0 1-.38-.92v-1.6q0-.718-.274-1.329a3.6 3.6 0 0 0-.776-1.114a4.7 4.7 0 0 1-1.006-1.437A4.2 4.2 0 0 1 4 5.5a4.43 4.43 0 0 1 .616-2.27q.296-.504.705-.914a4.6 4.6 0 0 1 .911-.702q.508-.294 1.084-.454a4.5 4.5 0 0 1 1.2-.16a4.5 4.5 0 0 1 2.276.614a4.5 4.5 0 0 1 1.622 1.616a4.44 4.44 0 0 1 .616 2.27q0 .926-.353 1.721a4.7 4.7 0 0 1-1.006 1.437zM9.623 10.5H7.409v2.201q-.001.12.09.212a.3.3 0 0 0 .213.09h1.606a.3.3 0 0 0 .213-.09a.3.3 0 0 0 .09-.212V10.5z" clip-rule="evenodd"/></svg>`
	};

	export const database: t = {
		themeIcon: ThemeIcon.fromId('database'),
		svg: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16"><path fill="currentColor" d="M13 3.5C13 2.119 10.761 1 8 1S3 2.119 3 3.5c0 .04.02.077.024.117H3v8.872l.056.357C3.336 14.056 5.429 15 8 15s4.664-.944 4.944-2.154l.056-.357V3.617h-.024c.004-.04.024-.077.024-.117M8 2.032c2.442 0 4 .964 4 1.468s-1.558 1.468-4 1.468S4 4 4 3.5s1.558-1.468 4-1.468m4 10.458l-.03.131C11.855 13.116 10.431 14 8 14s-3.855-.884-3.97-1.379L4 12.49v-7.5A7.4 7.4 0 0 0 8 6a7.4 7.4 0 0 0 4-1.014z"/></svg>`,
	};
}

export function shortenOpportunityId(opportunityId: string): string {
	// example: `icr-1234abcd5678efgh` -> `1234`, where we strip the `icr-` prefix and take the first 4 characters
	return opportunityId.substring(4, 8);
}

export function checkIfCursorAtEndOfLine(lineWithCursor: string, cursorOffsetZeroBased: number): boolean {
	// check if there's any non-whitespace character after the cursor in the line
	const isCursorAtEndOfLine = lineWithCursor.substring(cursorOffsetZeroBased).match(/^\s*$/) !== null;
	return isCursorAtEndOfLine;
}
