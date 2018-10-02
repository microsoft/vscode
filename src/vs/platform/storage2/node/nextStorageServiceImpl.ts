/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { INextStorageService, INextStorageServiceChangeEvent, WorkspaceIdentifier } from 'vs/platform/storage2/common/nextStorageService';
import { Disposable } from 'vs/base/common/lifecycle';
import { Event, Emitter } from 'vs/base/common/event';
import { INextWorkspaceStorageService, NextStorageScope } from 'vs/platform/storage2/common/nextWorkspaceStorageService';
import { isUndefinedOrNull } from 'vs/base/common/types';

export class NextStorageServiceImpl extends Disposable implements INextStorageService {
	_serviceBrand: any;

	private _onDidChangeStorage: Emitter<INextStorageServiceChangeEvent> = this._register(new Emitter<INextStorageServiceChangeEvent>());
	get onDidChangeStorage(): Event<INextStorageServiceChangeEvent> { return this._onDidChangeStorage.event; }

	constructor() {
		super();
	}

	set(key: string, value: string, workspace?: WorkspaceIdentifier): void {

	}

	get(key: string, workspace?: WorkspaceIdentifier): string {

	}

	delete(key: string, workspace?: WorkspaceIdentifier): void {

	}
}

export class NextWorkspaceStorageServiceImpl extends Disposable implements INextWorkspaceStorageService {
	_serviceBrand: any;

	private _onDidChangeStorage: Emitter<NextStorageScope> = this._register(new Emitter<NextStorageScope>());
	get onDidChangeStorage(): Event<NextStorageScope> { return this._onDidChangeStorage.event; }

	constructor(private workspaceId: WorkspaceIdentifier, private nextStorageService: INextStorageService) {
		super();

		this.registerListeners();
	}

	private registerListeners(): void {
		this._register(this.nextStorageService.onDidChangeStorage(event => {
			if (event.workspace && event.workspace !== this.workspaceId) {
				return; // ignore events for other workspaces
			}

			// Re-emit events from base storage service
			this._onDidChangeStorage.fire(event.workspace ? NextStorageScope.WORKSPACE : NextStorageScope.GLOBAL);
		}));
	}

	set(key: string, value: any, scope?: NextStorageScope): void {

		// We remove the key for undefined/null values
		if (isUndefinedOrNull(value)) {
			this.delete(key, scope);
		}

		// Otherwise, convert to String and store
		else {
			const valueStr = String(value);

			this.nextStorageService.set(key, valueStr, this.asWorkspaceId(scope));
		}
	}

	get(key: string, scope?: NextStorageScope, fallbackValue?: any): string {
		const value = this.nextStorageService.get(key, this.asWorkspaceId(scope));

		if (isUndefinedOrNull(value)) {
			return fallbackValue;
		}

		return value;
	}

	getBoolean(key: string, scope?: NextStorageScope, fallbackValue?: boolean): boolean {
		const value = this.get(key, scope);

		if (isUndefinedOrNull(value)) {
			return fallbackValue;
		}

		return value === 'true';
	}

	getInteger(key: string, scope?: NextStorageScope, fallbackValue?: number): number {
		const value = this.get(key, scope);

		if (isUndefinedOrNull(value)) {
			return fallbackValue;
		}

		return parseInt(value, 10);
	}

	delete(key: string, scope?: NextStorageScope): void {
		this.nextStorageService.delete(key, scope === NextStorageScope.WORKSPACE ? this.workspaceId : void 0);
	}

	private asWorkspaceId(scope?: NextStorageScope): string {
		return scope === NextStorageScope.WORKSPACE ? this.workspaceId : void 0;
	}
}