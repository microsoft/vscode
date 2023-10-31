/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI, UriComponents } from 'vs/base/common/uri';
import { Event, Emitter } from 'vs/base/common/event';
import { IDisposable, DisposableStore, combinedDisposable, dispose } from 'vs/base/common/lifecycle';
import { ISCMService, ISCMRepository, ISCMProvider, ISCMResource, ISCMResourceGroup, ISCMResourceDecorations, IInputValidation, ISCMViewService, InputValidationType, ISCMActionButtonDescriptor } from 'vs/workbench/contrib/scm/common/scm';
import { ExtHostContext, MainThreadSCMShape, ExtHostSCMShape, SCMProviderFeatures, SCMRawResourceSplices, SCMGroupFeatures, MainContext, SCMHistoryItemDto, SCMActionButtonDto, SCMHistoryItemGroupDto } from '../common/extHost.protocol';
import { Command } from 'vs/editor/common/languages';
import { extHostNamedCustomer, IExtHostContext } from 'vs/workbench/services/extensions/common/extHostCustomers';
import { ISplice, Sequence } from 'vs/base/common/sequence';
import { CancellationToken } from 'vs/base/common/cancellation';
import { MarshalledId } from 'vs/base/common/marshallingIds';
import { ThemeIcon } from 'vs/base/common/themables';
import { IMarkdownString } from 'vs/base/common/htmlContent';
import { IQuickDiffService, QuickDiffProvider } from 'vs/workbench/contrib/scm/common/quickDiff';
import { ISCMHistoryItem, ISCMHistoryItemChange, ISCMHistoryItemGroup, ISCMHistoryOptions, ISCMHistoryProvider } from 'vs/workbench/contrib/scm/common/history';

function getSCMHistoryItemIcon(historyItem: SCMHistoryItemDto): URI | { light: URI; dark: URI } | ThemeIcon | undefined {
	if (!historyItem.icon) {
		return undefined;
	} else if (URI.isUri(historyItem.icon)) {
		return URI.revive(historyItem.icon);
	} else if (ThemeIcon.isThemeIcon(historyItem.icon)) {
		return historyItem.icon;
	} else {
		const icon = historyItem.icon as { light: UriComponents; dark: UriComponents };
		return { light: URI.revive(icon.light), dark: URI.revive(icon.dark) };
	}
}

class MainThreadSCMResourceGroup implements ISCMResourceGroup {

	readonly elements: ISCMResource[] = [];

	private readonly _onDidSplice = new Emitter<ISplice<ISCMResource>>();
	readonly onDidSplice = this._onDidSplice.event;

	get hideWhenEmpty(): boolean { return !!this.features.hideWhenEmpty; }

	private readonly _onDidChange = new Emitter<void>();
	readonly onDidChange: Event<void> = this._onDidChange.event;

	constructor(
		private readonly sourceControlHandle: number,
		private readonly handle: number,
		public provider: ISCMProvider,
		public features: SCMGroupFeatures,
		public label: string,
		public id: string
	) { }

	toJSON(): any {
		return {
			$mid: MarshalledId.ScmResourceGroup,
			sourceControlHandle: this.sourceControlHandle,
			groupHandle: this.handle
		};
	}

	splice(start: number, deleteCount: number, toInsert: ISCMResource[]) {
		this.elements.splice(start, deleteCount, ...toInsert);
		this._onDidSplice.fire({ start, deleteCount, toInsert });
	}

	$updateGroup(features: SCMGroupFeatures): void {
		this.features = { ...this.features, ...features };
		this._onDidChange.fire();
	}

	$updateGroupLabel(label: string): void {
		this.label = label;
		this._onDidChange.fire();
	}
}

class MainThreadSCMResource implements ISCMResource {

	constructor(
		private readonly proxy: ExtHostSCMShape,
		private readonly sourceControlHandle: number,
		private readonly groupHandle: number,
		private readonly handle: number,
		readonly sourceUri: URI,
		readonly resourceGroup: ISCMResourceGroup,
		readonly decorations: ISCMResourceDecorations,
		readonly contextValue: string | undefined,
		readonly command: Command | undefined
	) { }

