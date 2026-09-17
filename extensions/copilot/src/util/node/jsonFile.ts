/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { readFile, writeFile } from 'fs/promises';
import { TaskQueue } from '../common/async';
import { deepClone } from '../vs/base/common/objects';

export class JSONFile<T> {
	public static async readOrCreate<T>(filePath: string, initialValue: T, indent: string | number = 4): Promise<JSONFile<T>> {
		let data: T = initialValue;

		const result = await readFileTextOrUndefined(filePath);
		if (result !== undefined) {
			const parsed = tryParseJson(result) as T | undefined;
			if (parsed !== undefined) {
				data = parsed;
			}
		}

		return new JSONFile(filePath, data, indent);
	}

	private _value: T;
	public get value(): Readonly<T> { return deepClone(this._value); }

	private constructor(
		public readonly filePath: string,
		initialValue: T,
		private readonly indent: string | number = 4,
	) {
		this._value = initialValue;
	}

	private readonly _writeQueue = new TaskQueue();

	async setValue(value: T): Promise<void> {
		this._value = value;
		this._writeQueue.clearPending();
		await this._writeQueue.scheduleSkipIfCleared(() => this._write());
	}

	private async _write(): Promise<void> {
		await writeFile(this.filePath, JSON.stringify(this._value, null, this.indent), { encoding: 'utf8' });
	}
}

export async function readFileTextOrUndefined(filePath: string): Promise<string | undefined> {
	try {
		return await readFile(filePath, 'utf8');
	}
	catch (e) {
		if (e.code === 'ENOENT') {
			return undefined;
		}
		throw e;
	}
}

export function tryParseJson(str: string): unknown | undefined {
	try {
		return JSON.parse(str);
	} catch (e) {
		if (e instanceof SyntaxError) {
			console.error(e);
			return undefined;
		}
		throw e;
	}
}
