/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export type DebugLocation = DebugLocationImpl | undefined;

export namespace DebugLocation {
	let enabled = false;

	export function enable(): void {
		enabled = true;
	}

	export function ofCaller(): DebugLocation {
		if (!enabled) {
			return undefined;
		}
		// eslint-disable-next-line local/code-no-any-casts
		const Err = Error as any as { stackTraceLimit: number }; // For the monaco editor checks, which don't have the nodejs types.

		const l = Err.stackTraceLimit;
		Err.stackTraceLimit = 3;
		const stack = new Error().stack!;
		Err.stackTraceLimit = l;

		return DebugLocationImpl.fromStack(stack, 2);
	}
}

class DebugLocationImpl implements ILocation {
	public static fromStack(stack: string, parentIdx: number): DebugLocationImpl | undefined {
		const lines = stack.split('\n');
		const location = parseLine(lines[parentIdx + 1]);
		if (location) {
			return new DebugLocationImpl(
				location.fileName,
				location.line,
				location.column,
				location.id
			);
		} else {
			return undefined;
		}
	}

	constructor(
		public readonly fileName: string,
		public readonly line: number,
		public readonly column: number,
		public readonly id: string,
	) {
	}
}


export interface ILocation {
	fileName: string;
	line: number;
	column: number;
	id: string;
}

function parseLine(stackLine: string): ILocation | undefined {
	const match = stackLine.match(/\((.*):(\d+):(\d+)\)/);
	if (match) {
		return {
			fileName: match[1],
			line: parseInt(match[2]),
			column: parseInt(match[3]),
			id: stackLine,
		};
	}

	const match2 = stackLine.match(/at ([^\(\)]*):(\d+):(\d+)/);

	if (match2) {
		return {
			fileName: match2[1],
			line: parseInt(match2[2]),
			column: parseInt(match2[3]),
			id: stackLine,
		};
	}

	return undefined;
}
