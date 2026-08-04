/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as util from 'node:util';
import { ICompletionsLogTargetService, LogLevel } from '../logger';

export type TestLogMessage = {
	level: LogLevel;
	category: string;
	extra: unknown[];
};

export class TestLogTarget implements ICompletionsLogTargetService {
	declare _serviceBrand: undefined;
	private readonly _messages: TestLogMessage[] = [];

	logIt(level: LogLevel, category: string, ...extra: unknown[]): void {
		this._messages.push({ level, category: category, extra });
	}

	hasMessage(level: LogLevel, ...extra: unknown[]) {
		return this._messages.some(
			m =>
				m.level === level &&
				m.extra.length === extra.length &&
				m.extra
					.filter(e => !(e instanceof Error))
					.every((e, i) => {
						return util.isDeepStrictEqual(e, extra[i]);
					})
		);
	}

	assertHasMessage(level: LogLevel, ...extra: unknown[]) {
		if (!this.hasMessage(level, ...extra)) {
			throw new Error(
				`Expected message not found: ${LogLevel[level]} ${JSON.stringify(
					extra
				)}. Actual messages: ${this._messages
					.map(m => '\n- ' + LogLevel[m.level] + ': ' + JSON.stringify(m.extra))
					.join('')}`
			);
		}
	}

	/**
	 * Checks for a logged message matching a given regex. Emulates
	 * OutputChannelLog for conversion of log message to string.
	 */
	hasMessageMatching(level: LogLevel, test: RegExp) {
		return this._messages.some(
			m => m.level === level && test.test(`[${m.category}] ${m.extra.map(toPlainText).join(',')}`)
		);
	}

	assertHasMessageMatching(level: LogLevel, test: RegExp) {
		if (!this.hasMessageMatching(level, test)) {
			throw new Error(
				`Expected message not found: ${LogLevel[level]} ${test}. Actual messages: ${this._messages
					.map(m => '\n- ' + LogLevel[m.level] + ': ' + JSON.stringify(m.extra))
					.join('')}`
			);
		}
	}

	get messageCount() {
		return this._messages.length;
	}

	isEmpty() {
		return this._messages.length === 0;
	}
}

function toPlainText(x: unknown): string {
	switch (typeof x) {
		case 'object':
			return util.inspect(x);
		default:
			return String(x);
	}
}
