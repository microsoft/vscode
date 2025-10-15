/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import es from 'event-stream';
import fancyLog from 'fancy-log';
import ansiColors from 'ansi-colors';
import fs from 'fs';
import path from 'path';

class ErrorLog {
	constructor(public id: string) {
	}
	allErrors: string[][] = [];
	startTime: number | null = null;
	count = 0;

	onStart(): void {
		if (this.count++ > 0) {
			return;
		}

		this.startTime = new Date().getTime();
		fancyLog(`Starting ${ansiColors.green('compilation')}${this.id ? ansiColors.blue(` ${this.id}`) : ''}...`);
	}

	onEnd(): void {
		if (--this.count > 0) {
			return;
		}

		this.log();
	}

	log(): void {
		const errors = this.allErrors.flat();
		const seen = new Set<string>();

		errors.map(err => {
			if (!seen.has(err)) {
				seen.add(err);
				fancyLog(`${ansiColors.red('Error')}: ${err}`);
			}
		});

		fancyLog(`Finished ${ansiColors.green('compilation')}${this.id ? ansiColors.blue(` ${this.id}`) : ''} with ${errors.length} errors after ${ansiColors.magenta((new Date().getTime() - this.startTime!) + ' ms')}`);

		const regex = /^([^(]+)\((\d+),(\d+)\): (.*)$/s;
		const messages = errors
			.map(err => regex.exec(err))
			.filter(match => !!match)
			.map(x => x as string[])
			.map(([, path, line, column, message]) => ({ path, line: parseInt(line), column: parseInt(column), message }));

		try {
			const logFileName = 'log' + (this.id ? `_${this.id}` : '');
			fs.writeFileSync(path.join(buildLogFolder, logFileName), JSON.stringify(messages));
		} catch (err) {
			//noop
		}
	}

}

const errorLogsById = new Map<string, ErrorLog>();
function getErrorLog(id: string = '') {
	let errorLog = errorLogsById.get(id);
	if (!errorLog) {
		errorLog = new ErrorLog(id);
		errorLogsById.set(id, errorLog);
	}
	return errorLog;
}

const buildLogFolder = path.join(path.dirname(path.dirname(__dirname)), '.build');

try {
	fs.mkdirSync(buildLogFolder);
} catch (err) {
	// ignore
}

export interface IReporter {
	(err: string): void;
	hasErrors(): boolean;
	end(emitError: boolean): NodeJS.ReadWriteStream;
}

class ReporterError extends Error {
	__reporter__ = true;
}

interface Errors extends Array<string> {
	__logged__?: boolean;
}

export function createReporter(id?: string): IReporter {
	const errorLog = getErrorLog(id);

	const errors: Errors = [];
	errorLog.allErrors.push(errors);

	const result = (err: string) => errors.push(err);

	result.hasErrors = () => errors.length > 0;

	result.end = (emitError: boolean): NodeJS.ReadWriteStream => {
		errors.length = 0;
		errorLog.onStart();

		return es.through(undefined, function () {
			errorLog.onEnd();

			if (emitError && errors.length > 0) {
				if (!errors.__logged__) {
					errorLog.log();
				}

				errors.__logged__ = true;

				const err = new ReporterError(`Found ${errors.length} errors`);
				this.emit('error', err);
			} else {
				this.emit('end');
			}
		});
	};

	return result;
}
