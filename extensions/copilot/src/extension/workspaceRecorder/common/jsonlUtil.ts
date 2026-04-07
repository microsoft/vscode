/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export class JSONL {
	public static parse<T>(input: string): T[] {
		const result: T[] = [];
		const lines = input.split('\n');
		let i = 0;
		for (const line of lines) {
			i++;
			if (line.trim().length === 0) {
				continue;
			}
			result.push(JSON.parse(line));
		}
		return result;
	}

	public static toString(data: unknown[]): string {
		const lines: string[] = [];
		for (const item of data) {
			lines.push(JSON.stringify(item));
		}
		return lines.join('\n');
	}
}
