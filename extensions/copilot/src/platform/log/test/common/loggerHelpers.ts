/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ILogTarget, LogLevel } from '../../common/logService';

export type TestLogMessage = {
	level: LogLevel;
	message: string;
};

export class TestLogTarget implements ILogTarget {
	private readonly _messages: TestLogMessage[] = [];

	logIt(level: LogLevel, messageString: string): void {
		this._messages.push({ level, message: messageString });
	}

	public hasMessage(level: LogLevel, message: string) {
		return this._messages.some(
			m =>
				m.level === level && m.message === message
		);
	}

	public assertHasMessage(level: LogLevel, message: string) {
		if (!this.hasMessage(level, message)) {
			throw new Error(
				`Expected message not found: ${LogLevel[level]} ${JSON.stringify(
					message
				)}. Actual messages: ${this._messages
					.map(m => '\n- ' + LogLevel[m.level] + ': ' + JSON.stringify(m.message))
					.join('')}`
			);
		}
	}

	/**
	 * Checks for a logged message matching a given regex. Emulates
	 * OutputChannelLog for conversion of log message to string.
	 */
	hasMessageMatching(level: LogLevel, test: RegExp) {
		return this._messages.some(m => m.level === level && test.test(m.message));
	}

	public isEmpty() {
		return this._messages.length === 0;
	}
}
