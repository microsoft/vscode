/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { onUnexpectedError } from '../../../../../base/common/errors.js';
import { Disposable, DisposableStore, IDisposable } from '../../../../../base/common/lifecycle.js';
import { derived, IObservable, IObservableWithChange, mapObservableArrayCached, observableSignalFromEvent, observableValue, transaction } from '../../../../../base/common/observable.js';
import { isDefined } from '../../../../../base/common/types.js';
import { URI } from '../../../../../base/common/uri.js';
import { StringText } from '../../../../../editor/common/core/text/abstractText.js';
import { ITextModel } from '../../../../../editor/common/model.js';
import { offsetEditFromContentChanges } from '../../../../../editor/common/model/textModelStringEdit.js';
import { IModelService } from '../../../../../editor/common/services/model.js';
import { IObservableDocument, ObservableWorkspace, StringEditWithReason } from './observableWorkspace.js';

export class VSCodeWorkspace extends ObservableWorkspace implements IDisposable {
	private readonly _documents;
	public get documents() { return this._documents; }

	private readonly _store = new DisposableStore();

	constructor(
		@IModelService private readonly _textModelService: IModelService,
	) {
		super();

		const onModelAdded = observableSignalFromEvent(this, this._textModelService.onModelAdded);
		const onModelRemoved = observableSignalFromEvent(this, this._textModelService.onModelRemoved);

		const models = derived(this, reader => {
			onModelAdded.read(reader);
			onModelRemoved.read(reader);
			const models = this._textModelService.getModels();
			return models;
		});

		const documents = mapObservableArrayCached(this, models, (m, store) => {
			if (m.isTooLargeForSyncing()) {
				return undefined;
			}
			return store.add(new VSCodeDocument(m));
		}).recomputeInitiallyAndOnChange(this._store).map(d => d.filter(isDefined));

		this._documents = documents;
	}

	dispose(): void {
		this._store.dispose();
	}
}

export class VSCodeDocument extends Disposable implements IObservableDocument {
	get uri(): URI { return this.textModel.uri; }
	private readonly _value;
	private readonly _version;
	private readonly _languageId;
	get value(): IObservableWithChange<StringText, StringEditWithReason> { return this._value; }
	get version(): IObservable<number> { return this._version; }
	get languageId(): IObservable<string> { return this._languageId; }

	constructor(
		public readonly textModel: ITextModel,
	) {
		super();

		this._value = observableValue<StringText, StringEditWithReason>(this, new StringText(this.textModel.getValue()));
		this._version = observableValue(this, this.textModel.getVersionId());
		this._languageId = observableValue(this, this.textModel.getLanguageId());

		this._register(this.textModel.onDidChangeContent((e) => {
			transaction(tx => {
				const edit = offsetEditFromContentChanges(e.changes);
				if (e.detailedReasons.length !== 1) {
					onUnexpectedError(new Error(`Unexpected number of detailed reasons: ${e.detailedReasons.length}`));
				}

				const change = new StringEditWithReason(edit.replacements, e.detailedReasons[0]);

				this._value.set(new StringText(this.textModel.getValue()), tx, change);
				this._version.set(this.textModel.getVersionId(), tx);
			});
		}));

		this._register(this.textModel.onDidChangeLanguage(e => {
			transaction(tx => {
				this._languageId.set(this.textModel.getLanguageId(), tx);
			});
		}));
	}
}
