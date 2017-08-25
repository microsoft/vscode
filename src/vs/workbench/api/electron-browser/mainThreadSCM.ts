/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import URI from 'vs/base/common/uri';
import Event, { Emitter } from 'vs/base/common/event';
import { assign } from 'vs/base/common/objects';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { ISCMService, ISCMRepository, ISCMProvider, ISCMResource, ISCMResourceGroup, ISCMResourceDecorations } from 'vs/workbench/services/scm/common/scm';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { ExtHostContext, MainThreadSCMShape, ExtHostSCMShape, SCMProviderFeatures, SCMRawResource, SCMGroupFeatures, MainContext, IExtHostContext } from '../node/extHost.protocol';
import { Command } from 'vs/editor/common/modes';
import { extHostNamedCustomer } from 'vs/workbench/api/electron-browser/extHostCustomers';

class MainThreadSCMResourceGroup implements ISCMResourceGroup {

	constructor(
		private sourceControlHandle: number,
		private handle: number,
		public provider: ISCMProvider,
		public features: SCMGroupFeatures,
		public label: string,
		public id: string,
		public resources: ISCMResource[]
	) { }

	toJSON(): any {
		return {
			$mid: 4,
			sourceControlHandle: this.sourceControlHandle,
			groupHandle: this.handle
		};
	}
}

class MainThreadSCMResource implements ISCMResource {

	constructor(
		private sourceControlHandle: number,
		private groupHandle: number,
		private handle: number,
		public sourceUri: URI,
		public command: Command | undefined,
		public resourceGroup: ISCMResourceGroup,
		public decorations: ISCMResourceDecorations
	) { }

	toJSON(): any {
		return {
			$mid: 3,
			sourceControlHandle: this.sourceControlHandle,
			groupHandle: this.groupHandle,
			handle: this.handle
		};
	}
}

class MainThreadSCMProvider implements ISCMProvider {

	private static ID_HANDLE = 0;
	private _id = `scm${MainThreadSCMProvider.ID_HANDLE++}`;
	get id(): string { return this._id; }

	private _groups: MainThreadSCMResourceGroup[] = [];
	private _groupsByHandle: { [handle: number]: MainThreadSCMResourceGroup; } = Object.create(null);

	get resources(): ISCMResourceGroup[] {
		return this._groups
			.filter(g => g.resources.length > 0 || !g.features.hideWhenEmpty);
	}

	private _onDidChange = new Emitter<void>();
	get onDidChange(): Event<void> { return this._onDidChange.event; }

	private features: SCMProviderFeatures = {};

	get handle(): number { return this._handle; }
	get label(): string { return this._label; }
	get contextValue(): string { return this._contextValue; }

	get commitTemplate(): string | undefined { return this.features.commitTemplate; }
	get acceptInputCommand(): Command | undefined { return this.features.acceptInputCommand; }
	get statusBarCommands(): Command[] | undefined { return this.features.statusBarCommands; }

	private _onDidChangeCommitTemplate = new Emitter<string>();
	get onDidChangeCommitTemplate(): Event<string> { return this._onDidChangeCommitTemplate.event; }

	private _count: number | undefined = undefined;
	get count(): number | undefined { return this._count; }

	constructor(
		private proxy: ExtHostSCMShape,
		private _handle: number,
		private _contextValue: string,
		private _label: string,
		@ISCMService scmService: ISCMService,
		@ICommandService private commandService: ICommandService
	) { }

	$updateSourceControl(features: SCMProviderFeatures): void {
		if ('count' in features) {
			this._count = features.count;
		}

		this.features = assign(this.features, features);
		this._onDidChange.fire();

		if (typeof features.commitTemplate !== 'undefined') {
			this._onDidChangeCommitTemplate.fire(this.commitTemplate);
		}
	}

	$registerGroup(handle: number, id: string, label: string): void {
		const group = new MainThreadSCMResourceGroup(
			this.handle,
			handle,
			this,
			{},
			label,
			id,
			[]
		);

		this._groups.push(group);
		this._groupsByHandle[handle] = group;
	}

	$updateGroup(handle: number, features: SCMGroupFeatures): void {
		const group = this._groupsByHandle[handle];

		if (!group) {
			return;
		}

		group.features = assign(group.features, features);
		this._onDidChange.fire();
	}

	$updateGroupLabel(handle: number, label: string): void {
		const group = this._groupsByHandle[handle];

		if (!group) {
			return;
		}

		group.label = label;
		this._onDidChange.fire();
	}

