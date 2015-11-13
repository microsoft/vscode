/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

/**
 * Create a syntax highighter with a fully declarative JSON style lexer description
 * using regular expressions.
 */

import {AbstractMode} from 'vs/editor/common/modes/abstractMode';
import {AbstractModeWorker} from 'vs/editor/common/modes/abstractModeWorker';
import Supports = require('vs/editor/common/modes/supports');
import {ILexer} from 'vs/editor/common/modes/monarch/monarchCommon';
import Modes = require('vs/editor/common/modes');
import MonarchDefinition = require('vs/editor/common/modes/monarch/monarchDefinition');
import {createTokenizationSupport} from 'vs/editor/common/modes/monarch/monarchLexer';
import {OnEnterSupport} from 'vs/editor/common/modes/supports/onEnter';
import {IInstantiationService} from 'vs/platform/instantiation/common/instantiation';
import {IThreadService} from 'vs/platform/thread/common/thread';
import {IModeService} from 'vs/editor/common/services/modeService';
import {IModelService} from 'vs/editor/common/services/modelService';

/**
 * The MonarchMode creates a Monaco language mode given a certain language description
 */
export class MonarchMode<W extends AbstractModeWorker> extends AbstractMode<W> {
	public tokenizationSupport: Modes.ITokenizationSupport;
	public electricCharacterSupport: Modes.IElectricCharacterSupport;
	public characterPairSupport: Modes.ICharacterPairSupport;
	public onEnterSupport: Modes.IOnEnterSupport;

	constructor(
		descriptor:Modes.IModeDescriptor,
		lexer: ILexer,
		instantiationService: IInstantiationService,
		threadService: IThreadService,
		modeService: IModeService,
		modelService: IModelService
	) {
		super(descriptor, instantiationService, threadService);

		this.tokenizationSupport = createTokenizationSupport(modeService, this, lexer);
		this.electricCharacterSupport = new Supports.BracketElectricCharacterSupport(this, MonarchDefinition.createBracketElectricCharacterContribution(lexer));
		this.commentsSupport = new Supports.CommentsSupport(MonarchDefinition.createCommentsSupport(lexer));
		this.tokenTypeClassificationSupport = new Supports.TokenTypeClassificationSupport(MonarchDefinition.createTokenTypeClassificationSupportContribution(lexer));
		this.characterPairSupport = new Supports.CharacterPairSupport(this, MonarchDefinition.createCharacterPairContribution(lexer));
		this.suggestSupport = new Supports.ComposableSuggestSupport(this, MonarchDefinition.createSuggestSupport(modelService, this, lexer));
		this.onEnterSupport = new OnEnterSupport(this.getId(), MonarchDefinition.createOnEnterSupportOptions(lexer));
	}
}
