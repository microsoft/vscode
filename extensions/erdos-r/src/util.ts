/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023-2025 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import { LOGGER } from './extension';
import { randomUUID } from 'crypto';

export class PromiseHandles<T> {
	resolve!: (value: T | Promise<T>) => void;
	reject!: (error: unknown) => void;
	settled: boolean;
	promise: Promise<T>;

	constructor() {
		this.settled = false;
		this.promise = new Promise((resolve, reject) => {
			this.resolve = (val) => {
				this.settled = true;
				resolve(val);
			};
			this.reject = (err) => {
				this.settled = true;
				reject(err);
			};
		});
	}
}

export function delay(ms: number) {
	return new Promise(resolve => setTimeout(resolve, ms));
}

export async function whenTimeout<T>(ms: number, fn: () => T): Promise<T> {
	await delay(ms);
	return fn();
}

export function timeout(ms: number, reason: string) {
	return new Promise((_, reject) => {
		setTimeout(() => reject(`Timeout while ${reason}`), ms);
	});
}

export function readLines(pth: string): Array<string> {
	try {
		const bigString = fs.readFileSync(pth, 'utf8');
		return bigString.split(/\r?\n/);
	} catch (error) {
		LOGGER.error(`Error reading file: "${error}"`);
		return [];
	}
}

export function extractValue(str: string, key: string, delim: string = '='): string {
	const re = `${key}${delim}(.*)`;
	if (!str.startsWith(key)) {
		return '';
	}
	const m = str.match(re);
	return m?.[1] ?? '';
}

export function removeLeadingLines(x: string, pattern: RegExp): string {
	const lines = x.split('\n');
	let output = lines;

	for (const line of lines) {
		if (pattern.test(line)) {
			output = output.slice(1);
			continue;
		}
		break;
	}

	return output.join('\n');
}

export function removeSurroundingQuotes(x: string): string {
	const hasQuotes =
		(x.startsWith('"') && x.endsWith('"')) ||
		(x.startsWith('\'') && x.endsWith('\''));

	if (hasQuotes) {
		x = x.slice(1, x.length - 1);
	}

	return x;
}

export function generateDirectInjectionId(): string {
	return `direct-injection-${randomUUID()}`;
}