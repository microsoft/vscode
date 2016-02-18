/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import assert = require('assert');
import {tokenizeToHtmlContent} from 'vs/editor/common/modes/textToHtmlTokenizer';
import {AbstractState} from 'vs/editor/common/modes/abstractState';
import modes = require('vs/editor/common/modes');
import {TokenizationSupport} from 'vs/editor/common/modes/supports/tokenizationSupport';

suite('Editor Modes - textToHtmlTokenizer', () => {
	test('TextToHtmlTokenizer', () => {
		var mode = new Mode();
		var result = tokenizeToHtmlContent('.abc..def...gh', mode);

		assert.ok(!!result);

		var children = result.children;
		assert.equal(children.length, 6);

		assert.equal(children[0].text, '.');
		assert.equal(children[0].className, 'token');
		assert.equal(children[0].tagName, 'span');

		assert.equal(children[1].text, 'abc');
		assert.equal(children[1].className, 'token text');
		assert.equal(children[1].tagName, 'span');

		assert.equal(children[2].text, '..');
		assert.equal(children[2].className, 'token');
		assert.equal(children[2].tagName, 'span');

		assert.equal(children[3].text, 'def');
		assert.equal(children[3].className, 'token text');
		assert.equal(children[3].tagName, 'span');

		assert.equal(children[4].text, '...');
		assert.equal(children[4].className, 'token');
		assert.equal(children[4].tagName, 'span');

		assert.equal(children[5].text, 'gh');
		assert.equal(children[5].className, 'token text');
		assert.equal(children[5].tagName, 'span');

		result = tokenizeToHtmlContent('.abc..def...gh\n.abc..def...gh', mode);

		assert.ok(!!result);

		children = result.children;
		assert.equal(children.length, 12 + 1 /* +1 for the line break */);

		assert.equal(children[6].tagName, 'br');
	});

});

class State extends AbstractState {

	constructor(mode:modes.IMode) {
		super(mode);
	}

	public makeClone() : AbstractState {
		return new State(this.getMode());
	}

	public tokenize(stream:modes.IStream):modes.ITokenizationResult {
		return { type: stream.next() === '.' ? '' : 'text' };
	}
}

class Mode implements modes.IMode {

	public tokenizationSupport: modes.ITokenizationSupport;

	constructor() {
		this.tokenizationSupport = new TokenizationSupport(this, {
			getInitialState: () => new State(this)
		}, false, false);
	}

	public getId(): string {
		return 'testMode';
	}

	public toSimplifiedMode(): modes.IMode {
		return this;
	}
}
