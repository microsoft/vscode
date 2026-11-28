/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { describe, it } from 'node:test';

// The preview sources use extensionless imports for their webview bundle.
const hooks = registerHooks({
	resolve(specifier, context, nextResolve) {
		if (specifier.startsWith('.') && !/\.[a-z]+$/i.test(specifier)) {
			return nextResolve(`${specifier}.ts`, context);
		}
		return nextResolve(specifier, context);
	},
});
const { getLineElementForFragment } = await import('../preview-src/scroll-sync.ts');
hooks.deregister();

class TestElement {
	readonly tagName = 'H2';
	readonly parentElement = null;
	constructor(readonly id: string, readonly line: number) { }
	getAttribute(name: string): string | null {
		return name === 'data-line' ? String(this.line) : null;
	}
}

let documentVersion = 0;
function setHeadings(...headings: TestElement[]): number {
	Object.assign(globalThis, {
		HTMLElement: TestElement,
		document: {
			body: new TestElement('', -1),
			getElementsByClassName: (name: string) => name === 'code-line' ? headings : [],
		},
	});
	return ++documentVersion;
}

describe('preview fragment navigation', () => {
	it('finds a Unicode heading when the incoming fragment is encoded', () => {
		const heading = new TestElement('目标标题', 42);
		const version = setHeadings(heading);
		assert.strictEqual(getLineElementForFragment(encodeURIComponent('目标标题'), version)?.element, heading);
	});

	it('keeps exact encoded IDs preferred when both forms exist', () => {
		const encoded = new TestElement('%E7%9B%AE', 1);
		const decoded = new TestElement('目', 2);
		const version = setHeadings(decoded, encoded);
		assert.strictEqual(getLineElementForFragment('%E7%9B%AE', version)?.element, encoded);
	});

	it('preserves ASCII, absent and malformed fragment behavior', () => {
		const heading = new TestElement('target-1', 9);
		const unicode = new TestElement('目标标题-1', 10);
		const literalPercent = new TestElement('%E7%broken', 11);
		const version = setHeadings(heading, unicode, literalPercent);
		assert.strictEqual(getLineElementForFragment('target-1', version)?.element, heading);
		assert.strictEqual(getLineElementForFragment('目标标题-1', version)?.element, unicode);
		assert.strictEqual(getLineElementForFragment(encodeURIComponent('目标标题-1'), version)?.element, unicode);
		assert.strictEqual(getLineElementForFragment('missing', version), undefined);
		assert.strictEqual(getLineElementForFragment('%E7%broken', version)?.element, literalPercent);
		assert.strictEqual(getLineElementForFragment('%E8%invalid', version), undefined);
	});
});
