/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import Modes = require('vs/editor/common/modes');
import {AbstractMode} from 'vs/editor/common/modes/abstractMode';
import {AbstractState} from 'vs/editor/common/modes/abstractState';
import {IInstantiationService} from 'vs/platform/instantiation/common/instantiation';
import {IThreadService} from 'vs/platform/thread/common/thread';
import {AbstractModeWorker} from 'vs/editor/common/modes/abstractModeWorker';
import {TokenizationSupport} from 'vs/editor/common/modes/supports/tokenizationSupport';
import {TextualSuggestSupport} from 'vs/editor/common/modes/supports/suggestSupport';
import {IEditorWorkerService} from 'vs/editor/common/services/editorWorkerService';

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

	public suggestSupport:Modes.ISuggestSupport;
	public tokenizationSupport: Modes.ITokenizationSupport;

	constructor(
		descriptor:Modes.IModeDescriptor,
		@IInstantiationService instantiationService: IInstantiationService,
		@IThreadService threadService: IThreadService,
		@IEditorWorkerService editorWorkerService: IEditorWorkerService
	) {
		super(descriptor, instantiationService, threadService);
		this.tokenizationSupport = new TokenizationSupport(this, {
			getInitialState: () => new State(this)
		}, false, false);

		this.suggestSupport = new TextualSuggestSupport(this.getId(), editorWorkerService);
	}
}