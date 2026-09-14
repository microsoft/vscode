/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { equals } from '../../../../base/common/arrays.js';
import { Event } from '../../../../base/common/event.js';
import { Disposable, DisposableMap, DisposableStore } from '../../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../../base/common/map.js';
import { parse, stringify } from '../../../../base/common/marshalling.js';
import { autorun, derived, IObservable, ISettableObservable, observableSignal, observableValue, transaction } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { IUriIdentityService } from '../../../../platform/uriIdentity/common/uriIdentity.js';
import { IChatRequestVariableEntry } from '../../../../workbench/contrib/chat/common/attachments/chatVariableEntries.js';
import { IChatService } from '../../../../workbench/contrib/chat/common/chatService/chatService.js';
import { IChatModel } from '../../../../workbench/contrib/chat/common/model/chatModel.js';

export interface ISessionInputDraft {
	readonly inputText: string;
	readonly attachments: readonly IChatRequestVariableEntry[];
}

export interface ISessionInputDraftService {
	readonly _serviceBrand: undefined;
	/** Reading a draft never acquires or loads a chat model. */
	getDraft(chatResource: URI): IObservable<ISessionInputDraft>;
	setDraft(chatResource: URI, draft: ISessionInputDraft): void;
	addAttachments(chatResource: URI, attachments: readonly IChatRequestVariableEntry[]): void;
	rebindDraft(previousChatResource: URI, chatResource: URI): void;
}

export const ISessionInputDraftService = createDecorator<ISessionInputDraftService>('sessionInputDraftService');

interface IDraftEntry {
	readonly state: ISettableObservable<ISessionInputDraft>;
	pendingModelUpdate: boolean;
}

interface IStoredDraft {
	readonly resource: string;
	readonly inputText: string;
	readonly attachments: readonly IChatRequestVariableEntry[];
}

function isStoredDraft(value: unknown): value is IStoredDraft {
	return typeof value === 'object' && value !== null
		&& 'resource' in value && typeof value.resource === 'string'
		&& 'inputText' in value && typeof value.inputText === 'string'
		&& 'attachments' in value && Array.isArray(value.attachments);
}

/** Shares lightweight drafts with already-loaded native chat input models. */
export class SessionInputDraftService extends Disposable implements ISessionInputDraftService {
	declare readonly _serviceBrand: undefined;

	private static readonly STORAGE_KEY = 'sessions.inputDrafts';
	private readonly _drafts: ResourceMap<IDraftEntry>;
	private readonly _bindings: ResourceMap<IObservable<ISessionInputDraft>>;
	private readonly _redirects: ResourceMap<URI>;
	private readonly _bindingsChanged = observableSignal(this);
	private readonly _modelListeners = this._register(new DisposableMap<string, DisposableStore>());

	constructor(
		@IChatService private readonly chatService: IChatService,
		@IStorageService private readonly storageService: IStorageService,
		@IUriIdentityService private readonly uriIdentityService: IUriIdentityService,
		@ILogService private readonly logService: ILogService,
	) {
		super();
		this._drafts = new ResourceMap(resource => this.uriIdentityService.extUri.getComparisonKey(resource));
		this._bindings = new ResourceMap(resource => this.uriIdentityService.extUri.getComparisonKey(resource));
		this._redirects = new ResourceMap(resource => this.uriIdentityService.extUri.getComparisonKey(resource));
		this._load();
		this._register(this.chatService.onDidCreateModel(model => this._trackModel(model)));
		this._register(this.storageService.onWillSaveState(() => this._save()));
	}

	getDraft(chatResource: URI): IObservable<ISessionInputDraft> {
		const resource = this._resolveResource(chatResource);
		const model = this.chatService.getSession(resource);
		if (model) {
			this._trackModel(model);
		}
		let binding = this._bindings.get(chatResource);
		if (!binding) {
			binding = derived(this, reader => {
				this._bindingsChanged.read(reader);
				return this._entry(this._resolveResource(chatResource)).state.read(reader);
			});
			this._bindings.set(chatResource, binding);
		}
		return binding;
	}

	setDraft(chatResource: URI, draft: ISessionInputDraft): void {
		const resource = this._resolveResource(chatResource);
		const entry = this._entry(resource);
		this._update(entry, draft);
		entry.pendingModelUpdate = true;
		const model = this.chatService.getSession(resource);
		if (model) {
			model.inputModel.setState({ inputText: draft.inputText, attachments: draft.attachments });
			entry.pendingModelUpdate = false;
			this._trackModel(model);
		}
	}

