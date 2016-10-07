/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {IDisposable} from 'vs/base/common/lifecycle';
import * as modes from 'vs/editor/common/modes';
import {LineStream} from 'vs/editor/common/modes/lineStream';
import {NullState, nullTokenize, NULL_MODE_ID} from 'vs/editor/common/modes/nullMode';
import {Token} from 'vs/editor/common/core/token';
import {ModeTransition} from 'vs/editor/common/core/modeTransition';
import {IModeService} from 'vs/editor/common/services/modeService';
import {AbstractState, ITokenizationResult} from 'vs/editor/common/modes/abstractState';

export interface ILeavingNestedModeData {
	/**
	 * The part of the line that will be tokenized by the nested mode
	 */
	nestedModeBuffer: string;

	/**
	 * The part of the line that will be tokenized by the parent mode when it continues after the nested mode
	 */
	bufferAfterNestedMode: string;

	/**
	 * The state that will be used for continuing tokenization by the parent mode after the nested mode
	 */
	stateAfterNestedMode: AbstractState;
}

export interface IModeLocator {
	getMode(mimetypeOrModeId: string): modes.IMode;
}

export interface ITokenizationCustomization {

	getInitialState():AbstractState;

	enterNestedMode?: (state:AbstractState) => boolean;

	getNestedMode?: (state:AbstractState, locator:IModeLocator) => modes.IMode;

	/**
	 * Return null if the line does not leave the nested mode
	 */
	getLeavingNestedModeData?: (line:string, state:modes.IState) => ILeavingNestedModeData;
}

function isFunction(something) {
	return typeof something === 'function';
}

export class TokenizationSupport implements modes.ITokenizationSupport, IDisposable {

	static MAX_EMBEDDED_LEVELS = 5;

	private customization:ITokenizationCustomization;
	private defaults: {
		enterNestedMode: boolean;
		getNestedMode: boolean;
		getLeavingNestedModeData: boolean;
	};

	private supportsNestedModes:boolean;

	private _modeService:IModeService;
	private _modeId:string;
	private _embeddedModes: {[modeId:string]:boolean;};
	private _tokenizationRegistryListener: IDisposable;

	constructor(modeService:IModeService, modeId:string, customization:ITokenizationCustomization, supportsNestedModes:boolean) {
		this._modeService = modeService;
		this._modeId = modeId;
		this.customization = customization;
		this.supportsNestedModes = supportsNestedModes;
		this.defaults = {
			enterNestedMode: !isFunction(customization.enterNestedMode),
			getNestedMode: !isFunction(customization.getNestedMode),
			getLeavingNestedModeData: !isFunction(customization.getLeavingNestedModeData),
		};

		this._embeddedModes = Object.create(null);

		// Set up listening for embedded modes
		let emitting = false;
		this._tokenizationRegistryListener = modes.TokenizationRegistry.onDidChange((e) => {
			if (emitting) {
				return;
			}
			let isOneOfMyEmbeddedModes = this._embeddedModes[e.languageId];
			if (isOneOfMyEmbeddedModes) {
				emitting = true;
				modes.TokenizationRegistry.fire(this._modeId);
				emitting = false;
			}
		});
	}

	public dispose(): void {
		this._tokenizationRegistryListener.dispose();
	}

	public getInitialState(): modes.IState {
		return this.customization.getInitialState();
	}

	public tokenize(line:string, state:modes.IState, deltaOffset:number = 0, stopAtOffset:number = deltaOffset + line.length):modes.ILineTokens {
		if (state.getModeId() !== this._modeId) {
			return this._nestedTokenize(line, state, deltaOffset, stopAtOffset, [], []);
		} else {
			return this._myTokenize(line, <AbstractState>state, deltaOffset, stopAtOffset, [], []);
		}
	}

