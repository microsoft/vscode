/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import URI, { UriComponents } from 'vs/base/common/uri';
import Event, { Emitter } from 'vs/base/common/event';
import { assign } from 'vs/base/common/objects';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { ISCMService, ISCMRepository, ISCMProvider, ISCMResource, ISCMResourceGroup, ISCMResourceDecorations, IInputValidation } from 'vs/workbench/services/scm/common/scm';
import { ExtHostContext, MainThreadSCMShape, ExtHostSCMShape, SCMProviderFeatures, SCMRawResourceSplices, SCMGroupFeatures, MainContext, IExtHostContext } from '../node/extHost.protocol';
import { Command } from 'vs/editor/common/modes';
import { extHostNamedCustomer } from 'vs/workbench/api/electron-browser/extHostCustomers';
import { ISplice, Sequence } from 'vs/base/common/sequence';

class MainThreadSCMResourceGroup implements ISCMResourceGroup {

	readonly elements: ISCMResource[] = [];

	private _onDidSplice = new Emitter<ISplice<ISCMResource>>();
	readonly onDidSplice = this._onDidSplice.event;

	get hideWhenEmpty(): boolean { return this.features.hideWhenEmpty; }

	private _onDidChange = new Emitter<void>();
	get onDidChange(): Event<void> { return this._onDidChange.event; }

	constructor(
		private sourceControlHandle: number,
		private handle: number,
		public provider: ISCMProvider,
		public features: SCMGroupFeatures,
		public label: string,
		public id: string
	) { }

	toJSON(): any {
		return {
			$mid: 4,
			sourceControlHandle: this.sourceControlHandle,
			groupHandle: this.handle
		};
	}

	splice(start: number, deleteCount: number, toInsert: ISCMResource[]) {
		this.elements.splice(start, deleteCount, ...toInsert);
		this._onDidSplice.fire({ start, deleteCount, toInsert });
	}

	$updateGroup(features: SCMGroupFeatures): void {
		this.features = assign(this.features, features);
		this._onDidChange.fire();
	}

	$updateGroupLabel(label: string): void {
		this.label = label;
		this._onDidChange.fire();
	}
}

class MainThreadSCMResource implements ISCMResource {

	constructor(
		private proxy: ExtHostSCMShape,
		private sourceControlHandle: number,
		private groupHandle: number,
		private handle: number,
		public sourceUri: URI,
		public resourceGroup: ISCMResourceGroup,
		public decorations: ISCMResourceDecorations
	) { }

	open(): TPromise<void> {
		return this.proxy.$executeResourceCommand(this.sourceControlHandle, this.groupHandle, this.handle);
	}

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

	readonly groups = new Sequence<MainThreadSCMResourceGroup>();
	private _groupsByHandle: { [handle: number]: MainThreadSCMResourceGroup; } = Object.create(null);

	// get groups(): ISequence<ISCMResourceGroup> {
	// 	return {
	// 		elements: this._groups,
	// 		onDidSplice: this._onDidSplice.event
	// 	};

	// 	// return this._groups
	// 	// 	.filter(g => g.resources.elements.length > 0 || !g.features.hideWhenEmpty);
	// }

	private _onDidChangeResources = new Emitter<void>();
	get onDidChangeResources(): Event<void> { return this._onDidChangeResources.event; }

	private features: SCMProviderFeatures = {};

	get handle(): number { return this._handle; }
	get label(): string { return this._label; }
	get rootUri(): URI | undefined { return this._rootUri; }
	get contextValue(): string { return this._contextValue; }

	get commitTemplate(): string | undefined { return this.features.commitTemplate; }
	get acceptInputCommand(): Command | undefined { return this.features.acceptInputCommand; }
	get statusBarCommands(): Command[] | undefined { return this.features.statusBarCommands; }
	get count(): number | undefined { return this.features.count; }

	private _onDidChangeCommitTemplate = new Emitter<string>();
	get onDidChangeCommitTemplate(): Event<string> { return this._onDidChangeCommitTemplate.event; }

	private _onDidChange = new Emitter<void>();
	get onDidChange(): Event<void> { return this._onDidChange.event; }

