/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
/* In order to use VSXML in your own modes, you need to have an IState
 * which implements IVSXMLWrapperState. Upon a START token such as '///',
 * the wrapper state can return a new VSXMLEmbeddedState as the nextState in
 * the tokenization result.
*/


'use strict';

import objects = require('vs/base/common/objects');
import Modes = require('vs/editor/common/modes');
import {AbstractState} from 'vs/editor/common/modes/abstractState';
import vsxmlTokenTypes = require('vs/languages/razor/common/vsxmlTokenTypes');

var separators = '<>"=/';
var whitespace = '\t ';
var isEntity = objects.createKeywordMatcher(['summary', 'reference', 'returns', 'param', 'loc']);
var isAttribute = objects.createKeywordMatcher(['type', 'path', 'name', 'locid', 'filename', 'format', 'optional']);
var isSeparator = objects.createKeywordMatcher(separators.split(''));

export interface IVSXMLWrapperState extends Modes.IState {
	setVSXMLState(newVSXMLState:VSXMLState):void;
}

export class EmbeddedState extends AbstractState {

	private state:Modes.IState;
	private parentState:Modes.IState;

	constructor(modeId:string, state:Modes.IState, parentState:Modes.IState) {
		super(modeId);
		this.state = state;
		this.parentState = parentState;
	}

	public getParentState():Modes.IState {
		return this.parentState;
	}

	public makeClone(): EmbeddedState {
		return new EmbeddedState(this.getModeId(), AbstractState.safeClone(this.state), AbstractState.safeClone(this.parentState));
	}

	public equals(other:Modes.IState):boolean {
		if (other instanceof EmbeddedState) {
			return (
				super.equals(other) &&
				AbstractState.safeEquals(this.state, other.state) &&
				AbstractState.safeEquals(this.parentState, other.parentState)
			);
		}
		return false;
	}

	public setState(nextState:Modes.IState):void {
		this.state = nextState;
	}

	public postTokenize(result:Modes.ITokenizationResult, stream:Modes.IStream) : Modes.ITokenizationResult {
		return result;
	}

	public tokenize(stream:Modes.IStream) : Modes.ITokenizationResult {
		var result = this.state.tokenize(stream);
		if (result.nextState !== undefined) {
			this.setState(result.nextState);
		}
		result.nextState = this;
		return this.postTokenize(result, stream);
	}
}

export class VSXMLEmbeddedState extends EmbeddedState {

	constructor(modeId:string, state:Modes.IState, parentState:IVSXMLWrapperState) {
		super(modeId, state, parentState);
	}

	public equals(other:Modes.IState):boolean {
		if (other instanceof VSXMLEmbeddedState) {
			return (
				super.equals(other)
			);
		}
		return false;
	}

	public setState(nextState:Modes.IState):void{
		super.setState(nextState);
		(<IVSXMLWrapperState> this.getParentState()).setVSXMLState(<VSXMLState>nextState);
	}

	public postTokenize(result:Modes.ITokenizationResult, stream:Modes.IStream):Modes.ITokenizationResult {
		if (stream.eos()) {
			result.nextState = this.getParentState();
		}
		return result;
	}
}

export abstract class VSXMLState extends AbstractState {

	public parent:Modes.IState;
	public whitespaceTokenType:string;
	private name:string;

	constructor(modeId:string, name:string, parent:Modes.IState, whitespaceTokenType:string='') {
		super(modeId);
		this.name = name;
		this.parent = parent;
		this.whitespaceTokenType = whitespaceTokenType;
	}

	public equals(other:Modes.IState):boolean {
		if (other instanceof VSXMLState) {
			return (
				super.equals(other) &&
				this.whitespaceTokenType === other.whitespaceTokenType &&
				this.name === other.name &&
				AbstractState.safeEquals(this.parent, other.parent)
			);
		}
		return false;
	}

	public tokenize(stream:Modes.IStream):Modes.ITokenizationResult {
		stream.setTokenRules(separators, whitespace);
		if (stream.skipWhitespace().length > 0) {
			return { type: this.whitespaceTokenType };
		}
		return this.stateTokenize(stream);
	}

	public abstract stateTokenize(stream:Modes.IStream):Modes.ITokenizationResult;
}

export class VSXMLString extends VSXMLState {

	constructor(modeId:string, parent:Modes.IState) {
		super(modeId, 'string', parent, vsxmlTokenTypes.TOKEN_VALUE);
	}

	public makeClone():VSXMLString {
		return new VSXMLString(this.getModeId(), this.parent ? this.parent.clone() : null);
	}

	public equals(other:Modes.IState):boolean {
		if (other instanceof VSXMLString) {
			return (
				super.equals(other)
			);
		}
		return false;
	}

	public stateTokenize(stream:Modes.IStream):Modes.ITokenizationResult {
		while (!stream.eos()) {
			var token = stream.nextToken();
			if (token === '"') {
				return { type: vsxmlTokenTypes.TOKEN_VALUE, nextState: this.parent };
			}
		}
		return { type: vsxmlTokenTypes.TOKEN_VALUE, nextState: this.parent };
	}
}

export class VSXMLTag extends VSXMLState {

	constructor(modeId:string, parent:Modes.IState) {
		super(modeId, 'expression', parent, 'vs');
	}

	public makeClone():VSXMLTag {
		return new VSXMLTag(this.getModeId(), this.parent ? this.parent.clone() : null);
	}

	public equals(other:Modes.IState):boolean {
		if (other instanceof VSXMLTag) {
			return (
				super.equals(other)
			);
		}
		return false;
	}

	public stateTokenize(stream:Modes.IStream):Modes.ITokenizationResult {
		var token = stream.nextToken();
		var tokenType = this.whitespaceTokenType;
		if (token === '>') {
			return { type: 'punctuation.vs', nextState: this.parent };
		} else if (token === '"') {
			return { type: vsxmlTokenTypes.TOKEN_VALUE, nextState: new VSXMLString(this.getModeId(), this) };
		} else if (isEntity(token)) {
			tokenType = 'tag.vs';
		} else if (isAttribute(token)) {
			tokenType = vsxmlTokenTypes.TOKEN_KEY;
		} else if (isSeparator(token)) {
			tokenType = 'punctuation.vs';
		}
		return { type:tokenType, nextState: this };
	}
}

export class VSXMLExpression extends VSXMLState {

	constructor(modeId:string, parent:Modes.IState) {
		super(modeId, 'expression', parent, 'vs');
	}

	public makeClone():VSXMLExpression {
		return new VSXMLExpression(this.getModeId(), this.parent ? this.parent.clone() : null);
	}

	public equals(other:Modes.IState):boolean {
		if (other instanceof VSXMLExpression) {
			return (
				super.equals(other)
			);
		}
		return false;
	}

	public stateTokenize(stream:Modes.IStream):Modes.ITokenizationResult {
		var token = stream.nextToken();
		if (token === '<') {
			return { type: 'punctuation.vs', nextState: new VSXMLTag(this.getModeId(), this) };
		}
		return { type: this.whitespaceTokenType, nextState: this};
	}
}
