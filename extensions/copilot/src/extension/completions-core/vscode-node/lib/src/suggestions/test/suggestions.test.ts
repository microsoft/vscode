/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { Position } from 'vscode';
import { APIChoice } from '../../openai/openai';
import { createTextDocument } from '../../test/textDocument';
import { ILines, checkSuffix, maybeSnipCompletionImpl } from '../suggestions';

suite('checkSuffix', function () {
	function assertSuffix(completionText: string, lineSuffix: string, expected: number) {
		const doc = createTextDocument('file:///foo', 'typescript', 1, lineSuffix);
		const processed = checkSuffix(doc, { line: 0, character: 0 }, <APIChoice>{
			completionText,
		});
		assert.strictEqual(processed, expected);
	}

	test('consecutive', function () {
		assertSuffix('foo({});', '});', 3);
	});

	test('nonconsecutive', function () {
		assertSuffix('foo("bar", {});', '");', 3);
	});
});

suite('Test maybeSnipCompletionImpl', function () {
	test('Test maybeSnipCompletionImpl single closing bracket', function () {
		const lines = new StaticLines(`
class LicenseStore {
	public readonly filePath: string;
	public readonly fullLicenseText: { [key: string]: string[] };

	constructor(filePath: string, fullLicenseText: @
	}
}
		`);

		assert.deepStrictEqual(
			maybeSnipCompletionImpl(
				lines,
				lines.getPositionOfAt()!,
				`any) {
		this.filePath = filePath;
		this.fullLicenseText = fullLicenseText;
	}`,
				'}'
			),
			`any) {
		this.filePath = filePath;
		this.fullLicenseText = fullLicenseText;`
		);
	});

	test('Test maybeSnipCompletionImpl double closing bracket', function () {
		const lines = new StaticLines(`
class LicenseStore {
	public readonly filePath: string;
	public readonly fullLicenseText: { [key: string]: string[] };

	constructor(filePath: string, fullLicenseText: @
	}
}
		`);

		assert.deepStrictEqual(
			maybeSnipCompletionImpl(
				lines,
				lines.getPositionOfAt()!,
				`any) {
		this.filePath = filePath;
		this.fullLicenseText = fullLicenseText;
	}
}`,
				'}'
			),
			`any) {
		this.filePath = filePath;
		this.fullLicenseText = fullLicenseText;`
		);
	});

	test('Test maybeSnipCompletionImpl single closing bracket with semicolon', function () {
		const lines = new StaticLines(`
class LicenseStore {
	public readonly filePath: string;
	public readonly fullLicenseText: { [key: string]: string[] };

	constructor(filePath: string, fullLicenseText: @
	}
}
		`);

		assert.deepStrictEqual(
			maybeSnipCompletionImpl(
				lines,
				lines.getPositionOfAt()!,
				`any) {
		this.filePath = filePath;
		this.fullLicenseText = fullLicenseText;
	};`,
				'}'
			),
			`any) {
		this.filePath = filePath;
		this.fullLicenseText = fullLicenseText;`
		);
	});

	test('Test maybeSnipCompletionImpl: Only last line can just be a prefix of the model line', function () {
		const lines = new StaticLines(`
class LicenseStore {
	public readonly filePath: string;
	public readonly fullLicenseText: { [key: string]: string[] };

	constructor(filePath: string, fullLicenseText: @
	}1
}2
		`);

		assert.deepStrictEqual(
			maybeSnipCompletionImpl(
				lines,
				lines.getPositionOfAt()!,
				`any) {
		this.filePath = filePath;
		this.fullLicenseText = fullLicenseText;
	}
}`,
				'}'
			),
			`any) {
		this.filePath = filePath;
		this.fullLicenseText = fullLicenseText;
	}
}`
		);

		// Not restricted to the block close token
		const lines2 = new StaticLines(`
const list [
	@
];
		`);

		assert.deepStrictEqual(
			maybeSnipCompletionImpl(
				lines2,
				lines2.getPositionOfAt()!,
				`'one',
	'two',
	'three'
]`,
				'}'
			),
			`'one',
	'two',
	'three'`
		);
	});

	test('Test maybeSnipCompletionImpl: The last line can just be a prefix of the model line', function () {
		const lines = new StaticLines(`
class LicenseStore {
	public readonly filePath: string;
	public readonly fullLicenseText: { [key: string]: string[] };

	constructor(filePath: string, fullLicenseText: @
	}
}2
		`);

		assert.deepStrictEqual(
			maybeSnipCompletionImpl(
				lines,
				lines.getPositionOfAt()!,
				`any) {
		this.filePath = filePath;
		this.fullLicenseText = fullLicenseText;
	}
}`,
				'}'
			),
			`any) {
		this.filePath = filePath;
		this.fullLicenseText = fullLicenseText;`
		);
	});

	test('Test maybeSnipCompletionImpl: Empty Lines In Completion', function () {
		const lines = new StaticLines(`
class LicenseStore {
	public readonly filePath: string;
	public readonly fullLicenseText: { [key: string]: string[] };

	constructor(filePath: string, fullLicenseText: @

	}

}`);

		assert.deepStrictEqual(
			maybeSnipCompletionImpl(
				lines,
				lines.getPositionOfAt()!,
				`any) {
		this.filePath = filePath;
		this.fullLicenseText = fullLicenseText;
	}


}`,
				'}'
			),
			`any) {
		this.filePath = filePath;
		this.fullLicenseText = fullLicenseText;`
		);
	});
});

class StaticLines implements ILines {
	private readonly lines: string[];
	constructor(text: string) {
		this.lines = text.split(/\r\n|\n/g);
	}

	getLineText(lineIdx: number): string {
		return this.lines[lineIdx];
	}

	getLineCount(): number {
		return this.lines.length;
	}

	getPositionOfAt(): Position | undefined {
		for (let i = 0; i < this.lines.length; i++) {
			const idx = this.lines[i].indexOf('@');
			if (idx !== -1) {
				return new Position(i, idx);
			}
		}
	}
}