	open(preserveFocus: boolean): Promise<void> {
		return this.proxy.$executeResourceCommand(this.sourceControlHandle, this.groupHandle, this.handle, preserveFocus);
	}

	toJSON(): any {
		return {
			$mid: MarshalledId.ScmResource,
			sourceControlHandle: this.sourceControlHandle,
			groupHandle: this.groupHandle,
			handle: this.handle
		};
	}
}

class MainThreadSCMHistoryProvider implements ISCMHistoryProvider {

	private _onDidChangeActionButton = new Emitter<void>();
	readonly onDidChangeActionButton = this._onDidChangeActionButton.event;

	private _onDidChangeCurrentHistoryItemGroup = new Emitter<void>();
	readonly onDidChangeCurrentHistoryItemGroup = this._onDidChangeCurrentHistoryItemGroup.event;

	private _actionButton: ISCMActionButtonDescriptor | undefined;
	get actionButton(): ISCMActionButtonDescriptor | undefined { return this._actionButton; }
	set actionButton(actionButton: ISCMActionButtonDescriptor | undefined) {
		this._actionButton = actionButton;
		this._onDidChangeActionButton.fire();
	}

	private _currentHistoryItemGroup: ISCMHistoryItemGroup | undefined;
	get currentHistoryItemGroup(): ISCMHistoryItemGroup | undefined { return this._currentHistoryItemGroup; }
	set currentHistoryItemGroup(historyItemGroup: ISCMHistoryItemGroup | undefined) {
		this._currentHistoryItemGroup = historyItemGroup;
		this._onDidChangeCurrentHistoryItemGroup.fire();
	}

	constructor(private readonly proxy: ExtHostSCMShape, private readonly handle: number) { }

	async resolveHistoryItemGroupBase(historyItemGroupId: string): Promise<ISCMHistoryItemGroup | undefined> {
		return this.proxy.$resolveHistoryItemGroupBase(this.handle, historyItemGroupId, CancellationToken.None);
	}

	async resolveHistoryItemGroupCommonAncestor(historyItemGroupId1: string, historyItemGroupId2: string): Promise<{ id: string; ahead: number; behind: number } | undefined> {
		return this.proxy.$resolveHistoryItemGroupCommonAncestor(this.handle, historyItemGroupId1, historyItemGroupId2, CancellationToken.None);
	}

	async provideHistoryItems(historyItemGroupId: string, options: ISCMHistoryOptions): Promise<ISCMHistoryItem[] | undefined> {
		const historyItems = await this.proxy.$provideHistoryItems(this.handle, historyItemGroupId, options, CancellationToken.None);
		return historyItems?.map(historyItem => ({ ...historyItem, icon: getSCMHistoryItemIcon(historyItem), }));
	}

	async provideHistoryItemChanges(historyItemId: string): Promise<ISCMHistoryItemChange[] | undefined> {
		const changes = await this.proxy.$provideHistoryItemChanges(this.handle, historyItemId, CancellationToken.None);
		return changes?.map(change => ({
			uri: URI.revive(change.uri),
			originalUri: change.originalUri && URI.revive(change.originalUri),
			modifiedUri: change.modifiedUri && URI.revive(change.modifiedUri),
			renameUri: change.renameUri && URI.revive(change.renameUri)
		}));
	}

}

class MainThreadSCMProvider implements ISCMProvider, QuickDiffProvider {

	private static ID_HANDLE = 0;
	private _id = `scm${MainThreadSCMProvider.ID_HANDLE++}`;
	get id(): string { return this._id; }

	readonly groups = new Sequence<MainThreadSCMResourceGroup>();
	private readonly _groupsByHandle: { [handle: number]: MainThreadSCMResourceGroup } = Object.create(null);

	// get groups(): ISequence<ISCMResourceGroup> {
	// 	return {
	// 		elements: this._groups,
	// 		onDidSplice: this._onDidSplice.event
	// 	};

	// 	// return this._groups
	// 	// 	.filter(g => g.resources.elements.length > 0 || !g.features.hideWhenEmpty);
	// }

	private readonly _onDidChangeResources = new Emitter<void>();
	readonly onDidChangeResources: Event<void> = this._onDidChangeResources.event;

