/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import types = require('vs/editor/common/modes/monarch/monarchTypes');
import {compile} from 'vs/editor/common/modes/monarch/monarchCompile';
import {IModeDescriptor} from 'vs/editor/common/modes';
import {IInstantiationService} from 'vs/platform/instantiation/common/instantiation';
import {IModelService} from 'vs/editor/common/services/modelService';
import {IModeService} from 'vs/editor/common/services/modeService';
import {OutputWorker} from 'vs/workbench/parts/output/common/outputWorker';
import winjs = require('vs/base/common/winjs.base');
import {OneWorkerAttr} from 'vs/platform/thread/common/threadService';
import URI from 'vs/base/common/uri';
import * as modes from 'vs/editor/common/modes';
import {IEditorWorkerService} from 'vs/editor/common/services/editorWorkerService';
import {AbstractMode, ModeWorkerManager} from 'vs/editor/common/modes/abstractMode';
import {createRichEditSupport} from 'vs/editor/common/modes/monarch/monarchDefinition';
import {createTokenizationSupport} from 'vs/editor/common/modes/monarch/monarchLexer';
import {RichEditSupport} from 'vs/editor/common/modes/supports/richEditSupport';
import {wireCancellationToken} from 'vs/base/common/async';

export const language: types.ILanguage = {
	displayName: 'Log',
	name: 'Log',
	defaultToken: '',
	ignoreCase: true,

	tokenizer: {
		root: [

			// Log levels
			[/^\[trace.*?\]|trace:?/, 'debug-token.output'],
			[/^\[http.*?\]|http:?/, 'debug-token.output'],
			[/^\[debug.*?\]|debug:?/, 'debug-token.output'],
			[/^\[verbose.*?\]|verbose:?/, 'debug-token.output'],
			[/^\[information.*?\]|information:?/, 'info-token.output'],
			[/^\[info.*?\]|info:?/, 'info-token.output'],
			[/^\[warning.*?\]|warning:?/, 'warn-token.output'],
			[/^\[warn.*?\]|warn:?/, 'warn-token.output'],
			[/^\[error.*?\]|error:?/, 'error-token.output'],
			[/^\[fatal.*?\]|fatal:?/, 'error-token.output']
		]
	}
};

export class OutputMode extends AbstractMode {

	public tokenizationSupport: modes.ITokenizationSupport;
	public richEditSupport: modes.IRichEditSupport;

	private _modeWorkerManager: ModeWorkerManager<OutputWorker>;

	constructor(
		descriptor:IModeDescriptor,
		@IInstantiationService instantiationService: IInstantiationService,
		@IModeService modeService: IModeService,
		@IModelService modelService: IModelService,
		@IEditorWorkerService editorWorkerService: IEditorWorkerService
	) {
		super(descriptor.id);
		let lexer = compile(language);
		this._modeWorkerManager = new ModeWorkerManager<OutputWorker>(descriptor, 'vs/workbench/parts/output/common/outputWorker', 'OutputWorker', null, instantiationService);

		this.tokenizationSupport = createTokenizationSupport(modeService, this, lexer);

		this.richEditSupport = new RichEditSupport(this.getId(), null, createRichEditSupport(lexer));

		modes.LinkProviderRegistry.register(this.getId(), {
			provideLinks: (model, token): Thenable<modes.ILink[]> => {
				return wireCancellationToken(token, this._provideLinks(model.uri));
			}
		});
	}

	private _worker<T>(runner:(worker:OutputWorker)=>winjs.TPromise<T>): winjs.TPromise<T> {
		return this._modeWorkerManager.worker(runner);
	}

	static $_provideLinks = OneWorkerAttr(OutputMode, OutputMode.prototype._provideLinks);
	private _provideLinks(resource:URI):winjs.TPromise<modes.ILink[]> {
		return this._worker((w) => w.provideLinks(resource));
	}
}
