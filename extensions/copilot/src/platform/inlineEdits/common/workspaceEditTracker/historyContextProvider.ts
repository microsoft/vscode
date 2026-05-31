/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { assert } from '../../../../util/vs/base/common/assert';
import { OffsetRange } from '../../../../util/vs/editor/common/core/ranges/offsetRange';
import { StringText } from '../../../../util/vs/editor/common/core/text/abstractText';
import { DocumentId } from '../dataTypes/documentId';
import { Edits, RootedEdit } from '../dataTypes/edit';
import { LanguageId } from '../dataTypes/languageId';

export interface IHistoryContextProvider {
	/**
	 * The result must contain a document with `docUri`.
	*/
	getHistoryContext(id: DocumentId): HistoryContext | undefined;
}

export class HistoryContext {
	constructor(
		/**
		 * Sorted by time, from least recent to most recent.
		*/
		public readonly documents: readonly DocumentHistory[],
	) {
		assert(documents.length > 0);
	}

	getMostRecentDocument(): DocumentHistory {
		return this.documents.at(-1)!;
	}

	getDocument(docId: DocumentId): DocumentHistory | undefined {
		return this.documents.find(d => d.docId === docId);
	}

	getDocumentAndIdx(docId: DocumentId): { doc: DocumentHistory; idx: number } | undefined {
		const idx = this.documents.findIndex(d => d.docId === docId);
		if (idx === -1) { return undefined; }
		return { doc: this.documents[idx], idx };
	}
}

export class DocumentHistory {
	public readonly lastEdit = new RootedEdit(this.base, this.lastEdits.compose());

	constructor(
		public readonly docId: DocumentId,
		public readonly languageId: LanguageId,
		public readonly base: StringText,
		public readonly lastEdits: Edits,

		/**
		 * Refers to the state after edits
		*/
		public readonly lastSelection: OffsetRange | undefined,
	) {
	}
}