	private features: SCMProviderFeatures = {};

	get handle(): number { return this._handle; }
	get label(): string { return this._label; }
	get rootUri(): URI | undefined { return this._rootUri; }
	get inputBoxDocumentUri(): URI { return this._inputBoxDocumentUri; }
	get contextValue(): string { return this._contextValue; }

	get commitTemplate(): string { return this.features.commitTemplate || ''; }
	get historyProvider(): ISCMHistoryProvider | undefined { return this._historyProvider; }
	get acceptInputCommand(): Command | undefined { return this.features.acceptInputCommand; }
	get actionButton(): ISCMActionButtonDescriptor | undefined { return this.features.actionButton ?? undefined; }
	get statusBarCommands(): Command[] | undefined { return this.features.statusBarCommands; }
	get count(): number | undefined { return this.features.count; }

	private readonly _onDidChangeCommitTemplate = new Emitter<string>();
	readonly onDidChangeCommitTemplate: Event<string> = this._onDidChangeCommitTemplate.event;

	private readonly _onDidChangeStatusBarCommands = new Emitter<readonly Command[]>();
	get onDidChangeStatusBarCommands(): Event<readonly Command[]> { return this._onDidChangeStatusBarCommands.event; }

	private readonly _onDidChangeHistoryProvider = new Emitter<void>();
	readonly onDidChangeHistoryProvider: Event<void> = this._onDidChangeHistoryProvider.event;

	private readonly _onDidChange = new Emitter<void>();
	readonly onDidChange: Event<void> = this._onDidChange.event;

	private _quickDiff: IDisposable | undefined;
	public readonly isSCM: boolean = true;

	private _historyProvider: ISCMHistoryProvider | undefined;

	constructor(
		private readonly proxy: ExtHostSCMShape,
		private readonly _handle: number,
		private readonly _contextValue: string,
		private readonly _label: string,
		private readonly _rootUri: URI | undefined,
		private readonly _inputBoxDocumentUri: URI,
		private readonly _quickDiffService: IQuickDiffService
	) { }

	$updateSourceControl(features: SCMProviderFeatures): void {
		this.features = { ...this.features, ...features };
		this._onDidChange.fire();

		if (typeof features.commitTemplate !== 'undefined') {
			this._onDidChangeCommitTemplate.fire(this.commitTemplate!);
		}

		if (typeof features.statusBarCommands !== 'undefined') {
			this._onDidChangeStatusBarCommands.fire(this.statusBarCommands!);
		}

		if (features.hasQuickDiffProvider && !this._quickDiff) {
			this._quickDiff = this._quickDiffService.addQuickDiffProvider({
				label: features.quickDiffLabel ?? this.label,
				rootUri: this.rootUri,
				isSCM: this.isSCM,
				getOriginalResource: (uri: URI) => this.getOriginalResource(uri)
			});
		} else if (features.hasQuickDiffProvider === false && this._quickDiff) {
			this._quickDiff.dispose();
			this._quickDiff = undefined;
		}

		if (features.hasHistoryProvider && !this._historyProvider) {
			this._historyProvider = new MainThreadSCMHistoryProvider(this.proxy, this.handle);
			this._onDidChangeHistoryProvider.fire();
		} else if (features.hasHistoryProvider === false && this._historyProvider) {
			this._historyProvider = undefined;
			this._onDidChangeHistoryProvider.fire();
		}
	}

