/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import URI from 'vs/base/common/uri';
import Event, { Emitter, once, EventMultiplexer } from 'vs/base/common/event';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';

export interface ISCMResource {
	uri: URI;
}

export interface ISCMResourceGroup {
	onChange: Event<void>;
	set(...resources: ISCMResource[]): void;
	get(): ISCMResource[];
}

export interface ISCMProvider extends IDisposable {
	onChange: Event<void>;
	resourceGroups: ISCMResourceGroup[];

	commit(message: string): TPromise<void>;
	click(uri: URI): TPromise<void>;
	drag(from: URI, to: URI): TPromise<void>;
	getOriginalResource(uri: URI): TPromise<URI>;
}

export class ResourceGroup implements ISCMResourceGroup, IDisposable {

	private resources: ISCMResource[] = [];

	private _onChange = new Emitter<void>();
	get onChange(): Event<void> { return this._onChange.event; }

	private _onDispose = new Emitter<void>();
	get onDispose(): Event<void> { return this._onDispose.event; }

	get id(): string { return this._id; }
	get label(): string { return this._label; }

	constructor(private _id: string, private _label: string) {

	}

	set(...resources: ISCMResource[]): void {
		this.resources = resources;
		this._onChange.fire();
	}

	get(): ISCMResource[] {
		return this.resources;
	}

	dispose(): void {
		this._onChange.dispose();
		this._onChange = null;
		this.resources = null;
	}
}

export abstract class SCMProvider implements ISCMProvider {

	private _onChange = new EventMultiplexer<void>();
	get onChange(): Event<void> { return this._onChange.event; }

	private onResourceGroupsChange = new Emitter<void>();

	private _resourceGroups: ResourceGroup[] = [];
	get resourceGroups(): ISCMResourceGroup[] { return this._resourceGroups; }

	private disposables: IDisposable[] = [];

	get id(): string { return this._id; }
	get label(): string { return this._label; }

	constructor(private _id: string, private _label: string) {

	}

	createResourceGroup(id: string, label: string): ISCMResourceGroup {
		const resourceGroup = new ResourceGroup(id, label);
		this._resourceGroups.push(resourceGroup);
		const onChangeListener = this._onChange.add(resourceGroup.onChange);

		once(resourceGroup.onDispose)(() => {
			onChangeListener.dispose();

			const idx = this._resourceGroups.indexOf(resourceGroup);
			this._resourceGroups.splice(idx, 1);

			this.onResourceGroupsChange.fire();
		});

		this.onResourceGroupsChange.fire();
		return resourceGroup;
	}

	abstract commit(message: string): TPromise<void>;
	abstract click(uri: URI): TPromise<void>;
	abstract drag(from: URI, to: URI): TPromise<void>;
	abstract getOriginalResource(uri: URI): TPromise<URI>;

	dispose(): void {
		this._onChange.dispose();
		this._resourceGroups = dispose(this._resourceGroups);
		this.disposables = dispose(this.disposables);
	}
}