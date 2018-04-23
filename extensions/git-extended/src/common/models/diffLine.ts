/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export enum DiffChangeType {
	None,
	Add,
	Delete,
	Control
}

export class DiffLine {
	// Was the line added, deleted or unchanged.
	type: DiffChangeType;

	// Gets the old 1-based line number.
	oldLineNumber: number = -1;

	// Gets the new 1-based line number.
	newLineNumber: number = -1;

	// Gets the unified diff line number where the first chunk header is line 0.
	diffLineNumber: number = -1;

	// Gets the content of the diff line (including +, - or space).
	content: String;

	constructor(type: DiffChangeType, oldLineNumber: number, newLineNumber: number, diffLineNumber: number, content: string) {
		this.type = type;
		this.oldLineNumber = oldLineNumber;
		this.newLineNumber = newLineNumber;
		this.diffLineNumber = diffLineNumber;
		this.content = content;
	}
}

export function getDiffChangeType(text: string) {
	let c = text[0];
	switch (c) {
		case ' ': return DiffChangeType.None;
		case '+': return DiffChangeType.Add;
		case '-': return DiffChangeType.Delete;
		case '\\': return DiffChangeType.Control;
	}
}