	constructor(
		private proxy: ExtHostSCMShape,
		private _handle: number,
		private _contextValue: string,
		private _label: string,
		private _rootUri: URI | undefined,
		@ISCMService scmService: ISCMService
	) { }

	$updateSourceControl(features: SCMProviderFeatures): void {
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
			id
		);

		this._groupsByHandle[handle] = group;
		this.groups.splice(this.groups.elements.length, 0, [group]);
	}

	$updateGroup(handle: number, features: SCMGroupFeatures): void {
		const group = this._groupsByHandle[handle];

		if (!group) {
			return;
		}

		group.$updateGroup(features);
	}

	$updateGroupLabel(handle: number, label: string): void {
		const group = this._groupsByHandle[handle];

		if (!group) {
			return;
		}

		group.$updateGroupLabel(label);
	}

	$spliceGroupResourceStates(splices: SCMRawResourceSplices[]): void {
		for (const [groupHandle, groupSlices] of splices) {
			const group = this._groupsByHandle[groupHandle];

			if (!group) {
				console.warn(`SCM group ${groupHandle} not found in provider ${this.label}`);
				continue;
			}

			// reverse the splices sequence in order to apply them correctly
			groupSlices.reverse();

			for (const [start, deleteCount, rawResources] of groupSlices) {
				const resources = rawResources.map(rawResource => {
					const [handle, sourceUri, icons, tooltip, strikeThrough, faded, source, letter, color] = rawResource;
					const icon = icons[0];
					const iconDark = icons[1] || icon;
					const decorations = {
						icon: icon && URI.parse(icon),
						iconDark: iconDark && URI.parse(iconDark),
						tooltip,
						strikeThrough,
						faded,
						source,
						letter,
						color: color && color.id
					};

					return new MainThreadSCMResource(
						this.proxy,
						this.handle,
						groupHandle,
						handle,
						URI.revive(sourceUri),
						group,
						decorations
					);
				});

				group.splice(start, deleteCount, resources);
			}
		}

		this._onDidChangeResources.fire();
	}

	$unregisterGroup(handle: number): void {
		const group = this._groupsByHandle[handle];

		if (!group) {
			return;
		}

		delete this._groupsByHandle[handle];
		this.groups.splice(this.groups.elements.indexOf(group), 1);
	}

	getOriginalResource(uri: URI): TPromise<URI> {
		if (!this.features.hasQuickDiffProvider) {
			return TPromise.as(null);
		}

		return this.proxy.$provideOriginalResource(this.handle, uri)
			.then(result => result && URI.revive(result));
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
		@ISCMService private scmService: ISCMService
	) {
		this._proxy = extHostContext.getProxy(ExtHostContext.ExtHostSCM);
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

	$registerSourceControl(handle: number, id: string, label: string, rootUri: UriComponents | undefined): void {
		const provider = new MainThreadSCMProvider(this._proxy, handle, id, label, rootUri && URI.revive(rootUri), this.scmService);
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

	$spliceResourceStates(sourceControlHandle: number, splices: SCMRawResourceSplices[]): void {
		const repository = this._repositories[sourceControlHandle];

		if (!repository) {
			return;
		}

		const provider = repository.provider as MainThreadSCMProvider;
		provider.$spliceGroupResourceStates(splices);
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

	$setInputBoxPlaceholder(sourceControlHandle: number, placeholder: string): void {
		const repository = this._repositories[sourceControlHandle];

		if (!repository) {
			return;
		}

		repository.input.placeholder = placeholder;
	}

	$setValidationProviderIsEnabled(sourceControlHandle: number, enabled: boolean): void {
		const repository = this._repositories[sourceControlHandle];

		if (!repository) {
			return;
		}

		if (enabled) {
			repository.input.validateInput = async (value, pos): TPromise<IInputValidation | undefined> => {
				const result = await this._proxy.$validateInput(sourceControlHandle, value, pos);

				if (!result) {
					return undefined;
				}

				return {
					message: result[0],
					type: result[1]
				};
			};
		} else {
			repository.input.validateInput = () => TPromise.as(undefined);
		}
	}
}
