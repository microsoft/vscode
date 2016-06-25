/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {IMode, IState, IStream, ITokenizationResult, ITokenizationSupport} from 'vs/editor/common/modes';
import {AbstractState} from 'vs/editor/common/modes/abstractState';
import {TokenizationSupport} from 'vs/editor/common/modes/supports/tokenizationSupport';

export class MockMode implements IMode {
	private static instanceCount = 0;
	private _id:string;

	constructor(id?:string) {
		if (typeof id === 'undefined') {
			id = 'mockMode' + (++MockMode.instanceCount);
		}
		this._id = id;
	}

	public getId():string {
		return this._id;
	}

	public toSimplifiedMode(): IMode {
		return this;
	}
}

export class StateForMockTokenizingMode extends AbstractState {

	private _tokenType: string;

	constructor(mode:IMode, tokenType:string) {
		super(mode);
		this._tokenType = tokenType;
	}

	public makeClone():StateForMockTokenizingMode {
		return this;
	}

	public equals(other:IState):boolean {
		return true;
	}

	public tokenize(stream:IStream):ITokenizationResult {
		stream.advanceToEOS();
		return { type: this._tokenType };
	}
}

export class MockTokenizingMode extends MockMode {

	public tokenizationSupport: ITokenizationSupport;

	constructor(id:string, tokenType:string) {
		super(id);

		this.tokenizationSupport = new TokenizationSupport(this, {
			getInitialState: () => new StateForMockTokenizingMode(this, tokenType)
		}, false);
	}
}
