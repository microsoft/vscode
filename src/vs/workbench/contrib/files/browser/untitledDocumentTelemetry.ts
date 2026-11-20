/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableMap, DisposableStore } from '../../../../base/common/lifecycle.js';
import { disposableTimeout } from '../../../../base/common/async.js';
import { ResourceMap } from '../../../../base/common/map.js';
import { Schemas } from '../../../../base/common/network.js';
import { extname } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { ITextModel } from '../../../../editor/common/model.js';
import { IModelService } from '../../../../editor/common/services/model.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { ChangeLanguageAction } from '../../../browser/parts/editor/editorStatus.js';
import { UntitledTextEditorOrigin } from '../../../common/editor.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { IFilesConfigurationService } from '../../../services/filesConfiguration/common/filesConfigurationService.js';
import { LanguageDetectionLanguageEventSource } from '../../../services/languageDetection/common/languageDetectionWorkerService.js';
import { ILifecycleService } from '../../../services/lifecycle/common/lifecycle.js';
import { IUntitledDocumentTelemetryService } from '../../../services/untitled/common/untitledDocumentTelemetry.js';
import { IUntitledTextEditorModel } from '../../../services/untitled/common/untitledTextEditorModel.js';
import { IUntitledTextEditorService } from '../../../services/untitled/common/untitledTextEditorService.js';
import { IWorkingCopyService } from '../../../services/workingCopy/common/workingCopyService.js';

type UntitledDocumentKind = 'created' | 'firstEdit' | 'ended';
type UntitledDocumentOutcome = 'saved' | 'closedEmpty' | 'closedDiscarded' | 'other';
type SizeBucket = '0' | '<100' | '<1k' | '<10k' | '>=10k';

type UntitledDocumentEvent = {
	kind: UntitledDocumentKind;
	untitledDocumentId: string;
	origin: UntitledTextEditorOrigin | 'other' | undefined;
	restored: boolean | undefined;
	language: string | undefined;
	editorId: string | undefined;
	msSinceCreated: number | undefined;
	outcome: UntitledDocumentOutcome | undefined;
	atShutdown: boolean | undefined;
	savedExt: string | undefined;
	sizeBucket: SizeBucket | undefined;
};

type UntitledDocumentClassification = {
	owner: 'hediet';
	comment: 'Follows untitled text documents from creation to their end, to understand what new files are used for (e.g. scratchpads, Markdown, code) and how the empty editor hint is used.';
	kind: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The lifecycle step: created, firstEdit or ended.' };
	untitledDocumentId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'A random id per untitled document, to correlate the events of one document. It is kept across window reloads through hot exit.' };
	origin: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'created: where the document was created from (e.g. newFileCommand, tabBarDoubleClick, extensionApi).' };
	restored: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'created: whether the document was restored after a window reload (hot exit) instead of newly created.' };
	language: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'created: the initial language id. ended: the final language id.' };
	editorId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'ended: the id of the editor the document was last active in (e.g. default for the text editor, or a custom editor view type).' };
	msSinceCreated: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'firstEdit, ended: milliseconds since the document was created.' };
	outcome: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'ended: saved, closedEmpty, closedDiscarded or other.' };
	atShutdown: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'ended: whether the document ended because the window closed.' };
	savedExt: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'ended: the file extension the document was saved with.' };
	sizeBucket: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'ended: the number of characters as a coarse bucket.' };
};

type DocumentLanguageChangedEvent = {
	from: string;
	to: string;
	source: 'picker' | 'autoDetect' | 'other';
	scheme: string;
	untitledDocumentId: string | undefined;
};

type DocumentLanguageChangedClassification = {
	owner: 'hediet';
	comment: 'Language changes of untitled documents (any source) and of other documents (only through the language picker), to understand which languages documents end up in.';
	from: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The previous language id.' };
	to: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The new language id.' };
	source: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'What changed the language: the language picker, automatic language detection, or something else (e.g. an extension).' };
	scheme: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The scheme of the document, e.g. untitled or file.' };
	untitledDocumentId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The untitledDocumentId of the untitledDocument events, if the document is untitled.' };
};

const STORAGE_KEY = 'untitledDocumentTelemetry.documents';

interface IPersistedDocument {
	readonly id: string;
	readonly createdAt: number;
	/** Hot exit also keeps empty documents, so a kept document has not necessarily been edited. */
	edited: boolean;
}

interface ITrackedDocument extends IPersistedDocument {
	readonly model: IUntitledTextEditorModel;
	readonly disposables: DisposableStore;
	reverted: boolean;
	length: number;
	/** The text model version and the length before the last content change, to tell what a revert emptied. */
	lastChange: { readonly versionId: number; readonly previousLength: number } | undefined;
	/** The length right before the last revert, e.g. the one Save As does before reporting the save, or Don't Save. */
	lengthBeforeRevert: number | undefined;
	language: string;
	editorId: string | undefined;
}

