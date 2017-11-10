/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as readline from 'readline';
import { TPromise } from 'vs/base/common/winjs.base';
import { IChoiceService, Severity } from 'vs/platform/message/common/message';

export class ChoiceCliService implements IChoiceService {

	_serviceBrand: any;

	choose(severity: Severity, message: string, options: string[], cancelId: number): TPromise<number> {
		const promise = new TPromise<number>((c, e) => {
			const rl = readline.createInterface({
				input: process.stdin,
				output: process.stdout,
				terminal: true
			});
			rl.prompt();
			rl.write(this.toQuestion(message, options));

			rl.prompt();

			rl.once('line', (answer) => {
				rl.close();
				c(this.toOption(answer, options));
			});
			rl.once('SIGINT', () => {
				rl.close();
				promise.cancel();
			});
		});
		return promise;
	}

	private toQuestion(message: string, options: string[]): string {
		return options.reduce((previousValue: string, currentValue: string, currentIndex: number) => {
			return previousValue + currentValue + '(' + currentIndex + ')' + (currentIndex < options.length - 1 ? ' | ' : '\n');
		}, message + ' ');
	}

	private toOption(answer: string, options: string[]): number {
		const value = parseInt(answer);
		if (!isNaN(value)) {
			return value;
		}
		answer = answer.toLocaleLowerCase();
		for (let i = 0; i < options.length; i++) {
			if (options[i].toLocaleLowerCase() === answer) {
				return i;
			}
		}
		return -1;
	}
}