	/**
	 * Precondition is: nestedModeState.getModeId() !== this._modeId
	 * This means we are in a nested mode when parsing starts on this line.
	 */
	private _nestedTokenize(buffer:string, nestedModeState:modes.IState, deltaOffset:number, stopAtOffset:number, prependTokens:Token[], prependModeTransitions:ModeTransition[]):modes.ILineTokens {
		let myStateBeforeNestedMode = nestedModeState.getStateData();
		let leavingNestedModeData = this._getLeavingNestedModeData(buffer, myStateBeforeNestedMode);

		// Be sure to give every embedded mode the
		// opportunity to leave nested mode.
		// i.e. Don't go straight to the most nested mode
		let stepOnceNestedState = nestedModeState;
		while (stepOnceNestedState.getStateData() && stepOnceNestedState.getStateData().getModeId() !== this._modeId) {
			stepOnceNestedState = stepOnceNestedState.getStateData();
		}
		let nestedModeId = stepOnceNestedState.getModeId();

		if (!leavingNestedModeData) {
			// tokenization will not leave nested mode
			let result:modes.ILineTokens;
			let tokenizationSupport = modes.TokenizationRegistry.get(nestedModeId);
			if (tokenizationSupport) {
				result = tokenizationSupport.tokenize(buffer, nestedModeState, deltaOffset, stopAtOffset);
			} else {
				// The nested mode doesn't have tokenization support,
				// unfortunatelly this means we have to fake it
				result = nullTokenize(nestedModeId, buffer, nestedModeState, deltaOffset);
			}
			result.tokens = prependTokens.concat(result.tokens);
			result.modeTransitions = prependModeTransitions.concat(result.modeTransitions);
			return result;
		}

		let nestedModeBuffer = leavingNestedModeData.nestedModeBuffer;
		if (nestedModeBuffer.length > 0) {
			// Tokenize with the nested mode
			let nestedModeLineTokens:modes.ILineTokens;
			let tokenizationSupport = modes.TokenizationRegistry.get(nestedModeId);
			if (tokenizationSupport) {
				nestedModeLineTokens = tokenizationSupport.tokenize(nestedModeBuffer, nestedModeState, deltaOffset, stopAtOffset);
			} else {
				// The nested mode doesn't have tokenization support,
				// unfortunatelly this means we have to fake it
				nestedModeLineTokens = nullTokenize(nestedModeId, nestedModeBuffer, nestedModeState, deltaOffset);
			}

			// Save last state of nested mode
			nestedModeState = nestedModeLineTokens.endState;

			// Prepend nested mode's result to our result
			prependTokens = prependTokens.concat(nestedModeLineTokens.tokens);
			prependModeTransitions = prependModeTransitions.concat(nestedModeLineTokens.modeTransitions);
		}

		let bufferAfterNestedMode = leavingNestedModeData.bufferAfterNestedMode;
		let myStateAfterNestedMode = leavingNestedModeData.stateAfterNestedMode;
		myStateAfterNestedMode.setStateData(myStateBeforeNestedMode.getStateData());

		return this._myTokenize(bufferAfterNestedMode, myStateAfterNestedMode, deltaOffset + nestedModeBuffer.length, stopAtOffset, prependTokens, prependModeTransitions);
	}

