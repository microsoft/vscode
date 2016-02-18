/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {MonarchMode} from 'vs/editor/common/modes/monarch/monarch';
import types = require('vs/editor/common/modes/monarch/monarchTypes');
import {compile} from 'vs/editor/common/modes/monarch/monarchCompile';
import {IModeDescriptor, IMode, IWorkerParticipant} from 'vs/editor/common/modes';
import {AsyncDescriptor2, createAsyncDescriptor2} from 'vs/platform/instantiation/common/descriptors';
import {IInstantiationService} from 'vs/platform/instantiation/common/instantiation';
import {IThreadService} from 'vs/platform/thread/common/thread';
import {IModelService} from 'vs/editor/common/services/modelService';
import {IModeService} from 'vs/editor/common/services/modeService';
import {OutputWorker} from 'vs/workbench/parts/output/common/outputWorker';
import winjs = require('vs/base/common/winjs.base');
import {OneWorkerAttr} from 'vs/platform/thread/common/threadService';
import URI from 'vs/base/common/uri';
import Modes = require('vs/editor/common/modes');
import {IEditorWorkerService} from 'vs/editor/common/services/editorWorkerService';

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

export class OutputMode extends MonarchMode<OutputWorker> {

	public linkSupport:Modes.ILinkSupport;

	constructor(
		descriptor:IModeDescriptor,
		@IInstantiationService instantiationService: IInstantiationService,
		@IThreadService threadService: IThreadService,
		@IModeService modeService: IModeService,
		@IModelService modelService: IModelService,
		@IEditorWorkerService editorWorkerService: IEditorWorkerService
	) {
		super(descriptor, compile(language), instantiationService, threadService, modeService, modelService, editorWorkerService);

		this.linkSupport = this;
	}

	protected _getWorkerDescriptor(): AsyncDescriptor2<IMode, IWorkerParticipant[], OutputWorker> {
		return createAsyncDescriptor2('vs/workbench/parts/output/common/outputWorker', 'OutputWorker');
	}

	static $computeLinks = OneWorkerAttr(OutputMode, OutputMode.prototype.computeLinks);
	public computeLinks(resource:URI):winjs.TPromise<Modes.ILink[]> {
		return this._worker((w) => w.computeLinks(resource));
	}
}
