/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export interface IConfigurationVariable {
	/** ${name:arg} */
	id: string;
	/** The `name:arg` in ${name:arg} */
	inner: string;
	/** The `name` in ${name:arg} */
	name: string;
	/** The `arg` in ${name:arg} */
	arg?: string;
}

/** Parses a configuration variable at the given offset, including nested braces. */
export function parseConfigurationVariable(value: string, start: number): { replacement: IConfigurationVariable; end: number } | undefined {
	if (value[start] !== '$' || value[start + 1] !== '{') {
		return undefined;
	}

	let end = start + 2;
	let braceCount = 1;
	while (end < value.length) {
		if (value[end] === '{') {
			braceCount++;
		} else if (value[end] === '}') {
			braceCount--;
			if (braceCount === 0) {
				break;
			}
		}
		end++;
	}

	if (braceCount !== 0) {
		return undefined;
	}

	const id = value.slice(start, end + 1);
	const inner = value.substring(start + 2, end);
	const colon = inner.indexOf(':');
	return {
		replacement: colon === -1
			? { id, name: inner, inner }
			: { id, inner, name: inner.slice(0, colon), arg: inner.slice(colon + 1) },
		end
	};
}

export function hasConfigurationVariable(value: string): boolean {
	for (let offset = value.indexOf('${'); offset !== -1; offset = value.indexOf('${', offset + 2)) {
		if (parseConfigurationVariable(value, offset)) {
			return true;
		}
	}
	return false;
}
