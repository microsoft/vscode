/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

/**
 * Create a syntax highighter with a fully declarative JSON style lexer description
 * using regular expressions.
 */

import {IRichEditSupport, ISuggestSupport, ITokenizationSupport} from 'vs/editor/common/modes';
import {AbstractMode} from 'vs/editor/common/modes/abstractMode';
import {ILexer} from 'vs/editor/common/modes/monarch/monarchCommon';
import {createRichEditSupport, createSuggestSupport} from 'vs/editor/common/modes/monarch/monarchDefinition';
import {createTokenizationSupport} from 'vs/editor/common/modes/monarch/monarchLexer';
import {RichEditSupport} from 'vs/editor/common/modes/supports/richEditSupport';
import {IEditorWorkerService} from 'vs/editor/common/services/editorWorkerService';
import {IModeService} from 'vs/editor/common/services/modeService';
import {IModelService} from 'vs/editor/common/services/modelService';

/**
 * The MonarchMode creates a Monaco language mode given a certain language description
 */
export abstract class MonarchMode extends AbstractMode {

	public suggestSupport:ISuggestSupport;
	public tokenizationSupport: ITokenizationSupport;
	public richEditSupport: IRichEditSupport;

	constructor(
		modeId:string,
		lexer: ILexer,
		modeService: IModeService,
		modelService: IModelService,
		editorWorkerService: IEditorWorkerService
	) {
		super(modeId);

		this.tokenizationSupport = createTokenizationSupport(modeService, this, lexer);

		this.richEditSupport = new RichEditSupport(this.getId(), null, createRichEditSupport(lexer));

		this.suggestSupport = createSuggestSupport(modelService, editorWorkerService, this.getId(), lexer);
	}
}
