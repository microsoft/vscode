/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IStorageService, IStorageValueChangeEvent, StorageScope, StorageTarget } from '../../platform/storage/common/storage.js';
import { isEmptyObject } from '../../base/common/types.js';
import { onUnexpectedError } from '../../base/common/errors.js';
import { DisposableStore } from '../../base/common/lifecycle.js';
import { Event } from '../../base/common/event.js';

export type MementoObject = { [key: string]: any };

export class Memento {

	private static readonly applicationMementos = new Map<string, ScopedMemento>();
	private static readonly profileMementos = new Map<string, ScopedMemento>();
	private static readonly workspaceMementos = new Map<string, ScopedMemento>();

	private static readonly COMMON_PREFIX = 'memento/';

	private readonly id: string;

	constructor(id: string, private storageService: IStorageService) {
		this.id = Memento.COMMON_PREFIX + id;
	}

	getMemento(scope: StorageScope, target: StorageTarget): MementoObject {
		switch (scope) {
			case StorageScope.WORKSPACE: {
				let workspaceMemento = Memento.workspaceMementos.get(this.id);
				if (!workspaceMemento) {
					workspaceMemento = new ScopedMemento(this.id, scope, target, this.storageService);
					Memento.workspaceMementos.set(this.id, workspaceMemento);
				}

				return workspaceMemento.getMemento();
			}

			case StorageScope.PROFILE: {
				let profileMemento = Memento.profileMementos.get(this.id);
				if (!profileMemento) {
					profileMemento = new ScopedMemento(this.id, scope, target, this.storageService);
					Memento.profileMementos.set(this.id, profileMemento);
				}

				return profileMemento.getMemento();
			}

			case StorageScope.APPLICATION: {
				let applicationMemento = Memento.applicationMementos.get(this.id);
				if (!applicationMemento) {
					applicationMemento = new ScopedMemento(this.id, scope, target, this.storageService);
					Memento.applicationMementos.set(this.id, applicationMemento);
				}

				return applicationMemento.getMemento();
			}
		}
	}

	onDidChangeValue(scope: StorageScope, disposables: DisposableStore): Event<IStorageValueChangeEvent> {
		return this.storageService.onDidChangeValue(scope, this.id, disposables);
	}

	saveMemento(): void {
		Memento.workspaceMementos.get(this.id)?.save();
		Memento.profileMementos.get(this.id)?.save();
		Memento.applicationMementos.get(this.id)?.save();
	}

	reloadMemento(scope: StorageScope): void {
		let memento: ScopedMemento | undefined;
		switch (scope) {
			case StorageScope.APPLICATION:
				memento = Memento.applicationMementos.get(this.id);
				break;
			case StorageScope.PROFILE:
				memento = Memento.profileMementos.get(this.id);
				break;
			case StorageScope.WORKSPACE:
				memento = Memento.workspaceMementos.get(this.id);
				break;
		}

		memento?.reload();
	}

	static clear(scope: StorageScope): void {
		switch (scope) {
			case StorageScope.WORKSPACE:
				Memento.workspaceMementos.clear();
				break;
			case StorageScope.PROFILE:
				Memento.profileMementos.clear();
				break;
			case StorageScope.APPLICATION:
				Memento.applicationMementos.clear();
				break;
		}
	}
}

class ScopedMemento {

	private mementoObj: MementoObject;

	constructor(private id: string, private scope: StorageScope, private target: StorageTarget, private storageService: IStorageService) {
		this.mementoObj = this.doLoad();
	}

	private doLoad(): MementoObject {
		try {
			return this.storageService.getObject<MementoObject>(this.id, this.scope, {});
		} catch (error) {
			// Seeing reports from users unable to open editors
			// from memento parsing exceptions. Log the contents
			// to diagnose further
			// https://github.com/microsoft/vscode/issues/102251
			onUnexpectedError(`[memento]: failed to parse contents: ${error} (id: ${this.id}, scope: ${this.scope}, contents: ${this.storageService.get(this.id, this.scope)})`);
		}

		return {};
	}

	getMemento(): MementoObject {
		return this.mementoObj;
	}

	reload(): void {

		// Clear old
		for (const name of Object.getOwnPropertyNames(this.mementoObj)) {
			delete this.mementoObj[name];
		}

		// Assign new
		Object.assign(this.mementoObj, this.doLoad());
	}

	save(): void {
		if (!isEmptyObject(this.mementoObj)) {
			this.storageService.store(this.id, this.mementoObj, this.scope, this.target);
		} else {
			this.storageService.remove(this.id, this.scope);
		}
	}
}
