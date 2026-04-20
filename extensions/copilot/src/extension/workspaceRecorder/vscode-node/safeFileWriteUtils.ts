/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { appendFileSync, renameSync, unlinkSync, writeFileSync } from 'fs';
import { appendFile, rename, stat, unlink, writeFile } from 'fs/promises';
import { readFileTextOrUndefined, tryParseJson } from '../../../util/node/jsonFile';
import { BugIndicatingError } from '../../../util/vs/base/common/errors';

export class FlushableJSONFile<T> {
	public static async loadOrCreate<T>(filePath: string, initialValue: T): Promise<FlushableJSONFile<T>> {
		let data: T = initialValue;

		const result = await readFileTextOrUndefined(filePath);
		if (result !== undefined) {
			const parsed = tryParseJson(result) as T | undefined;
			if (parsed !== undefined) {
				data = parsed;
			}
		}

		return new FlushableJSONFile(filePath, data, result !== undefined);
	}

	private _value: T;
	public get value(): Readonly<T> { return this._value; }

	private _dirty = false;


	private constructor(
		public readonly filePath: string,
		initialValue: T,
		private _exists = false,
	) {
		this._value = initialValue;
	}

	public setValue(value: T): void {
		this._value = value;
		this._dirty = true;
	}

	async flushAsync(): Promise<void> {
		if (!this._dirty) { return; }

		const jsonStr = JSON.stringify(this._value, null, 4);

		const tempFilePath = this.filePath + '.new';

		// TODO test what can go wrong here!
		await writeFile(tempFilePath, jsonStr, { encoding: 'utf8' });
		if (this._exists) {
			await unlink(this.filePath);
		}
		await rename(tempFilePath, this.filePath);
		this._exists = true;

		this._dirty = false;
	}

	flushSync(): void {
		if (!this._dirty) { return; }

		const json = JSON.stringify(this._value, null, 4);

		const tempFilePath = this.filePath + '.new';
		// TODO test what can go wrong here!
		writeFileSync(tempFilePath, json, { encoding: 'utf8' });
		if (this._exists) {
			unlinkSync(this.filePath);
		}
		renameSync(tempFilePath, this.filePath);
		this._exists = true;

		this._dirty = false;
	}
}

export class FlushableSafeJSONLFile<T> {
	private _lock = false;
	private readonly _newEntries: string[] = [];

	constructor(
		public readonly filePath: string
	) { }

	appendEntry(data: T): void {
		this._newEntries.push(JSON.stringify(data));
	}

	private _getTextAndClear(): string {
		const text = this._newEntries.map(l => '\n' + l).join('');
		this._newEntries.length = 0;
		return text;
	}

	async flushAsync(): Promise<void> {
		if (this._newEntries.length === 0) { return; }

		if (this._lock) { throw new BugIndicatingError('Locked!'); }
		this._lock = true;
		try {
			const text = this._getTextAndClear();
			if (text === '') { return; }

			await appendFile(this.filePath, text, { encoding: 'utf8' });
		} finally {
			this._lock = false;
		}
	}

	flushSync(): void {
		if (this._newEntries.length === 0) { return; }

		if (this._lock) { throw new BugIndicatingError('Locked!'); }

		const text = this._getTextAndClear();
		if (text === '') { return; }
		appendFileSync(this.filePath, text, { encoding: 'utf8' });
	}
}

export async function getFileSize(filePath: string): Promise<number | undefined> {
	try {
		const stats = await stat(filePath);
		return stats.size;
	} catch {
		return undefined;
	}
}