	/**
	 * Precondition is: state.getMode() === this
	 * This means we are in the current mode when parsing starts on this line.
	 */
	private _myTokenize(buffer:string, myState:AbstractState, deltaOffset:number, stopAtOffset:number, prependTokens:Token[], prependModeTransitions:ModeTransition[]):modes.ILineTokens {
		let lineStream = new LineStream(buffer);
		let tokenResult:ITokenizationResult, beforeTokenizeStreamPos:number;
		let previousType:string = null;

		myState = myState.clone();
		if (prependModeTransitions.length <= 0 || prependModeTransitions[prependModeTransitions.length-1].modeId !== this._modeId) {
			// Avoid transitioning to the same mode (this can happen in case of empty embedded modes)
			prependModeTransitions.push(new ModeTransition(deltaOffset,this._modeId));
		}

		let maxPos = Math.min(stopAtOffset - deltaOffset, buffer.length);
		while (lineStream.pos() < maxPos) {
			beforeTokenizeStreamPos = lineStream.pos();

			do {
				tokenResult = myState.tokenize(lineStream);
				if (tokenResult === null || tokenResult === undefined ||
					((tokenResult.type === undefined || tokenResult.type === null) &&
					(tokenResult.nextState === undefined || tokenResult.nextState === null))) {
					throw new Error('Tokenizer must return a valid state');
				}

				if (tokenResult.nextState) {
					tokenResult.nextState.setStateData(myState.getStateData());
					myState = tokenResult.nextState;
				}
				if (lineStream.pos() <= beforeTokenizeStreamPos) {
					throw new Error('Stream did not advance while tokenizing. Mode id is ' + this._modeId + ' (stuck at token type: "' + tokenResult.type + '", prepend tokens: "' + (prependTokens.map(t => t.type).join(',')) + '").');
				}
			} while (!tokenResult.type && tokenResult.type !== '');

			if (previousType !== tokenResult.type || tokenResult.dontMergeWithPrev || previousType === null) {
				prependTokens.push(new Token(beforeTokenizeStreamPos + deltaOffset, tokenResult.type));
			}

			previousType = tokenResult.type;

			if (this.supportsNestedModes && this._enterNestedMode(myState)) {
				let currentEmbeddedLevels = this._getEmbeddedLevel(myState);
				if (currentEmbeddedLevels < TokenizationSupport.MAX_EMBEDDED_LEVELS) {
					let nestedModeState = this._getNestedModeInitialState(myState);

					if (!lineStream.eos()) {
						// There is content from the embedded mode
						let restOfBuffer = buffer.substr(lineStream.pos());
						let result = this._nestedTokenize(restOfBuffer, nestedModeState, deltaOffset + lineStream.pos(), stopAtOffset, prependTokens, prependModeTransitions);
						return result;
					} else {
						// Transition to the nested mode state
						return {
							tokens: prependTokens,
							actualStopOffset: lineStream.pos() + deltaOffset,
							modeTransitions: prependModeTransitions,
							endState: nestedModeState
						};
					}
				}
			}
		}

		return {
			tokens: prependTokens,
			actualStopOffset: lineStream.pos() + deltaOffset,
			modeTransitions: prependModeTransitions,
			endState: myState
		};
	}

	private _getEmbeddedLevel(state:modes.IState): number {
		let result = -1;
		while(state) {
			result++;
			state = state.getStateData();
		}
		return result;
	}

	private _enterNestedMode(state:AbstractState): boolean {
		if (this.defaults.enterNestedMode) {
			return false;
		}
		return this.customization.enterNestedMode(state);

	}

	private _getNestedMode(state:AbstractState): modes.IMode {
		if (this.defaults.getNestedMode) {
			return null;
		}

		let locator:IModeLocator = {
			getMode: (mimetypeOrModeId: string): modes.IMode => {
				if (!mimetypeOrModeId || !this._modeService.isRegisteredMode(mimetypeOrModeId)) {
					return null;
				}

				let modeId = this._modeService.getModeId(mimetypeOrModeId);

				let mode = this._modeService.getMode(modeId);
				if (mode) {
					// Re-emit tokenizationSupport change events from all modes that I ever embedded
					this._embeddedModes[modeId] = true;
					return mode;
				}

				// Fire mode loading event
				this._modeService.getOrCreateMode(modeId);

				this._embeddedModes[modeId] = true;

				return null;
			}
		};

		return this.customization.getNestedMode(state, locator);
	}

	private _getNestedModeInitialState(state:AbstractState): modes.IState {
		let nestedMode = this._getNestedMode(state);
		if (nestedMode) {
			let tokenizationSupport = modes.TokenizationRegistry.get(nestedMode.getId());
			if (tokenizationSupport) {
				let nestedModeState = tokenizationSupport.getInitialState();
				nestedModeState.setStateData(state);
				return nestedModeState;
			}
		}

		return new NullState(nestedMode ? nestedMode.getId() : NULL_MODE_ID, state);
	}

	private _getLeavingNestedModeData(line:string, state:modes.IState): ILeavingNestedModeData {
		if (this.defaults.getLeavingNestedModeData) {
			return null;
		}
		return this.customization.getLeavingNestedModeData(line, state);
	}
}
