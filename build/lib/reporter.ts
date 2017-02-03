/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as es from 'event-stream';
import * as _ from 'underscore';
import * as util from 'gulp-util';

const allErrors: Error[][] = [];
let startTime: number = null;
let count = 0;

function onStart(): void {
	if (count++ > 0) {
		return;
	}

	startTime = new Date().getTime();
	util.log(`Starting ${util.colors.green('compilation')}...`);
}

function onEnd(): void {
	if (--count > 0) {
		return;
	}

	log();
}

function log(): void {
	const errors = _.flatten(allErrors);
	errors.map(err => util.log(`${util.colors.red('Error')}: ${err}`));

	util.log(`Finished ${util.colors.green('compilation')} with ${errors.length} errors after ${util.colors.magenta((new Date().getTime() - startTime) + ' ms')}`);
}

export interface IReporter {
	(err: Error): void;
	hasErrors(): boolean;
	end(emitError: boolean): NodeJS.ReadWriteStream;
}

export function createReporter(): IReporter {
	const errors: Error[] = [];
	allErrors.push(errors);

	class ReportFunc {
		constructor(err: Error) {
			errors.push(err);
		}

		static hasErrors(): boolean {
			return errors.length > 0;
		}

		static end(emitError: boolean): NodeJS.ReadWriteStream {
			errors.length = 0;
			onStart();

			return es.through(null, function () {
				onEnd();

				if (emitError && errors.length > 0) {
					log();
					this.emit('error');
				} else {
					this.emit('end');
				}
			});
		}
	}

	return <IReporter><any>ReportFunc;
};
