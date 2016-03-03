/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {IDisposable} from 'vs/base/common/lifecycle';
import {TPromise} from 'vs/base/common/winjs.base';
import * as modes from 'vs/editor/common/modes';
import {LineStream} from 'vs/editor/common/modes/lineStream';
import {NullMode, NullState, nullTokenize} from 'vs/editor/common/modes/nullMode';
import {Token} from 'vs/editor/common/modes/supports';

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
	stateAfterNestedMode: modes.IState;
}

export interface IEnteringNestedModeData {
	mode:modes.IMode;
	missingModePromise:TPromise<void>;
}

export interface ITokenizationCustomization {

	getInitialState():modes.IState;

	enterNestedMode?: (state:modes.IState) => boolean;

	getNestedMode?: (state:modes.IState) => IEnteringNestedModeData;

	getNestedModeInitialState?: (myState:modes.IState) => { state:modes.IState; missingModePromise:TPromise<void>; };

	/**
	 * Return null if the line does not leave the nested mode
	 */
	getLeavingNestedModeData?: (line:string, state:modes.IState) => ILeavingNestedModeData;

	/**
	 * Callback for when leaving a nested mode and returning to the outer mode.
	 * @param myStateAfterNestedMode The outer mode's state that will begin to tokenize
	 * @param lastNestedModeState The nested mode's last state
	 */
	onReturningFromNestedMode?: (myStateAfterNestedMode:modes.IState, lastNestedModeState:modes.IState)=> void;
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
		getNestedModeInitialState: boolean;
		getLeavingNestedModeData: boolean;
		onReturningFromNestedMode: boolean;
	};

	public shouldGenerateEmbeddedModels:boolean;
	public supportsNestedModes:boolean;

	private _mode:modes.IMode;
	private _embeddedModesListeners: { [modeId:string]: IDisposable; };

	constructor(mode:modes.IMode, customization:ITokenizationCustomization, supportsNestedModes:boolean, shouldGenerateEmbeddedModels:boolean) {
		this._mode = mode;
		this.customization = customization;
		this.supportsNestedModes = supportsNestedModes;
		this._embeddedModesListeners = {};
		if (this.supportsNestedModes) {
			if (!this._mode.registerSupport) {
				throw new Error('Cannot be a mode with nested modes unless I can emit a tokenizationSupport changed event!');
			}
		}
		this.shouldGenerateEmbeddedModels = shouldGenerateEmbeddedModels;
		this.defaults = {
			enterNestedMode: !isFunction(customization.enterNestedMode),
			getNestedMode: !isFunction(customization.getNestedMode),
			getNestedModeInitialState: !isFunction(customization.getNestedModeInitialState),
			getLeavingNestedModeData: !isFunction(customization.getLeavingNestedModeData),
			onReturningFromNestedMode: !isFunction(customization.onReturningFromNestedMode)
		};
	}

	public dispose() : void {
		for (var listener in this._embeddedModesListeners) {
			this._embeddedModesListeners[listener].dispose();
			delete this._embeddedModesListeners[listener];
		}
	}

	public getInitialState(): modes.IState {
		return this.customization.getInitialState();
	}

	public tokenize(line:string, state:modes.IState, deltaOffset:number = 0, stopAtOffset:number = deltaOffset + line.length):modes.ILineTokens {
		if (state.getMode() !== this._mode) {
			return this._nestedTokenize(line, state, deltaOffset, stopAtOffset, [], []);
		} else {
			return this._myTokenize(line, state, deltaOffset, stopAtOffset, [], []);
		}
	}

	/**
	 * Precondition is: nestedModeState.getMode() !== this
	 * This means we are in a nested mode when parsing starts on this line.
	 */
	private _nestedTokenize(buffer:string, nestedModeState:modes.IState, deltaOffset:number, stopAtOffset:number, prependTokens:modes.IToken[], prependModeTransitions:modes.IModeTransition[]):modes.ILineTokens {
		var myStateBeforeNestedMode = nestedModeState.getStateData();
		var leavingNestedModeData = this.getLeavingNestedModeData(buffer, myStateBeforeNestedMode);

		// Be sure to give every embedded mode the
		// opportunity to leave nested mode.
		// i.e. Don't go straight to the most nested mode
		var stepOnceNestedState = nestedModeState;
		while (stepOnceNestedState.getStateData() && stepOnceNestedState.getStateData().getMode() !== this._mode) {
			stepOnceNestedState = stepOnceNestedState.getStateData();
		}
		var nestedMode = stepOnceNestedState.getMode();

		if (!leavingNestedModeData) {
			// tokenization will not leave nested mode
			var result:modes.ILineTokens;
			if (nestedMode.tokenizationSupport) {
				result = nestedMode.tokenizationSupport.tokenize(buffer, nestedModeState, deltaOffset, stopAtOffset);
			} else {
				// The nested mode doesn't have tokenization support,
				// unfortunatelly this means we have to fake it
				result = nullTokenize(nestedMode, buffer, nestedModeState, deltaOffset);
			}
			result.tokens = prependTokens.concat(result.tokens);
			result.modeTransitions = prependModeTransitions.concat(result.modeTransitions);
			return result;
		}

		var nestedModeBuffer = leavingNestedModeData.nestedModeBuffer;
		if (nestedModeBuffer.length > 0) {
			// Tokenize with the nested mode
			var nestedModeLineTokens:modes.ILineTokens;
			if (nestedMode.tokenizationSupport) {
				nestedModeLineTokens = nestedMode.tokenizationSupport.tokenize(nestedModeBuffer, nestedModeState, deltaOffset, stopAtOffset);
			} else {
				// The nested mode doesn't have tokenization support,
				// unfortunatelly this means we have to fake it
				nestedModeLineTokens = nullTokenize(nestedMode, nestedModeBuffer, nestedModeState, deltaOffset);
			}

			// Save last state of nested mode
			nestedModeState = nestedModeLineTokens.endState;

			// Prepend nested mode's result to our result
			prependTokens = prependTokens.concat(nestedModeLineTokens.tokens);
			prependModeTransitions = prependModeTransitions.concat(nestedModeLineTokens.modeTransitions);
		}

		var bufferAfterNestedMode = leavingNestedModeData.bufferAfterNestedMode;
		var myStateAfterNestedMode = leavingNestedModeData.stateAfterNestedMode;
		myStateAfterNestedMode.setStateData(myStateBeforeNestedMode.getStateData());
		this.onReturningFromNestedMode(myStateAfterNestedMode, nestedModeState);

		return this._myTokenize(bufferAfterNestedMode, myStateAfterNestedMode, deltaOffset + nestedModeBuffer.length, stopAtOffset, prependTokens, prependModeTransitions);
	}

	/**
	 * Precondition is: state.getMode() === this
	 * This means we are in the current mode when parsing starts on this line.
	 */
	private _myTokenize(buffer:string, myState:modes.IState, deltaOffset:number, stopAtOffset:number, prependTokens:modes.IToken[], prependModeTransitions:modes.IModeTransition[]):modes.ILineTokens {
		var lineStream = new LineStream(buffer);
		var tokenResult:modes.ITokenizationResult, beforeTokenizeStreamPos:number;
		var previousType:string = null;
		var retokenize:TPromise<void> = null;

		myState = myState.clone();
		if (prependModeTransitions.length <= 0 || prependModeTransitions[prependModeTransitions.length-1].mode !== this._mode) {
			// Avoid transitioning to the same mode (this can happen in case of empty embedded modes)
			prependModeTransitions.push({
				startIndex: deltaOffset,
				mode: this._mode
			});
		}

		var maxPos = Math.min(stopAtOffset - deltaOffset, buffer.length);
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
					throw new Error('Stream did not advance while tokenizing. Mode id is ' + this._mode.getId() + ' (stuck at token type: "' + tokenResult.type + '", prepend tokens: "' + (prependTokens.map(t => t.type).join(',')) + '").');
				}
			} while (!tokenResult.type && tokenResult.type !== '');

			if (previousType !== tokenResult.type || tokenResult.dontMergeWithPrev || previousType === null) {
				prependTokens.push(new Token(beforeTokenizeStreamPos + deltaOffset, tokenResult.type));
			}

			previousType = tokenResult.type;

			if (this.supportsNestedModes && this.enterNestedMode(myState)) {
				var currentEmbeddedLevels = this._getEmbeddedLevel(myState);
				if (currentEmbeddedLevels < TokenizationSupport.MAX_EMBEDDED_LEVELS) {
					var nestedModeState = this.getNestedModeInitialState(myState);

					// Re-emit tokenizationSupport change events from all modes that I ever embedded
					var embeddedMode = nestedModeState.state.getMode();
					if (typeof embeddedMode.addSupportChangedListener === 'function' && !this._embeddedModesListeners.hasOwnProperty(embeddedMode.getId())) {
						var emitting = false;
						this._embeddedModesListeners[embeddedMode.getId()] = embeddedMode.addSupportChangedListener((e) => {
							if (emitting) {
								return;
							}
							if (e.tokenizationSupport) {
								emitting = true;
								this._mode.registerSupport('tokenizationSupport', (mode) => {
									return mode.tokenizationSupport;
								});
								emitting = false;
							}
						});
					}


					if (!lineStream.eos()) {
						// There is content from the embedded mode
						var restOfBuffer = buffer.substr(lineStream.pos());
						var result = this._nestedTokenize(restOfBuffer, nestedModeState.state, deltaOffset + lineStream.pos(), stopAtOffset, prependTokens, prependModeTransitions);
						result.retokenize = result.retokenize || nestedModeState.missingModePromise;
						return result;
					} else {
						// Transition to the nested mode state
						myState = nestedModeState.state;
						retokenize = nestedModeState.missingModePromise;
					}
				}
			}
		}

		return {
			tokens: prependTokens,
			actualStopOffset: lineStream.pos() + deltaOffset,
			modeTransitions: prependModeTransitions,
			endState: myState,
			retokenize: retokenize
		};
	}

	private _getEmbeddedLevel(state:modes.IState): number {
		var result = -1;
		while(state) {
			result++;
			state = state.getStateData();
		}
		return result;
	}

	private enterNestedMode(state:modes.IState): boolean {
		if (this.defaults.enterNestedMode) {
			return false;
		}
		return this.customization.enterNestedMode(state);

	}

	private getNestedMode(state:modes.IState): IEnteringNestedModeData {
		if (this.defaults.getNestedMode) {
			return null;
		}
		return this.customization.getNestedMode(state);
	}

	private static _validatedNestedMode(input:IEnteringNestedModeData): IEnteringNestedModeData {
		var mode: modes.IMode = new NullMode(),
			missingModePromise: TPromise<void> = null;

		if (input && input.mode) {
			mode = input.mode;
		}
		if (input && input.missingModePromise) {
			missingModePromise = input.missingModePromise;
		}

		return {
			mode: mode,
			missingModePromise: missingModePromise
		};
	}

	private getNestedModeInitialState(state:modes.IState): { state:modes.IState; missingModePromise:TPromise<void>; } {
		if (this.defaults.getNestedModeInitialState) {
			var nestedMode = TokenizationSupport._validatedNestedMode(this.getNestedMode(state));
			var missingModePromise = nestedMode.missingModePromise;
			var nestedModeState: modes.IState;

			if (nestedMode.mode.tokenizationSupport) {
				nestedModeState = nestedMode.mode.tokenizationSupport.getInitialState();
			} else {
				nestedModeState = new NullState(nestedMode.mode, null);
			}

			nestedModeState.setStateData(state);

			return {
				state: nestedModeState,
				missingModePromise: missingModePromise
			};
		}
		return this.customization.getNestedModeInitialState(state);
	}

	private getLeavingNestedModeData(line:string, state:modes.IState): ILeavingNestedModeData {
		if (this.defaults.getLeavingNestedModeData) {
			return null;
		}
		return this.customization.getLeavingNestedModeData(line, state);
	}

	private onReturningFromNestedMode(myStateAfterNestedMode:modes.IState, lastNestedModeState:modes.IState): void {
		if (this.defaults.onReturningFromNestedMode) {
			return null;
		}
		return this.customization.onReturningFromNestedMode(myStateAfterNestedMode, lastNestedModeState);
	}
}
