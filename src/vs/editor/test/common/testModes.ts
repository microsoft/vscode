/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as modes from 'vs/editor/common/modes';
import {AbstractState} from 'vs/editor/common/modes/abstractState';
import {RichEditSupport} from 'vs/editor/common/modes/supports/richEditSupport';
import {TokenizationSupport} from 'vs/editor/common/modes/supports/tokenizationSupport';
import {MockMode} from 'vs/editor/test/common/mocks/mockMode';

export class CommentState extends AbstractState {

	constructor(mode:modes.IMode, stateCount:number) {
		super(mode);
	}

	public makeClone():CommentState {
		return this;
	}

	public equals(other:modes.IState):boolean {
		return true;
	}

	public tokenize(stream:modes.IStream):modes.ITokenizationResult {
		stream.advanceToEOS();
		return { type: 'state' };
	}
}

export class CommentMode extends MockMode {

	public tokenizationSupport: modes.ITokenizationSupport;
	public richEditSupport: modes.IRichEditSupport;

	constructor(commentsConfig:modes.ICommentsConfiguration) {
		super();
		this.tokenizationSupport = new TokenizationSupport(this, {
			getInitialState: () => new CommentState(this, 0)
		}, false, false);

		this.richEditSupport = {
			comments:commentsConfig
		};
	}
}

export abstract class AbstractIndentingMode extends MockMode {

	public getElectricCharacters():string[] {
		return null;
	}

	public onElectricCharacter(context:modes.ILineContext, offset:number):modes.IElectricAction {
		return null;
	}

	public onEnter(context:modes.ILineContext, offset:number):modes.IEnterAction {
		return null;
	}

}

export class ModelState1 extends AbstractState {

	constructor(mode:modes.IMode) {
		super(mode);
	}

	public makeClone():ModelState1 {
		return this;
	}

	public equals(other: modes.IState):boolean {
		return this === other;
	}

	public tokenize(stream:modes.IStream):modes.ITokenizationResult {
		(<ModelMode1>this.getMode()).calledFor.push(stream.next());
		stream.advanceToEOS();
		return { type: '' };
	}
}

export class ModelMode1 extends MockMode {
	public calledFor:string[];

	public tokenizationSupport: modes.ITokenizationSupport;

	constructor() {
		super();
		this.calledFor = [];
		this.tokenizationSupport = new TokenizationSupport(this, {
			getInitialState: () => new ModelState1(this)
		}, false, false);
	}
}

export class ModelState2 extends AbstractState {

	private prevLineContent:string;

	constructor(mode:ModelMode2, prevLineContent:string) {
		super(mode);
		this.prevLineContent = prevLineContent;
	}

	public makeClone():ModelState2 {
		return new ModelState2(<ModelMode2>this.getMode(), this.prevLineContent);
	}

	public equals(other: modes.IState):boolean {
		return (other instanceof ModelState2) && (this.prevLineContent === (<ModelState2>other).prevLineContent);
	}

	public tokenize(stream:modes.IStream):modes.ITokenizationResult {
		var line= '';
		while (!stream.eos()) {
			line+= stream.next();
		}
		this.prevLineContent= line;
		return { type: '' };
	}
}

export class ModelMode2 extends MockMode {
	public calledFor:any[];

	public tokenizationSupport: modes.ITokenizationSupport;

	constructor() {
		super();
		this.calledFor = null;
		this.tokenizationSupport = new TokenizationSupport(this, {
			getInitialState: () => new ModelState2(this, '')
		}, false, false);
	}
}

export class BracketMode extends MockMode {

	public richEditSupport: modes.IRichEditSupport;

	constructor() {
		super();
		this.richEditSupport = new RichEditSupport(this.getId(), null, {
			brackets: [
				['{', '}'],
				['[', ']'],
				['(', ')'],
			]
		});
	}
}

export class NState extends AbstractState {

	private n:number;
	private allResults:modes.ITokenizationResult[];

	constructor(mode:modes.IMode, n:number) {
		super(mode);
		this.n = n;
		this.allResults = null;
	}


	public makeClone():NState {
		return this;
	}

	public equals(other: modes.IState):boolean {
		return true;
	}

	public tokenize(stream:modes.IStream):modes.ITokenizationResult {
		var ndash = this.n, value = '';
		while(!stream.eos() && ndash > 0) {
			value += stream.next();
			ndash--;
		}
		return { type: 'n-' + (this.n - ndash) + '-' + value };
	}
}

export class NMode extends MockMode {

	private n:number;

	public tokenizationSupport: modes.ITokenizationSupport;

	constructor(n:number) {
		super();
		this.n = n;
		this.tokenizationSupport = new TokenizationSupport(this, {
			getInitialState: () => new NState(this, this.n)
		}, false, false);
	}
}