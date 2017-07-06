/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import types = require('vs/base/common/types');
import { IStorageService, StorageScope } from 'vs/platform/storage/common/storage';

/**
 * Supported memento scopes.
 */
export enum Scope {

	/**
	 * The memento will be scoped to all workspaces of this domain.
	 */
	GLOBAL,

	/**
	 * The memento will be scoped to the current workspace.
	 */
	WORKSPACE
}

/**
 * A memento provides access to a datastructure that is persisted and restored as part of the workbench lifecycle.
 */
export class Memento {

	// Mementos are static to ensure that for a given component with an id only ever one memento gets loaded
	private static globalMementos: { [id: string]: ScopedMemento } = {};
	private static workspaceMementos: { [id: string]: ScopedMemento } = {};

	private static COMMON_PREFIX = 'memento/';

	private id: string;

	constructor(id: string) {
		this.id = Memento.COMMON_PREFIX + id.toLowerCase();
	}

	/**
	 * Returns a JSON Object that represents the data of this memento. The optional
	 * parameter scope allows to specify the scope of the memento to load. If not
	 * provided, the scope will be global, Memento.Scope.WORKSPACE can be used to
	 * scope the memento to the workspace.
	 */
	public getMemento(storageService: IStorageService, scope: Scope = Scope.GLOBAL): object {

		// Scope by Workspace
		if (scope === Scope.WORKSPACE) {
			let workspaceMemento = Memento.workspaceMementos[this.id];
			if (!workspaceMemento) {
				workspaceMemento = new ScopedMemento(this.id, scope, storageService);
				Memento.workspaceMementos[this.id] = workspaceMemento;
			}

			return workspaceMemento.getMemento();
		}

		// Use global scope
		let globalMemento = Memento.globalMementos[this.id];
		if (!globalMemento) {
			globalMemento = new ScopedMemento(this.id, scope, storageService);
			Memento.globalMementos[this.id] = globalMemento;
		}

		return globalMemento.getMemento();
	}

	/**
	 * Saves all data of the mementos that have been loaded to the local storage. This includes
	 * global and workspace scope.
	 */
	public saveMemento(): void {

		// Global
		if (Memento.globalMementos[this.id]) {
			Memento.globalMementos[this.id].save();
		}

		// Workspace
		if (Memento.workspaceMementos[this.id]) {
			Memento.workspaceMementos[this.id].save();
		}
	}
}

class ScopedMemento {
	private id: string;
	private mementoObj: object;
	private scope: Scope;

	constructor(id: string, scope: Scope, private storageService: IStorageService) {
		this.id = id;
		this.scope = scope;
		this.mementoObj = this.loadMemento();
	}

	public getMemento(): object {
		return this.mementoObj;
	}

	private loadMemento(): object {
		let storageScope = this.scope === Scope.GLOBAL ? StorageScope.GLOBAL : StorageScope.WORKSPACE;
		let memento = this.storageService.get(this.id, storageScope);
		if (memento) {
			return JSON.parse(memento);
		}

		return {};
	}

	public save(): void {
		let storageScope = this.scope === Scope.GLOBAL ? StorageScope.GLOBAL : StorageScope.WORKSPACE;

		if (!types.isEmptyObject(this.mementoObj)) {
			this.storageService.store(this.id, JSON.stringify(this.mementoObj), storageScope);
		} else {
			this.storageService.remove(this.id, storageScope);
		}
	}
}