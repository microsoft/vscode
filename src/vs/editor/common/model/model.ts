/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import URI from 'vs/base/common/uri';
import Event, { Emitter } from 'vs/base/common/event';
import { IModel, ITextModelCreationOptions } from 'vs/editor/common/editorCommon';
import { EditableTextModel } from 'vs/editor/common/model/editableTextModel';
import { TextModel } from 'vs/editor/common/model/textModel';
import { LanguageIdentifier } from 'vs/editor/common/modes';
import { IRawTextSource, RawTextSource } from 'vs/editor/common/model/textSource';

// The hierarchy is:
// Model -> EditableTextModel -> TextModelWithDecorations -> TextModelWithTokens -> TextModel

var MODEL_ID = 0;

export class Model extends EditableTextModel implements IModel {

	private readonly _onWillDispose: Emitter<void> = this._register(new Emitter<void>());
	public readonly onWillDispose: Event<void> = this._onWillDispose.event;

	public static createFromString(text: string, options: ITextModelCreationOptions = TextModel.DEFAULT_CREATION_OPTIONS, languageIdentifier: LanguageIdentifier = null, uri: URI = null): Model {
		return new Model(RawTextSource.fromString(text), options, languageIdentifier, uri);
	}

	public readonly id: string;

	private readonly _associatedResource: URI;
	private _attachedEditorCount: number;

	constructor(rawTextSource: IRawTextSource, creationOptions: ITextModelCreationOptions, languageIdentifier: LanguageIdentifier, associatedResource: URI = null) {
		super(rawTextSource, creationOptions, languageIdentifier);

		// Generate a new unique model id
		MODEL_ID++;
		this.id = '$model' + MODEL_ID;

		if (typeof associatedResource === 'undefined' || associatedResource === null) {
			this._associatedResource = URI.parse('inmemory://model/' + MODEL_ID);
		} else {
			this._associatedResource = associatedResource;
		}

		this._attachedEditorCount = 0;
	}

	public dispose(): void {
		this._isDisposing = true;
		this._onWillDispose.fire();
		super.dispose();
		this._isDisposing = false;
	}

	public onBeforeAttached(): void {
		this._attachedEditorCount++;
		// Warm up tokens for the editor
		this._warmUpTokens();
	}

	public onBeforeDetached(): void {
		this._attachedEditorCount--;
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