export function getSizeBucket(length: number): SizeBucket {
	if (length === 0) {
		return '0';
	}
	if (length < 100) {
		return '<100';
	}
	if (length < 1000) {
		return '<1k';
	}
	if (length < 10000) {
		return '<10k';
	}
	return '>=10k';
}

export class UntitledDocumentTelemetry extends Disposable implements IUntitledDocumentTelemetryService {

	declare readonly _serviceBrand: undefined;

	private readonly documents = new ResourceMap<ITrackedDocument>();
	private readonly textModelListeners = this._register(new DisposableMap<ITextModel>());
	private readonly persisted: Map<string, IPersistedDocument>;
	private shuttingDown = false;

	constructor(
		@IUntitledTextEditorService untitledTextEditorService: IUntitledTextEditorService,
		@IWorkingCopyService workingCopyService: IWorkingCopyService,
		@IModelService modelService: IModelService,
		@IEditorService private readonly editorService: IEditorService,
		@ILifecycleService lifecycleService: ILifecycleService,
		@IStorageService private readonly storageService: IStorageService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@IFilesConfigurationService private readonly filesConfigurationService: IFilesConfigurationService,
	) {
		super();

		this.persisted = this.readPersisted();

		this._register(untitledTextEditorService.onDidCreate(model => this.track(model)));
		for (const workingCopy of workingCopyService.workingCopies) {
			const model = workingCopy.resource.scheme === Schemas.untitled ? untitledTextEditorService.get(workingCopy.resource) : undefined;
			if (model) {
				this.track(model);
			}
		}

		this._register(untitledTextEditorService.onDidSave(e => this.end(e.source, 'saved', extname(e.target))));
		this._register(untitledTextEditorService.onWillDispose(model => this.onWillDispose(model)));

		this._register(modelService.onModelAdded(model => this.watchTextModel(model)));
		for (const model of modelService.getModels()) {
			this.watchTextModel(model);
		}

		this._register(editorService.onDidActiveEditorChange(() => this.onDidActiveEditorChange()));
		this._register(lifecycleService.onWillShutdown(() => this.onWillShutdown()));
		this._register(storageService.onWillSaveState(() => this.persist()));
	}

	getUntitledDocumentId(resource: URI | undefined): string | undefined {
		return resource ? this.documents.get(resource)?.id : undefined;
	}

	private track(model: IUntitledTextEditorModel): void {
		if (this.documents.has(model.resource)) {
			return;
		}

		const key = model.resource.toString();
		const persisted = this.persisted.get(key);
		this.persisted.delete(key);

		const document: ITrackedDocument = {
			id: persisted?.id ?? generateUuid(),
			createdAt: persisted?.createdAt ?? Date.now(),
			edited: persisted?.edited ?? false,
			model,
			disposables: new DisposableStore(),
			reverted: false,
			length: 0,
			lastChange: undefined,
			lengthBeforeRevert: undefined,
			language: model.getLanguageId() ?? 'plaintext',
			editorId: undefined,
		};
		this.documents.set(model.resource, document);
		document.disposables.add(model.onDidRevert(() => {
			document.reverted = true;
			const changedByRevert = document.lastChange !== undefined && document.lastChange.versionId === model.textEditorModel?.getVersionId();
			document.lengthBeforeRevert = changedByRevert ? document.lastChange!.previousLength : document.length;
		}));

		this.log({
			kind: 'created',
			untitledDocumentId: document.id,
			origin: model.origin ?? 'other',
			restored: !!persisted,
			language: document.language,
		});

		if (model.textEditorModel) {
			this.onDidChangeLength(document, model.textEditorModel);
		}
	}

	/**
	 * Content can arrive without an edit, e.g. the initial value of chat's Insert into New File or of
	 * `openTextDocument({ content })`, so it goes through the same bookkeeping as edits.
	 */
	private onDidChangeLength(document: ITrackedDocument, textModel: ITextModel): void {
		const previousLength = document.length;
		document.length = textModel.getValueLength();
		document.lastChange = { versionId: textModel.getVersionId(), previousLength };
		if (!document.edited && document.length > 0) {
			document.edited = true;
			this.log({ kind: 'firstEdit', untitledDocumentId: document.id, msSinceCreated: Date.now() - document.createdAt });
		}
	}

	private watchTextModel(model: ITextModel): void {
		const disposables = new DisposableStore();
		this.textModelListeners.set(model, disposables);
		disposables.add(model.onWillDispose(() => this.textModelListeners.deleteAndDispose(model)));

		disposables.add(model.onDidChangeLanguage(e => {
			const document = this.documents.get(model.uri);
			if (document) {
				document.language = e.newLanguage;
			}

			const source = e.source === ChangeLanguageAction.ID ? 'picker' : e.source === LanguageDetectionLanguageEventSource ? 'autoDetect' : 'other';
			if (model.uri.scheme !== Schemas.untitled && source !== 'picker') {
				return; // only user choices for other documents, to avoid noise from extensions and configuration
			}

			this.telemetryService.publicLog2<DocumentLanguageChangedEvent, DocumentLanguageChangedClassification>('documentLanguageChanged', {
				from: e.oldLanguage,
				to: e.newLanguage,
				source,
				scheme: model.uri.scheme,
				untitledDocumentId: document?.id,
			});
		}));

		if (model.uri.scheme === Schemas.untitled) {
			disposables.add(model.onDidChangeContent(() => {
				const document = this.documents.get(model.uri);
				if (document) {
					this.onDidChangeLength(document, model);
				}
			}));

			const document = this.documents.get(model.uri);
			if (document) {
				document.language = model.getLanguageId();
				this.onDidChangeLength(document, model);
			}
		}
	}

