/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../base/common/lifecycle.js';
import { IObservable, mapObservableArrayCached, derived, derivedObservableWithCache, observableFromEvent, observableSignalFromEvent } from '../../../../../base/common/observable.js';
import { isDefined } from '../../../../../base/common/types.js';
import { URI } from '../../../../../base/common/uri.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { EditorResourceAccessor } from '../../../../common/editor.js';
import { IEditorGroupsService } from '../../../../services/editor/common/editorGroupsService.js';
import { IDocumentWithAnnotatedEdits, EditSourceData, DocumentWithSourceAnnotatedEdits, CombineStreamedChanges, MinimizeEditsProcessor } from './documentWithAnnotatedEdits.js';
import { ObservableWorkspace, IObservableDocument } from './observableWorkspace.js';

export class AnnotatedDocuments extends Disposable {
	public readonly documents: IObservable<readonly AnnotatedDocument[]>;

	constructor(
		private readonly _workspace: ObservableWorkspace,
		@IEditorGroupsService private readonly _editorGroupsService: IEditorGroupsService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService
	) {
		super();

		const onDidAddGroupSignal = observableSignalFromEvent(this, this._editorGroupsService.onDidAddGroup);
		const onDidRemoveGroupSignal = observableSignalFromEvent(this, this._editorGroupsService.onDidRemoveGroup);
		const groups = derived(this, reader => {
			onDidAddGroupSignal.read(reader);
			onDidRemoveGroupSignal.read(reader);
			return this._editorGroupsService.groups;
		});
		const visibleUris: IObservable<Map<string, URI>> = mapObservableArrayCached(this, groups, g => {
			const editors = observableFromEvent(this, g.onDidModelChange, () => g.editors);
			return editors.map(e => e.map(editor => EditorResourceAccessor.getCanonicalUri(editor)));
		}).map((editors, reader) => {
			const map = new Map<string, URI>();
			for (const urisObs of editors) {
				for (const uri of urisObs.read(reader)) {
					if (isDefined(uri)) {
						map.set(uri.toString(), uri);
					}
				}
			}
			return map;
		});

		const states = mapObservableArrayCached(this, this._workspace.documents, (doc, _store) => {
			const docIsVisible = derived(reader => visibleUris.read(reader).has(doc.uri.toString()));
			const wasEverVisible = derivedObservableWithCache<boolean>(this, (reader, lastVal) => lastVal || docIsVisible.read(reader));
			return wasEverVisible.map(v => v ? this._instantiationService.createInstance(AnnotatedDocument, doc, docIsVisible) : undefined);
		});

		this.documents = states.map((vals, reader) => vals.map(v => v.read(reader)).filter(isDefined));

		this.documents.recomputeInitiallyAndOnChange(this._store);
	}
}

export class AnnotatedDocument extends Disposable {
	public readonly documentWithAnnotations;

	constructor(
		public readonly document: IObservableDocument,
		public readonly isVisible: IObservable<boolean>,
		@IInstantiationService private readonly _instantiationService: IInstantiationService
	) {
		super();

		let processedDoc: IDocumentWithAnnotatedEdits<EditSourceData> = this._store.add(new DocumentWithSourceAnnotatedEdits(document));
		// Combine streaming edits into one and make edit smaller
		processedDoc = this._store.add(this._instantiationService.createInstance((CombineStreamedChanges<EditSourceData>), processedDoc));
		// Remove common suffix and prefix from edits
		processedDoc = this._store.add(new MinimizeEditsProcessor(processedDoc));

		this.documentWithAnnotations = processedDoc;
	}
}
