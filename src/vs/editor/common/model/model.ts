/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import URI from 'vs/base/common/uri';
import {
	EventType, IModel, ITextModelCreationOptions, IModelDecorationsChangedEvent,
	IModelOptionsChangedEvent, IModelLanguageChangedEvent, IRawText
} from 'vs/editor/common/editorCommon';
import { EditableTextModel } from 'vs/editor/common/model/editableTextModel';
import { TextModel } from 'vs/editor/common/model/textModel';
import { IDisposable } from 'vs/base/common/lifecycle';
import { BulkListenerCallback } from 'vs/base/common/eventEmitter';
import { LanguageIdentifier } from 'vs/editor/common/modes';

// The hierarchy is:
// Model -> EditableTextModel -> TextModelWithDecorations -> TextModelWithTrackedRanges -> TextModelWithMarkers -> TextModelWithTokens -> TextModel

var MODEL_ID = 0;

var aliveModels: { [modelId: string]: boolean; } = {};

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

export class Model extends EditableTextModel implements IModel {

	public onDidChangeDecorations(listener: (e: IModelDecorationsChangedEvent) => void): IDisposable {
		return this.addListener2(EventType.ModelDecorationsChanged, listener);
	}
	public onDidChangeOptions(listener: (e: IModelOptionsChangedEvent) => void): IDisposable {
		return this.addListener2(EventType.ModelOptionsChanged, listener);
	}
	public onWillDispose(listener: () => void): IDisposable {
		return this.addListener2(EventType.ModelDispose, listener);
	}
	public onDidChangeLanguage(listener: (e: IModelLanguageChangedEvent) => void): IDisposable {
		return this.addListener2(EventType.ModelLanguageChanged, listener);
	}

	public addBulkListener(listener: BulkListenerCallback): IDisposable {
		return super.addBulkListener(listener);
	}

	public static createFromString(text: string, options: ITextModelCreationOptions = TextModel.DEFAULT_CREATION_OPTIONS, languageIdentifier: LanguageIdentifier = null, uri: URI = null): Model {
		let rawText = TextModel.toRawText(text, options);
		return new Model(rawText, languageIdentifier, uri);
	}

	public id: string;

	private _associatedResource: URI;
	private _attachedEditorCount: number;

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
	constructor(rawText: IRawText, languageIdentifier: LanguageIdentifier, associatedResource: URI = null) {
		super([EventType.ModelDispose], rawText, languageIdentifier);

		// Generate a new unique model id
		MODEL_ID++;
		this.id = '$model' + MODEL_ID;

		if (typeof associatedResource === 'undefined' || associatedResource === null) {
			this._associatedResource = URI.parse('inmemory://model/' + MODEL_ID);
		} else {
			this._associatedResource = associatedResource;
		}


		if (aliveModels[String(this._associatedResource)]) {
			throw new Error('Cannot instantiate a second Model with the same URI');
		}

		this._attachedEditorCount = 0;

		aliveModels[String(this._associatedResource)] = true;
		// console.log('ALIVE MODELS: ' + Object.keys(aliveModels).join('\n'));
	}

	public destroy(): void {
		this.dispose();
	}

	public dispose(): void {
		this._isDisposing = true;
		delete aliveModels[String(this._associatedResource)];
		this.emit(EventType.ModelDispose);
		super.dispose();
		this._isDisposing = false;
		// console.log('ALIVE MODELS: ' + Object.keys(aliveModels).join('\n'));
	}

	public onBeforeAttached(): void {
		this._attachedEditorCount++;

		// Warm up tokens for the editor
		this._warmUpTokens();
	}

	public onBeforeDetached(): void {
		this._attachedEditorCount--;

		// Intentional empty (for now)
	}

	protected _shouldAutoTokenize(): boolean {
		return this.isAttachedToEditor();
	}

	public isAttachedToEditor(): boolean {
		return this._attachedEditorCount > 0;
	}

	public get uri(): URI {
		return this._associatedResource;
	}
}