	private onDidActiveEditorChange(): void {
		const editor = this.editorService.activeEditor;
		const document = editor?.resource ? this.documents.get(editor.resource) : undefined;
		if (document) {
			document.editorId = editor?.editorId;
		}
	}

	private onWillDispose(model: IUntitledTextEditorModel): void {
		if (this.shuttingDown) {
			return; // documents that survive the shutdown continue after the reload, the others ended in onWillShutdown
		}

		const document = this.documents.get(model.resource);
		if (!document) {
			return;
		}
		if (document.reverted) {
			// Save As reverts the source before it reports the save, so the save gets a chance to end the document first
			document.disposables.add(disposableTimeout(() => this.end(model.resource, this.getClosedOutcome(document))));
		} else {
			this.end(model.resource, this.getClosedOutcome(document));
		}
	}

	private onWillShutdown(): void {
		this.persist();
		this.shuttingDown = true;

		for (const document of [...this.documents.values()]) {
			if (!this.survivesShutdown(document)) {
				this.end(document.model.resource, this.getClosedOutcome(document), undefined, true);
			}
		}
	}

	/**
	 * Hot exit keeps dirty documents and, when enabled, also restores the editors of empty ones.
	 * Documents that were restored but never resolved still have their backup.
	 */
	private survivesShutdown(document: ITrackedDocument): boolean {
		const resource = document.model.resource;
		return document.model.isDirty()
			|| !document.model.isResolved()
			|| (this.filesConfigurationService.isHotExitEnabled && this.editorService.findEditors(resource).length > 0);
	}

	private getClosedOutcome(document: ITrackedDocument): UntitledDocumentOutcome {
		if (document.reverted) {
			return 'closedDiscarded';
		}
		return document.length === 0 ? 'closedEmpty' : 'other';
	}

	private end(resource: URI, outcome: UntitledDocumentOutcome, savedExt?: string, atShutdown?: boolean): void {
		const document = this.documents.get(resource);
		if (!document) {
			return;
		}

		this.documents.delete(resource);
		document.disposables.dispose();

		this.log({
			kind: 'ended',
			untitledDocumentId: document.id,
			outcome,
			atShutdown: !!atShutdown,
			savedExt,
			language: document.language,
			editorId: document.editorId,
			msSinceCreated: Date.now() - document.createdAt,
			sizeBucket: getSizeBucket(document.reverted ? document.lengthBeforeRevert ?? document.length : document.length),
		});
	}

	private readPersisted(): Map<string, IPersistedDocument> {
		const result = new Map<string, IPersistedDocument>();
		try {
			const raw = JSON.parse(this.storageService.get(STORAGE_KEY, StorageScope.WORKSPACE, '{}')) as Record<string, IPersistedDocument>;
			for (const [key, value] of Object.entries(raw)) {
				if (typeof value?.id === 'string' && typeof value.createdAt === 'number') {
					result.set(key, { id: value.id, createdAt: value.createdAt, edited: value.edited === true });
				}
			}
		} catch {
			// ignore corrupt state
		}
		return result;
	}

	/**
	 * Remembers the ids of documents that hot exit keeps across the reload.
	 */
	private persist(): void {
		const value: Record<string, IPersistedDocument> = {};
		for (const document of this.documents.values()) {
			if (this.survivesShutdown(document)) {
				value[document.model.resource.toString()] = { id: document.id, createdAt: document.createdAt, edited: document.edited };
			}
		}
		if (Object.keys(value).length > 0) {
			this.storageService.store(STORAGE_KEY, JSON.stringify(value), StorageScope.WORKSPACE, StorageTarget.MACHINE);
		} else {
			this.storageService.remove(STORAGE_KEY, StorageScope.WORKSPACE);
		}
	}

	private log(event: Partial<UntitledDocumentEvent> & Pick<UntitledDocumentEvent, 'kind' | 'untitledDocumentId'>): void {
		this.telemetryService.publicLog2<UntitledDocumentEvent, UntitledDocumentClassification>('untitledDocument', {
			origin: undefined, restored: undefined, language: undefined, editorId: undefined, msSinceCreated: undefined,
			outcome: undefined, atShutdown: undefined, savedExt: undefined, sizeBucket: undefined,
			...event,
		});
	}

	override dispose(): void {
		for (const document of this.documents.values()) {
			document.disposables.dispose();
		}
		this.documents.clear();
		super.dispose();
	}
}
