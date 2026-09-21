/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BugIndicatingError } from '../../../../base/common/errors.js';
import { Disposable, DisposableMap, DisposableStore, IReference, toDisposable } from '../../../../base/common/lifecycle.js';
import { LinkedMap } from '../../../../base/common/map.js';
import { getComparisonKey, isEqual } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { ITextModel } from '../../../../editor/common/model.js';
import { createDecorator, IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { localize } from '../../../../nls.js';
import { MultiDiffEditorInput } from '../../../../workbench/contrib/multiDiffEditor/browser/multiDiffEditorInput.js';
import { ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';
import { ISessionChangesService } from '../common/sessionChangesService.js';

export const ISessionChangesModelService = createDecorator<ISessionChangesModelService>('sessionChangesModelService');

export interface ISessionChangesModelService {
	readonly _serviceBrand: undefined;
	acquire(resource: URI): IReference<MultiDiffEditorInput>;
}

interface ICachedChangesModel {
	readonly key: string;
	readonly sessionResource: URI | undefined;
	readonly input: MultiDiffEditorInput;
	references: number;
	invalidated: boolean;
}

/** Shares live Changes models across editor inputs, retaining a bounded working set of inactive models. */
export class SessionChangesModelService extends Disposable implements ISessionChangesModelService {
	declare readonly _serviceBrand: undefined;

	private readonly _entries = new Map<string, ICachedChangesModel>();
	private readonly _inputs = this._register(new DisposableMap<string, MultiDiffEditorInput>());
	private readonly _idle = new LinkedMap<string, ICachedChangesModel>();
	private readonly _idleListeners = this._register(new DisposableMap<string, DisposableStore>());

	constructor(
		private readonly _limits = { inputs: 3, textBytes: 16 * 1024 * 1024 },
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@ISessionChangesService private readonly _sessionChangesService: ISessionChangesService,
		@ISessionsManagementService sessionsManagementService: ISessionsManagementService,
	) {
		super();
		this._register(sessionsManagementService.onDidChangeSessions(event => {
			for (const session of [...event.removed, ...event.changed.filter(session => session.isArchived.get())]) {
				for (const entry of this._entries.values()) {
					if (isEqual(entry.sessionResource, session.resource)) {
						entry.invalidated = true;
						if (entry.references === 0) {
							this._remove(entry);
						}
					}
				}
			}
		}));
	}

	acquire(resource: URI): IReference<MultiDiffEditorInput> {
		if (this._store.isDisposed) {
			throw new BugIndicatingError('Cannot acquire a disposed Changes model cache');
		}
		const key = getComparisonKey(resource);
		let entry = this._entries.get(key);
		if (!entry) {
			const input = MultiDiffEditorInput.fromResourceMultiDiffEditorInput({
				multiDiffSource: resource,
				label: localize('sessionChangesEditor.name', "Changes"),
			}, this._instantiationService);
			this._inputs.set(key, input);
			entry = { key, sessionResource: this._sessionChangesService.getSessionResource(resource), input, references: 0, invalidated: false };
			this._entries.set(key, entry);
		}
		this._idle.delete(key);
		this._idleListeners.deleteAndDispose(key);
		entry.references++;
		const acquired = entry;
		return Object.assign(toDisposable(() => this._release(acquired)), { object: entry.input });
	}

	private _release(entry: ICachedChangesModel): void {
		if (this._store.isDisposed || --entry.references > 0) {
			return;
		}
		if (entry.invalidated || !entry.input.getViewModelIfResolved()) {
			this._remove(entry);
			return;
		}
		this._idle.set(entry.key, entry);
		const listeners = new DisposableStore();
		this._idleListeners.set(entry.key, listeners);
		for (const model of this._textModels(entry)) {
			listeners.add(model.onDidChangeContent(() => this._trim()));
		}
		this._trim();
	}

	private _textModels(entry: ICachedChangesModel): Set<ITextModel> {
		const models = new Set<ITextModel>();
		for (const item of entry.input.getViewModelIfResolved()?.items.get() ?? []) {
			for (const source of [item.documentDiffItem.original, item.documentDiffItem.modified]) {
				if (source?.textModel) {
					models.add(source.textModel);
				}
			}
		}
		return models;
	}

	private _retainedTextBytes(): number {
		const models = new Set<ITextModel>();
		for (const entry of this._idle.values()) {
			for (const model of this._textModels(entry)) {
				models.add(model);
			}
		}
		let bytes = 0;
		for (const model of models) {
			bytes += model.getValueLength() * 2;
		}
		return bytes;
	}

	private _trim(): void {
		while (this._idle.size > this._limits.inputs || this._retainedTextBytes() > this._limits.textBytes) {
			const oldest = this._idle.first;
			if (!oldest) {
				break;
			}
			this._remove(oldest);
		}
	}

	private _remove(entry: ICachedChangesModel): void {
		this._entries.delete(entry.key);
		this._idle.delete(entry.key);
		this._idleListeners.deleteAndDispose(entry.key);
		this._inputs.deleteAndDispose(entry.key);
	}

	override dispose(): void {
		this._entries.clear();
		this._idle.clear();
		super.dispose();
	}
}
