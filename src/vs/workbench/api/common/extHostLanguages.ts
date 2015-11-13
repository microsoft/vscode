/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import URI from 'vs/base/common/uri';
import Event, {Emitter} from 'vs/base/common/event';
import {IDisposable, disposeAll} from 'vs/base/common/lifecycle';
import {TPromise} from 'vs/base/common/winjs.base';
import {Remotable, IThreadService} from 'vs/platform/thread/common/thread';
import {PluginHostModelService} from 'vs/workbench/api/common/pluginHostDocuments';
import {ISingleEditOperation, ISelection, IRange, IInternalIndentationOptions} from 'vs/editor/common/editorCommon';
import {ICodeEditorService} from 'vs/editor/common/services/codeEditorService';
import {IModelService} from 'vs/editor/common/services/modelService';
import {MainThreadEditorsTracker, MainThreadTextEditor, ITextEditorConfiguration} from 'vs/workbench/api/common/mainThreadEditors';
import * as TypeConverters from './pluginHostTypeConverters';
import {TextEditorSelectionChangeEvent, TextEditorOptionsChangeEvent} from 'vscode';
import {IEditorModesRegistry, Extensions} from 'vs/editor/common/modes/modesRegistry';
import {Registry} from 'vs/platform/platform';
import {INullService} from 'vs/platform/instantiation/common/instantiation';

export class ExtHostLanguages {

	private _proxy: MainThreadLanguages;

	constructor( @IThreadService threadService: IThreadService) {
		this._proxy = threadService.getRemotable(MainThreadLanguages);
	}

	getLanguages(): TPromise<string[]> {
		return this._proxy._getLanguages();
	}
}

@Remotable.MainContext('MainThreadLanguages')
export class MainThreadLanguages {

	private _registry: IEditorModesRegistry;

	constructor(@INullService ns) {
		this._registry = Registry.as(Extensions.EditorModes);
	}

	_getLanguages(): TPromise<string[]> {
		return TPromise.as(this._registry.getRegisteredModes());
	}
}