	$registerGroups(_groups: [number /*handle*/, string /*id*/, string /*label*/, SCMGroupFeatures][]): void {
		const groups = _groups.map(([handle, id, label, features]) => {
			const group = new MainThreadSCMResourceGroup(
				this.handle,
				handle,
				this,
				features,
				label,
				id
			);

			this._groupsByHandle[handle] = group;
			return group;
		});

		this.groups.splice(this.groups.elements.length, 0, groups);
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
					const [handle, sourceUri, icons, tooltip, strikeThrough, faded, contextValue, command] = rawResource;

					const [light, dark] = icons;
					const icon = ThemeIcon.isThemeIcon(light) ? light : URI.revive(light);
					const iconDark = (ThemeIcon.isThemeIcon(dark) ? dark : URI.revive(dark)) || icon;

					const decorations = {
						icon: icon,
						iconDark: iconDark,
						tooltip,
						strikeThrough,
						faded
					};

					return new MainThreadSCMResource(
						this.proxy,
						this.handle,
						groupHandle,
						handle,
						URI.revive(sourceUri),
						group,
						decorations,
						contextValue || undefined,
						command
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
		this._onDidChangeResources.fire();
	}

	async getOriginalResource(uri: URI): Promise<URI | null> {
		if (!this.features.hasQuickDiffProvider) {
			return null;
		}

		const result = await this.proxy.$provideOriginalResource(this.handle, uri, CancellationToken.None);
		return result && URI.revive(result);
	}

	$onDidChangeHistoryProviderActionButton(actionButton?: SCMActionButtonDto | null): void {
		if (!this._historyProvider) {
			return;
		}

		this._historyProvider.actionButton = actionButton ?? undefined;
	}

	$onDidChangeHistoryProviderCurrentHistoryItemGroup(currentHistoryItemGroup?: SCMHistoryItemGroupDto): void {
		if (!this._historyProvider) {
			return;
		}

		this._historyProvider.currentHistoryItemGroup = currentHistoryItemGroup ?? undefined;
	}

	toJSON(): any {
		return {
			$mid: MarshalledId.ScmProvider,
			handle: this.handle
		};
	}

	dispose(): void {
		this._quickDiff?.dispose();
	}
}

@extHostNamedCustomer(MainContext.MainThreadSCM)
export class MainThreadSCM implements MainThreadSCMShape {

	private readonly _proxy: ExtHostSCMShape;
	private _repositories = new Map<number, ISCMRepository>();
	private _repositoryDisposables = new Map<number, IDisposable>();
	private readonly _disposables = new DisposableStore();

	constructor(
		extHostContext: IExtHostContext,
		@ISCMService private readonly scmService: ISCMService,
		@ISCMViewService private readonly scmViewService: ISCMViewService,
		@IQuickDiffService private readonly quickDiffService: IQuickDiffService
	) {
		this._proxy = extHostContext.getProxy(ExtHostContext.ExtHostSCM);
	}

	dispose(): void {
		dispose(this._repositories.values());
		this._repositories.clear();

		dispose(this._repositoryDisposables.values());
		this._repositoryDisposables.clear();

		this._disposables.dispose();
	}

	$registerSourceControl(handle: number, id: string, label: string, rootUri: UriComponents | undefined, inputBoxDocumentUri: UriComponents): void {
		const provider = new MainThreadSCMProvider(this._proxy, handle, id, label, rootUri ? URI.revive(rootUri) : undefined, URI.revive(inputBoxDocumentUri), this.quickDiffService);
		const repository = this.scmService.registerSCMProvider(provider);
		this._repositories.set(handle, repository);

		const disposable = combinedDisposable(
			Event.filter(this.scmViewService.onDidFocusRepository, r => r === repository)(_ => this._proxy.$setSelectedSourceControl(handle)),
			repository.input.onDidChange(({ value }) => this._proxy.$onInputBoxValueChange(handle, value))
		);

		if (this.scmViewService.focusedRepository === repository) {
			setTimeout(() => this._proxy.$setSelectedSourceControl(handle), 0);
		}

		if (repository.input.value) {
			setTimeout(() => this._proxy.$onInputBoxValueChange(handle, repository.input.value), 0);
		}

		this._repositoryDisposables.set(handle, disposable);
	}

	$updateSourceControl(handle: number, features: SCMProviderFeatures): void {
		const repository = this._repositories.get(handle);

		if (!repository) {
			return;
		}

		const provider = repository.provider as MainThreadSCMProvider;
		provider.$updateSourceControl(features);
	}

	$unregisterSourceControl(handle: number): void {
		const repository = this._repositories.get(handle);

		if (!repository) {
			return;
		}

		this._repositoryDisposables.get(handle)!.dispose();
		this._repositoryDisposables.delete(handle);

		repository.dispose();
		this._repositories.delete(handle);
	}

