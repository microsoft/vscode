/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IObservableWithChange, derivedHandleChanges, derivedWithStore, observableValue, autorunWithStore, runOnChange, IObservable } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { StringEdit } from '../../../../../editor/common/core/edits/stringEdit.js';
import { StringText } from '../../../../../editor/common/core/text/abstractText.js';
import { TextModelEditSource } from '../../../../../editor/common/textModelEditSource.js';

export abstract class ObservableWorkspace {
	abstract get documents(): IObservableWithChange<readonly IObservableDocument[]>;


	getFirstOpenDocument(): IObservableDocument | undefined {
		return this.documents.get()[0];
	}

	getDocument(documentId: URI): IObservableDocument | undefined {
		return this.documents.get().find(d => d.uri.toString() === documentId.toString());
	}

	private _version = 0;

	/**
	 * Is fired when any open document changes.
	*/
	public readonly onDidOpenDocumentChange = derivedHandleChanges({
		owner: this,
		changeTracker: {
			createChangeSummary: () => ({ didChange: false }),
			handleChange: (ctx, changeSummary) => {
				if (!ctx.didChange(this.documents)) {
					changeSummary.didChange = true; // A document changed
				}
				return true;
			}
		}
	}, (reader, changeSummary) => {
		const docs = this.documents.read(reader);
		for (const d of docs) {
			d.value.read(reader); // add dependency
		}
		if (changeSummary.didChange) {
			this._version++; // to force a change
		}
		return this._version;

		// TODO@hediet make this work:
		/*
		const docs = this.openDocuments.read(reader);
		for (const d of docs) {
			if (reader.readChangesSinceLastRun(d.value).length > 0) {
				reader.reportChange(d);
			}
		}
		return undefined;
		*/
	});

	public readonly lastActiveDocument = derivedWithStore((_reader, store) => {
		const obs = observableValue('lastActiveDocument', undefined as IObservableDocument | undefined);
		store.add(autorunWithStore((reader, store) => {
			const docs = this.documents.read(reader);
			for (const d of docs) {
				store.add(runOnChange(d.value, () => {
					obs.set(d, undefined);
				}));
			}
		}));
		return obs;
	}).flatten();
}

export interface IObservableDocument {
	readonly uri: URI;
	readonly value: IObservableWithChange<StringText, StringEditWithReason>;

	/**
	 * Increases whenever the value changes. Is also used to reference document states from the past.
	*/
	readonly version: IObservable<number>;
	readonly languageId: IObservable<string>;
}

export class StringEditWithReason extends StringEdit {
	constructor(
		replacements: StringEdit['replacements'],
		public readonly reason: TextModelEditSource,
	) {
		super(replacements);
	}
}
