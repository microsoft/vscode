/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {MonarchMode} from 'vs/editor/common/modes/monarch/monarch';
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
import Modes = require('vs/editor/common/modes');
import {IEditorWorkerService} from 'vs/editor/common/services/editorWorkerService';
import {ModeWorkerManager} from 'vs/editor/common/modes/abstractMode';

export const language: types.ILanguage = {
	displayName: 'Log',
	name: 'Log',
	defaultToken: '',
	ignoreCase: true,

	tokenizer: {
		root: [

			// Monaco log levels
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

export class OutputMode extends MonarchMode {

	public linkSupport:Modes.ILinkSupport;

	private _modeWorkerManager: ModeWorkerManager<OutputWorker>;

	constructor(
		descriptor:IModeDescriptor,
		@IInstantiationService instantiationService: IInstantiationService,
		@IModeService modeService: IModeService,
		@IModelService modelService: IModelService,
		@IEditorWorkerService editorWorkerService: IEditorWorkerService
	) {
		super(descriptor.id, compile(language), modeService, modelService, editorWorkerService);
		this._modeWorkerManager = new ModeWorkerManager<OutputWorker>(descriptor, 'vs/workbench/parts/output/common/outputWorker', 'OutputWorker', null, instantiationService);

		this.linkSupport = this;
	}

	private _worker<T>(runner:(worker:OutputWorker)=>winjs.TPromise<T>): winjs.TPromise<T> {
		return this._modeWorkerManager.worker(runner);
	}

	static $computeLinks = OneWorkerAttr(OutputMode, OutputMode.prototype.computeLinks);
	public computeLinks(resource:URI):winjs.TPromise<Modes.ILink[]> {
		return this._worker((w) => w.computeLinks(resource));
	}
}