	$registerGroups(sourceControlHandle: number, groups: [number /*handle*/, string /*id*/, string /*label*/, SCMGroupFeatures][], splices: SCMRawResourceSplices[]): void {
		const repository = this._repositories.get(sourceControlHandle);

		if (!repository) {
			return;
		}

		const provider = repository.provider as MainThreadSCMProvider;
		provider.$registerGroups(groups);
		provider.$spliceGroupResourceStates(splices);
	}

	$updateGroup(sourceControlHandle: number, groupHandle: number, features: SCMGroupFeatures): void {
		const repository = this._repositories.get(sourceControlHandle);

		if (!repository) {
			return;
		}

		const provider = repository.provider as MainThreadSCMProvider;
		provider.$updateGroup(groupHandle, features);
	}

	$updateGroupLabel(sourceControlHandle: number, groupHandle: number, label: string): void {
		const repository = this._repositories.get(sourceControlHandle);

		if (!repository) {
			return;
		}

		const provider = repository.provider as MainThreadSCMProvider;
		provider.$updateGroupLabel(groupHandle, label);
	}

	$spliceResourceStates(sourceControlHandle: number, splices: SCMRawResourceSplices[]): void {
		const repository = this._repositories.get(sourceControlHandle);

		if (!repository) {
			return;
		}

		const provider = repository.provider as MainThreadSCMProvider;
		provider.$spliceGroupResourceStates(splices);
	}

	$unregisterGroup(sourceControlHandle: number, handle: number): void {
		const repository = this._repositories.get(sourceControlHandle);

		if (!repository) {
			return;
		}

		const provider = repository.provider as MainThreadSCMProvider;
		provider.$unregisterGroup(handle);
	}

	$setInputBoxValue(sourceControlHandle: number, value: string): void {
		const repository = this._repositories.get(sourceControlHandle);

		if (!repository) {
			return;
		}

		repository.input.setValue(value, false);
	}

	$setInputBoxPlaceholder(sourceControlHandle: number, placeholder: string): void {
		const repository = this._repositories.get(sourceControlHandle);

		if (!repository) {
			return;
		}

		repository.input.placeholder = placeholder;
	}

	$setInputBoxEnablement(sourceControlHandle: number, enabled: boolean): void {
		const repository = this._repositories.get(sourceControlHandle);

		if (!repository) {
			return;
		}

		repository.input.enabled = enabled;
	}

	$setInputBoxVisibility(sourceControlHandle: number, visible: boolean): void {
		const repository = this._repositories.get(sourceControlHandle);

		if (!repository) {
			return;
		}

		repository.input.visible = visible;
	}

	$showValidationMessage(sourceControlHandle: number, message: string | IMarkdownString, type: InputValidationType) {
		const repository = this._repositories.get(sourceControlHandle);
		if (!repository) {
			return;
		}

		repository.input.showValidationMessage(message, type);
	}

	$setValidationProviderIsEnabled(sourceControlHandle: number, enabled: boolean): void {
		const repository = this._repositories.get(sourceControlHandle);

		if (!repository) {
			return;
		}

		if (enabled) {
			repository.input.validateInput = async (value, pos): Promise<IInputValidation | undefined> => {
				const result = await this._proxy.$validateInput(sourceControlHandle, value, pos);
				return result && { message: result[0], type: result[1] };
			};
		} else {
			repository.input.validateInput = async () => undefined;
		}
	}

	$onDidChangeHistoryProviderActionButton(sourceControlHandle: number, actionButton?: SCMActionButtonDto | null | undefined): void {
		const repository = this._repositories.get(sourceControlHandle);

		if (!repository) {
			return;
		}

		const provider = repository.provider as MainThreadSCMProvider;
		provider.$onDidChangeHistoryProviderActionButton(actionButton);
	}

	$onDidChangeHistoryProviderCurrentHistoryItemGroup(sourceControlHandle: number, historyItemGroup: SCMHistoryItemGroupDto | undefined): void {
		const repository = this._repositories.get(sourceControlHandle);

		if (!repository) {
			return;
		}

		const provider = repository.provider as MainThreadSCMProvider;
		provider.$onDidChangeHistoryProviderCurrentHistoryItemGroup(historyItemGroup);
	}
}