	$updateGroupResourceStates(groupHandle: number, resources: SCMRawResource[]): void {
		const group = this._groupsByHandle[groupHandle];

		if (!group) {
			return;
		}

		group.resources = resources.map(rawResource => {
			const [handle, sourceUri, command, icons, tooltip, strikeThrough, faded] = rawResource;
			const icon = icons[0];
			const iconDark = icons[1] || icon;
			const decorations = {
				icon: icon && URI.parse(icon),
				iconDark: iconDark && URI.parse(iconDark),
				tooltip,
				strikeThrough,
				faded
			};

			return new MainThreadSCMResource(
				this.handle,
				groupHandle,
				handle,
				URI.parse(sourceUri),
				command,
				group,
				decorations
			);
		});

		this._onDidChange.fire();
	}

	$unregisterGroup(handle: number): void {
		const group = this._groupsByHandle[handle];

		if (!group) {
			return;
		}

		delete this._groupsByHandle[handle];
		this._groups.splice(this._groups.indexOf(group), 1);
	}

	getOriginalResource(uri: URI): TPromise<URI> {
		if (!this.features.hasQuickDiffProvider) {
			return TPromise.as(null);
		}

		return this.proxy.$provideOriginalResource(this.handle, uri);
	}

	toJSON(): any {
		return {
			$mid: 5,
			handle: this.handle
		};
	}

	dispose(): void {

	}
}

@extHostNamedCustomer(MainContext.MainThreadSCM)
export class MainThreadSCM implements MainThreadSCMShape {

	private _proxy: ExtHostSCMShape;
	private _repositories: { [handle: number]: ISCMRepository; } = Object.create(null);
	private _inputDisposables: { [handle: number]: IDisposable; } = Object.create(null);
	private _disposables: IDisposable[] = [];

	constructor(
		extHostContext: IExtHostContext,
		@IInstantiationService private instantiationService: IInstantiationService,
		@ISCMService private scmService: ISCMService,
		@ICommandService private commandService: ICommandService
	) {
		this._proxy = extHostContext.get(ExtHostContext.ExtHostSCM);
	}

	dispose(): void {
		Object.keys(this._repositories)
			.forEach(id => this._repositories[id].dispose());
		this._repositories = Object.create(null);

		Object.keys(this._inputDisposables)
			.forEach(id => this._inputDisposables[id].dispose());
		this._inputDisposables = Object.create(null);

		this._disposables = dispose(this._disposables);
	}

	$registerSourceControl(handle: number, id: string, label: string): void {
		const provider = new MainThreadSCMProvider(this._proxy, handle, id, label, this.scmService, this.commandService);
		const repository = this.scmService.registerSCMProvider(provider);
		this._repositories[handle] = repository;

		const inputDisposable = repository.input.onDidChange(value => this._proxy.$onInputBoxValueChange(handle, value));
		this._inputDisposables[handle] = inputDisposable;
	}

	$updateSourceControl(handle: number, features: SCMProviderFeatures): void {
		const repository = this._repositories[handle];

		if (!repository) {
			return;
		}

		const provider = repository.provider as MainThreadSCMProvider;
		provider.$updateSourceControl(features);
	}

	$unregisterSourceControl(handle: number): void {
		const repository = this._repositories[handle];

		if (!repository) {
			return;
		}

		this._inputDisposables[handle].dispose();
		delete this._inputDisposables[handle];

		repository.dispose();
		delete this._repositories[handle];
	}

	$registerGroup(sourceControlHandle: number, groupHandle: number, id: string, label: string): void {
		const repository = this._repositories[sourceControlHandle];

		if (!repository) {
			return;
		}

		const provider = repository.provider as MainThreadSCMProvider;
		provider.$registerGroup(groupHandle, id, label);
	}

	$updateGroup(sourceControlHandle: number, groupHandle: number, features: SCMGroupFeatures): void {
		const repository = this._repositories[sourceControlHandle];

		if (!repository) {
			return;
		}

		const provider = repository.provider as MainThreadSCMProvider;
		provider.$updateGroup(groupHandle, features);
	}

	$updateGroupLabel(sourceControlHandle: number, groupHandle: number, label: string): void {
		const repository = this._repositories[sourceControlHandle];

		if (!repository) {
			return;
		}

		const provider = repository.provider as MainThreadSCMProvider;
		provider.$updateGroupLabel(groupHandle, label);
	}

	$updateGroupResourceStates(sourceControlHandle: number, groupHandle: number, resources: SCMRawResource[]): void {
		const repository = this._repositories[sourceControlHandle];

		if (!repository) {
			return;
		}

		const provider = repository.provider as MainThreadSCMProvider;
		provider.$updateGroupResourceStates(groupHandle, resources);
	}

	$unregisterGroup(sourceControlHandle: number, handle: number): void {
		const repository = this._repositories[sourceControlHandle];

		if (!repository) {
			return;
		}

		const provider = repository.provider as MainThreadSCMProvider;
		provider.$unregisterGroup(handle);
	}

	$setInputBoxValue(sourceControlHandle: number, value: string): void {
		const repository = this._repositories[sourceControlHandle];

		if (!repository) {
			return;
		}

		repository.input.value = value;
	}
}
