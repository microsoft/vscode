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
import { IThreadService } from 'vs/workbench/services/thread/common/threadService';
import { ISCMService, ISCMProvider, ISCMResource, ISCMResourceGroup } from 'vs/workbench/services/scm/common/scm';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { ExtHostContext, MainThreadSCMShape, ExtHostSCMShape, SCMProviderFeatures, SCMRawResource, SCMGroupFeatures } from './extHost.protocol';
import { Command } from 'vs/editor/common/modes';

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
		public decorations
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
	get id(): string { return this._id; }

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
		private _id: string,
		private _label: string,
		@ISCMService scmService: ISCMService,
		@ICommandService private commandService: ICommandService
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

	$updateGroupResourceStates(groupHandle: number, resources: SCMRawResource[]): void {
		const group = this._groupsByHandle[groupHandle];

		if (!group) {
			return;
		}

		group.resources = resources.map(rawResource => {
			const [handle, sourceUri, command, icons, strikeThrough] = rawResource;
			const icon = icons[0];
			const iconDark = icons[1] || icon;
			const decorations = {
				icon: icon && URI.parse(icon),
				iconDark: iconDark && URI.parse(iconDark),
				strikeThrough
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

	dispose(): void {

	}
}

export class MainThreadSCM extends MainThreadSCMShape {

	private _proxy: ExtHostSCMShape;
	private _sourceControls: { [handle: number]: MainThreadSCMProvider; } = Object.create(null);
	private _sourceControlDisposables: { [handle: number]: IDisposable; } = Object.create(null);
	private _disposables: IDisposable[] = [];

	constructor(
		@IThreadService threadService: IThreadService,
		@IInstantiationService private instantiationService: IInstantiationService,
		@ISCMService private scmService: ISCMService,
		@ICommandService private commandService: ICommandService
	) {
		super();
		this._proxy = threadService.get(ExtHostContext.ExtHostSCM);

		this.scmService.onDidChangeProvider(this.onDidChangeProvider, this, this._disposables);
		this.scmService.input.onDidChange(this._proxy.$onInputBoxValueChange, this._proxy, this._disposables);
	}

	$registerSourceControl(handle: number, id: string, label: string): void {
		const provider = new MainThreadSCMProvider(this._proxy, handle, id, label, this.scmService, this.commandService);
		this._sourceControls[handle] = provider;
		this._sourceControlDisposables[handle] = this.scmService.registerSCMProvider(provider);
	}

	$updateSourceControl(handle: number, features: SCMProviderFeatures): void {
		const sourceControl = this._sourceControls[handle];

		if (!sourceControl) {
			return;
		}

		sourceControl.$updateSourceControl(features);
	}

	$unregisterSourceControl(handle: number): void {
		const sourceControl = this._sourceControls[handle];

		if (!sourceControl) {
			return;
		}

		this._sourceControlDisposables[handle].dispose();
		delete this._sourceControlDisposables[handle];

		sourceControl.dispose();
		delete this._sourceControls[handle];
	}

	$registerGroup(sourceControlHandle: number, groupHandle: number, id: string, label: string): void {
		const provider = this._sourceControls[sourceControlHandle];

		if (!provider) {
			return;
		}

		provider.$registerGroup(groupHandle, id, label);
	}

	$updateGroup(sourceControlHandle: number, groupHandle: number, features: SCMGroupFeatures): void {
		const provider = this._sourceControls[sourceControlHandle];

		if (!provider) {
			return;
		}

		provider.$updateGroup(groupHandle, features);
	}

	$updateGroupResourceStates(sourceControlHandle: number, groupHandle: number, resources: SCMRawResource[]): void {
		const provider = this._sourceControls[sourceControlHandle];

		if (!provider) {
			return;
		}

		provider.$updateGroupResourceStates(groupHandle, resources);
	}

	$unregisterGroup(sourceControlHandle: number, handle: number): void {
		const provider = this._sourceControls[sourceControlHandle];

		if (!provider) {
			return;
		}

		provider.$unregisterGroup(handle);
	}

	$setInputBoxValue(value: string): void {
		this.scmService.input.value = value;
	}

	private onDidChangeProvider(provider: ISCMProvider): void {
		const handle = Object.keys(this._sourceControls).filter(handle => this._sourceControls[handle] === provider)[0];
		this._proxy.$onActiveSourceControlChange(handle && parseInt(handle));
	}

	dispose(): void {
		Object.keys(this._sourceControls)
			.forEach(id => this._sourceControls[id].dispose());

		this._sourceControls = Object.create(null);
		this._disposables = dispose(this._disposables);
	}
}