	addAttachments(chatResource: URI, attachments: readonly IChatRequestVariableEntry[]): void {
		const draft = this.getDraft(chatResource).get();
		const existing = new Set(draft.attachments.map(attachment => attachment.id));
		const additions = attachments.filter(attachment => {
			if (existing.has(attachment.id)) {
				return false;
			}
			existing.add(attachment.id);
			return true;
		});
		if (additions.length) {
			this.setDraft(chatResource, { inputText: draft.inputText, attachments: [...draft.attachments, ...additions] });
		}
	}

	rebindDraft(previousChatResource: URI, chatResource: URI): void {
		const previous = this._resolveResource(previousChatResource);
		const resource = this._resolveResource(chatResource);
		if (this.uriIdentityService.extUri.isEqual(previous, resource)) {
			return;
		}
		const source = this._drafts.get(previous);
		const target = this._drafts.get(resource);
		this._modelListeners.deleteAndDispose(this.uriIdentityService.extUri.getComparisonKey(previous));
		this._modelListeners.deleteAndDispose(this.uriIdentityService.extUri.getComparisonKey(resource));
		transaction(tx => {
			if (source && (source.pendingModelUpdate || !target || !target.pendingModelUpdate && (source.state.get().inputText || source.state.get().attachments.length))) {
				source.pendingModelUpdate = true;
				this._drafts.set(resource, source);
			}
			this._drafts.delete(previous);
			this._redirects.set(previous, resource);
			this._bindingsChanged.trigger(tx);
		});
		const model = this.chatService.getSession(resource);
		if (model) {
			this._trackModel(model);
		}
	}

	private _resolveResource(resource: URI): URI {
		let redirected: URI | undefined;
		while ((redirected = this._redirects.get(resource))) {
			resource = redirected;
		}
		return resource;
	}

	private _entry(resource: URI): IDraftEntry {
		let entry = this._drafts.get(resource);
		if (!entry) {
			entry = { state: observableValue<ISessionInputDraft>(this, { inputText: '', attachments: [] }), pendingModelUpdate: false };
			this._drafts.set(resource, entry);
		}
		return entry;
	}

	private _update(entry: IDraftEntry, draft: ISessionInputDraft): void {
		const current = entry.state.get();
		if (current.inputText !== draft.inputText || !equals(current.attachments, draft.attachments)) {
			entry.state.set({ inputText: draft.inputText, attachments: [...draft.attachments] }, undefined);
		}
	}

	private _trackModel(model: IChatModel): void {
		if (this._redirects.has(model.sessionResource)) {
			return;
		}
		const key = this.uriIdentityService.extUri.getComparisonKey(model.sessionResource);
		if (this._modelListeners.has(key)) {
			return;
		}
		const store = new DisposableStore();
		this._modelListeners.set(key, store);
		store.add(Event.once(model.onDidDispose)(() => this._modelListeners.deleteAndDispose(key)));
		const entry = this._entry(model.sessionResource);
		if (entry.pendingModelUpdate) {
			const draft = entry.state.get();
			model.inputModel.setState({ inputText: draft.inputText, attachments: draft.attachments });
			entry.pendingModelUpdate = false;
		}
		store.add(autorun(reader => {
			const state = model.inputModel.state.read(reader);
			if (state) {
				this._update(entry, { inputText: state.inputText, attachments: state.attachments });
			}
		}));
	}

	private _load(): void {
		const raw = this.storageService.get(SessionInputDraftService.STORAGE_KEY, StorageScope.WORKSPACE);
		if (!raw) {
			return;
		}
		try {
			const drafts: unknown = parse(raw);
			if (!Array.isArray(drafts) || !drafts.every(isStoredDraft)) {
				throw new Error('Invalid session input drafts');
			}
			for (const draft of drafts) {
				const entry = this._entry(URI.parse(draft.resource));
				this._update(entry, { inputText: draft.inputText, attachments: draft.attachments.map(IChatRequestVariableEntry.fromExport) });
				entry.pendingModelUpdate = true;
			}
		} catch (error) {
			this.logService.warn('[SessionInputDraftService] Failed to restore session drafts', error);
		}
	}

	private _save(): void {
		const drafts: IStoredDraft[] = [];
		for (const [resource, entry] of this._drafts) {
			const draft = entry.state.get();
			if (draft.inputText || draft.attachments.length || entry.pendingModelUpdate) {
				drafts.push({ resource: resource.toString(), inputText: draft.inputText, attachments: draft.attachments.map(IChatRequestVariableEntry.toExport) });
			}
		}
		this.storageService.store(SessionInputDraftService.STORAGE_KEY, stringify(drafts), StorageScope.WORKSPACE, StorageTarget.MACHINE);
	}
}

registerSingleton(ISessionInputDraftService, SessionInputDraftService, InstantiationType.Delayed);
