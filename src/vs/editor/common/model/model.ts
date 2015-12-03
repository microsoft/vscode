/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {TPromise} from 'vs/base/common/winjs.base';
import {IMode} from 'vs/editor/common/modes';
import {TextModel} from 'vs/editor/common/model/textModel';
import {EditableTextModel} from 'vs/editor/common/model/editableTextModel';
import EditorCommon = require('vs/editor/common/editorCommon');
import URI from 'vs/base/common/uri';
import Objects = require('vs/base/common/objects');
import {IDisposable} from 'vs/base/common/lifecycle';

// The hierarchy is:
// Model -> EditableTextModel -> TextModelWithDecorations -> TextModelWithTrackedRanges -> TextModelWithMarkers -> TextModelWithTokens -> TextModel

interface IPropertiesMap {
	[key:string]:any;
}

var MODEL_ID = 0;

var aliveModels:{[modelId:string]:boolean;} = {};

// var LAST_CNT = 0;
// setInterval(() => {
// 	var cnt = Object.keys(aliveModels).length;
// 	if (cnt === LAST_CNT) {
// 		return;
// 	}
// 	console.warn('ALIVE MODELS:');
// 	console.log(Object.keys(aliveModels).join('\n'));
// 	LAST_CNT = cnt;
// }, 100);

export class Model extends EditableTextModel implements EditorCommon.IModel {

	public id:string;

	private _associatedResource:URI;
	private _extraProperties:IPropertiesMap;
	private _attachedEditorCount:number;

	/**
	 * Instantiates a new model
	 * @param rawText
	 *   The raw text buffer. It may start with a UTF-16 BOM, which can be
	 *   optionally preserved when doing a getValue call. The lines may be
	 *   separated by different EOL combinations, such as \n or \r\n. These
	 *   can also be preserved when doing a getValue call.
	 * @param mode
	 *   The language service name this model is bound to.
	 * @param associatedResource
	 *   The resource associated with this model. If the value is not provided an
	 *   unique in memory URL is constructed as the associated resource.
	 */
	constructor(rawText:string, modeOrPromise:IMode|TPromise<IMode>, associatedResource:URI=null) {
		super([
			EditorCommon.EventType.ModelPropertiesChanged,
			EditorCommon.EventType.ModelDispose
		], TextModel.toRawText(rawText), modeOrPromise);

		// Generate a new unique model id
		MODEL_ID++;
		this.id = '$model' + MODEL_ID;

		if (typeof associatedResource === 'undefined' || associatedResource === null) {
			this._associatedResource = URI.parse('inmemory://model/' + MODEL_ID);
		} else {
			this._associatedResource = associatedResource;
		}


		if (aliveModels[String(this._associatedResource)]) {
			throw new Error('Cannot instantiate a second Model with the same URI!');
		}

		this._extraProperties = {};
		this._attachedEditorCount = 0;

		aliveModels[String(this._associatedResource)] = true;
		// console.log('ALIVE MODELS: ' + Object.keys(aliveModels).join('\n'));
	}

	public getModeId(): string {
		return this.getMode().getId();
	}

	public destroy(): void {
		this.dispose();
	}

	public dispose(): void {
		this._isDisposing = true;
		delete aliveModels[String(this._associatedResource)];
		this.emit(EditorCommon.EventType.ModelDispose);
		super.dispose();
		this._isDisposing = false;
		// console.log('ALIVE MODELS: ' + Object.keys(aliveModels).join('\n'));
	}

	public onBeforeAttached(): void {
		if (this._isDisposed) {
			throw new Error('Model.onBeforeAttached: Model is disposed');
		}

		this._attachedEditorCount++;

		// Warm up tokens for the editor
		this._warmUpTokens();
	}

	public onBeforeDetached(): void {
		if (this._isDisposed) {
			throw new Error('Model.onBeforeDetached: Model is disposed');
		}

		this._attachedEditorCount--;

		// Intentional empty (for now)
	}

	public isAttachedToEditor(): boolean {
		return this._attachedEditorCount > 0;
	}

	public getAssociatedResource(): URI {
		if (this._isDisposed) {
			throw new Error('Model.getAssociatedResource: Model is disposed');
		}

		return this._associatedResource;
	}

	public setProperty(name:string, value:any): void {
		if (this._isDisposed) {
			throw new Error('Model.setProperty: Model is disposed');
		}

		this._extraProperties[name] = value;
		this.emitModelPropertiesChangedEvent();
	}

	public getProperty(name:string): any {
		if (this._isDisposed) {
			throw new Error('Model.getProperty: Model is disposed');
		}

		return this._extraProperties.hasOwnProperty(name) ? this._extraProperties[name] : null;
	}

	public getProperties(): {[name:string]:any;} {
		if (this._isDisposed) {
			throw new Error('Model.getProperties: Model is disposed');
		}

		return Objects.clone(this._extraProperties);
	}

	private emitModelPropertiesChangedEvent(): void {
		var e:EditorCommon.IModelPropertiesChangedEvent = {
			properties: this._extraProperties
		};
		if (!this._isDisposing) {
			this.emit(EditorCommon.EventType.ModelPropertiesChanged, e);
		}
	}
}
