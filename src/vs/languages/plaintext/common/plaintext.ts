/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import EditorCommon = require('vs/editor/common/editorCommon');
import Modes = require('vs/editor/common/modes');
import supports = require('vs/editor/common/modes/supports');
import {AbstractMode} from 'vs/editor/common/modes/abstractMode';
import {AbstractState} from 'vs/editor/common/modes/abstractState';
import {IInstantiationService} from 'vs/platform/instantiation/common/instantiation';
import {IThreadService} from 'vs/platform/thread/common/thread';
import {AbstractModeWorker} from 'vs/editor/common/modes/abstractModeWorker';

class State extends AbstractState {

	constructor(mode:Modes.IMode) {
		super(mode);
	}

	public makeClone():State {
		return this;
	}

	public equals(other:Modes.IState):boolean {
		if (other instanceof State) {
			return (
				super.equals(other)
			);
		}
		return false;
	}

	public tokenize(stream:Modes.IStream):Modes.ITokenizationResult {
		stream.advanceToEOS();
		return { type:'' };
	}
}

export class Mode extends AbstractMode<AbstractModeWorker> {

	public tokenizationSupport: Modes.ITokenizationSupport;

	constructor(
		descriptor:Modes.IModeDescriptor,
		@IInstantiationService instantiationService: IInstantiationService,
		@IThreadService threadService: IThreadService
	) {
		super(descriptor, instantiationService, threadService);
		this.tokenizationSupport = new supports.TokenizationSupport(this, {
			getInitialState: () => new State(this)
		}, false, false);
	}
}