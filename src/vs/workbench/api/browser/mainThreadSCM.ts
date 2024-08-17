/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Barrier } from 'vs/base/common/async';
import { URI, UriComponents } from 'vs/base/common/uri';
import { Event, Emitter } from 'vs/base/common/event';
import { derived, observableValue, observableValueOpts } from 'vs/base/common/observable';
import { IDisposable, DisposableStore, combinedDisposable, dispose, Disposable } from 'vs/base/common/lifecycle';
import { ISCMService, ISCMRepository, ISCMProvider, ISCMResource, ISCMResourceGroup, ISCMResourceDecorations, IInputValidation, ISCMViewService, InputValidationType, ISCMActionButtonDescriptor } from 'vs/workbench/contrib/scm/common/scm';
import { ExtHostContext, MainThreadSCMShape, ExtHostSCMShape, SCMProviderFeatures, SCMRawResourceSplices, SCMGroupFeatures, MainContext, SCMHistoryItemGroupDto, SCMHistoryItemDto } from '../common/extHost.protocol';
import { Command } from 'vs/editor/common/languages';
import { extHostNamedCustomer, IExtHostContext } from 'vs/workbench/services/extensions/common/extHostCustomers';
import { CancellationToken } from 'vs/base/common/cancellation';
import { MarshalledId } from 'vs/base/common/marshallingIds';
import { ThemeIcon } from 'vs/base/common/themables';
import { IMarkdownString } from 'vs/base/common/htmlContent';
import { IQuickDiffService, QuickDiffProvider } from 'vs/workbench/contrib/scm/common/quickDiff';
import { ISCMHistoryItem, ISCMHistoryItemChange, ISCMHistoryItemGroup, ISCMHistoryOptions, ISCMHistoryProvider } from 'vs/workbench/contrib/scm/common/history';
import { ResourceTree } from 'vs/base/common/resourceTree';
import { IUriIdentityService } from 'vs/platform/uriIdentity/common/uriIdentity';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { basename } from 'vs/base/common/resources';
import { ILanguageService } from 'vs/editor/common/languages/language';
import { IModelService } from 'vs/editor/common/services/model';
import { ITextModelContentProvider, ITextModelService } from 'vs/editor/common/services/resolverService';
import { Schemas } from 'vs/base/common/network';
import { ITextModel } from 'vs/editor/common/model';

function getIconFromIconDto(iconDto?: UriComponents | { light: UriComponents; dark: UriComponents } | ThemeIcon): URI | { light: URI; dark: URI } | ThemeIcon | undefined {
	if (iconDto === undefined) {
		return undefined;
	} else if (URI.isUri(iconDto)) {
		return URI.revive(iconDto);
	} else if (ThemeIcon.isThemeIcon(iconDto)) {
		return iconDto;
	} else {
		const icon = iconDto as { light: UriComponents; dark: UriComponents };
		return { light: URI.revive(icon.light), dark: URI.revive(icon.dark) };
	}
}

function toISCMHistoryItem(historyItemDto: SCMHistoryItemDto): ISCMHistoryItem {
	const icon = getIconFromIconDto(historyItemDto.icon);
	const labels = historyItemDto.labels?.map(l => ({ title: l.title, icon: getIconFromIconDto(l.icon) }));

	return { ...historyItemDto, icon, labels };
}

class SCMInputBoxContentProvider extends Disposable implements ITextModelContentProvider {
	constructor(
		textModelService: ITextModelService,
		private readonly modelService: IModelService,
		private readonly languageService: ILanguageService,
	) {
		super();
		this._register(textModelService.registerTextModelContentProvider(Schemas.vscodeSourceControl, this));
	}

	async provideTextContent(resource: URI): Promise<ITextModel | null> {
		const existing = this.modelService.getModel(resource);
		if (existing) {
			return existing;
		}
		return this.modelService.createModel('', this.languageService.createById('scminput'), resource);
	}
}

class MainThreadSCMResourceGroup implements ISCMResourceGroup {

	readonly resources: ISCMResource[] = [];

	private _resourceTree: ResourceTree<ISCMResource, ISCMResourceGroup> | undefined;
	get resourceTree(): ResourceTree<ISCMResource, ISCMResourceGroup> {
		if (!this._resourceTree) {
			const rootUri = this.provider.rootUri ?? URI.file('/');
			this._resourceTree = new ResourceTree<ISCMResource, ISCMResourceGroup>(this, rootUri, this._uriIdentService.extUri);
			for (const resource of this.resources) {
				this._resourceTree.add(resource.sourceUri, resource);
			}
		}

		return this._resourceTree;
	}

	private readonly _onDidChange = new Emitter<void>();
	readonly onDidChange: Event<void> = this._onDidChange.event;

	private readonly _onDidChangeResources = new Emitter<void>();
	readonly onDidChangeResources = this._onDidChangeResources.event;

	get hideWhenEmpty(): boolean { return !!this.features.hideWhenEmpty; }

	constructor(
		private readonly sourceControlHandle: number,
		private readonly handle: number,
		public provider: ISCMProvider,
		public features: SCMGroupFeatures,
		public label: string,
		public id: string,
		public readonly multiDiffEditorEnableViewChanges: boolean,
		private readonly _uriIdentService: IUriIdentityService
	) { }

	toJSON(): any {
		return {
			$mid: MarshalledId.ScmResourceGroup,
			sourceControlHandle: this.sourceControlHandle,
			groupHandle: this.handle
		};
	}

	splice(start: number, deleteCount: number, toInsert: ISCMResource[]) {
		this.resources.splice(start, deleteCount, ...toInsert);
		this._resourceTree = undefined;

		this._onDidChangeResources.fire();
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
		readonly command: Command | undefined,
		readonly multiDiffEditorOriginalUri: URI | undefined,
		readonly multiDiffEditorModifiedUri: URI | undefined,
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
	readonly currentHistoryItemGroupId = derived<string | undefined>(this, reader => this.currentHistoryItemGroup.read(reader)?.id);
	readonly currentHistoryItemGroupName = derived<string | undefined>(this, reader => this.currentHistoryItemGroup.read(reader)?.name);

	private readonly _currentHistoryItemGroup = observableValueOpts<ISCMHistoryItemGroup | undefined>({ owner: this, equalsFn: () => false }, undefined);
	get currentHistoryItemGroup() { return this._currentHistoryItemGroup; }

	constructor(private readonly proxy: ExtHostSCMShape, private readonly handle: number) { }

	async resolveHistoryItemGroupCommonAncestor(historyItemGroupId1: string, historyItemGroupId2: string | undefined): Promise<{ id: string; ahead: number; behind: number } | undefined> {
		return this.proxy.$resolveHistoryItemGroupCommonAncestor(this.handle, historyItemGroupId1, historyItemGroupId2, CancellationToken.None);
	}

	async resolveHistoryItemGroupCommonAncestor2(historyItemGroupIds: string[]): Promise<string | undefined> {
		return this.proxy.$resolveHistoryItemGroupCommonAncestor2(this.handle, historyItemGroupIds, CancellationToken.None);
	}

	async provideHistoryItems(historyItemGroupId: string, options: ISCMHistoryOptions): Promise<ISCMHistoryItem[] | undefined> {
		const historyItems = await this.proxy.$provideHistoryItems(this.handle, historyItemGroupId, options, CancellationToken.None);
		return historyItems?.map(historyItem => toISCMHistoryItem(historyItem));
	}

	async provideHistoryItems2(options: ISCMHistoryOptions): Promise<ISCMHistoryItem[] | undefined> {
		const historyItems = await this.proxy.$provideHistoryItems2(this.handle, options, CancellationToken.None);
		return historyItems?.map(historyItem => toISCMHistoryItem(historyItem));
	}

	async provideHistoryItemSummary(historyItemId: string, historyItemParentId: string | undefined): Promise<ISCMHistoryItem | undefined> {
		const historyItem = await this.proxy.$provideHistoryItemSummary(this.handle, historyItemId, historyItemParentId, CancellationToken.None);
		return historyItem ? toISCMHistoryItem(historyItem) : undefined;
	}

	async provideHistoryItemChanges(historyItemId: string, historyItemParentId: string | undefined): Promise<ISCMHistoryItemChange[] | undefined> {
		const changes = await this.proxy.$provideHistoryItemChanges(this.handle, historyItemId, historyItemParentId, CancellationToken.None);
		return changes?.map(change => ({
			uri: URI.revive(change.uri),
			originalUri: change.originalUri && URI.revive(change.originalUri),
			modifiedUri: change.modifiedUri && URI.revive(change.modifiedUri),
			renameUri: change.renameUri && URI.revive(change.renameUri)
		}));
	}

	$onDidChangeCurrentHistoryItemGroup(historyItemGroup: ISCMHistoryItemGroup | undefined): void {
		this._currentHistoryItemGroup.set(historyItemGroup, undefined);
	}
}

class MainThreadSCMProvider implements ISCMProvider, QuickDiffProvider {

	private static ID_HANDLE = 0;
	private _id = `scm${MainThreadSCMProvider.ID_HANDLE++}`;
	get id(): string { return this._id; }

	readonly groups: MainThreadSCMResourceGroup[] = [];
	private readonly _onDidChangeResourceGroups = new Emitter<void>();
	readonly onDidChangeResourceGroups = this._onDidChangeResourceGroups.event;

	private readonly _onDidChangeResources = new Emitter<void>();
	readonly onDidChangeResources = this._onDidChangeResources.event;

	private readonly _groupsByHandle: { [handle: number]: MainThreadSCMResourceGroup } = Object.create(null);

	// get groups(): ISequence<ISCMResourceGroup> {
	// 	return {
	// 		elements: this._groups,
	// 		onDidSplice: this._onDidSplice.event
	// 	};

	// 	// return this._groups
	// 	// 	.filter(g => g.resources.elements.length > 0 || !g.features.hideWhenEmpty);
	// }


	private features: SCMProviderFeatures = {};

	get handle(): number { return this._handle; }
	get label(): string { return this._label; }
	get rootUri(): URI | undefined { return this._rootUri; }
	get inputBoxTextModel(): ITextModel { return this._inputBoxTextModel; }
	get contextValue(): string { return this._providerId; }

	get acceptInputCommand(): Command | undefined { return this.features.acceptInputCommand; }
	get actionButton(): ISCMActionButtonDescriptor | undefined { return this.features.actionButton ?? undefined; }

	private readonly _count = observableValue<number | undefined>(this, undefined);
	get count() { return this._count; }

	private readonly _statusBarCommands = observableValue<readonly Command[] | undefined>(this, undefined);
	get statusBarCommands() { return this._statusBarCommands; }

	private readonly _name: string | undefined;
	get name(): string { return this._name ?? this._label; }

	private readonly _commitTemplate = observableValue<string>(this, '');
	get commitTemplate() { return this._commitTemplate; }

	private readonly _onDidChange = new Emitter<void>();
	readonly onDidChange: Event<void> = this._onDidChange.event;

	private _quickDiff: IDisposable | undefined;
	public readonly isSCM: boolean = true;

	private readonly _historyProvider = observableValue<MainThreadSCMHistoryProvider | undefined>(this, undefined);
	get historyProvider() { return this._historyProvider; }

	constructor(
		private readonly proxy: ExtHostSCMShape,
		private readonly _handle: number,
		private readonly _providerId: string,
		private readonly _label: string,
		private readonly _rootUri: URI | undefined,
		private readonly _inputBoxTextModel: ITextModel,
		private readonly _quickDiffService: IQuickDiffService,
		private readonly _uriIdentService: IUriIdentityService,
		private readonly _workspaceContextService: IWorkspaceContextService
	) {
		if (_rootUri) {
			const folder = this._workspaceContextService.getWorkspaceFolder(_rootUri);
			if (folder?.uri.toString() === _rootUri.toString()) {
				this._name = folder.name;
			} else if (_rootUri.path !== '/') {
				this._name = basename(_rootUri);
			}
		}
	}

	$updateSourceControl(features: SCMProviderFeatures): void {
		this.features = { ...this.features, ...features };
		this._onDidChange.fire();

		if (typeof features.commitTemplate !== 'undefined') {
			this._commitTemplate.set(features.commitTemplate, undefined);
		}

		if (typeof features.count !== 'undefined') {
			this._count.set(features.count, undefined);
		}

		if (typeof features.statusBarCommands !== 'undefined') {
			this._statusBarCommands.set(features.statusBarCommands, undefined);
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

		if (features.hasHistoryProvider && !this.historyProvider.get()) {
			const historyProvider = new MainThreadSCMHistoryProvider(this.proxy, this.handle);
			this._historyProvider.set(historyProvider, undefined);
		} else if (features.hasHistoryProvider === false && this.historyProvider.get()) {
			this._historyProvider.set(undefined, undefined);
		}
	}

	$registerGroups(_groups: [number /*handle*/, string /*id*/, string /*label*/, SCMGroupFeatures, /* multiDiffEditorEnableViewChanges */ boolean][]): void {
		const groups = _groups.map(([handle, id, label, features, multiDiffEditorEnableViewChanges]) => {
			const group = new MainThreadSCMResourceGroup(
				this.handle,
				handle,
				this,
				features,
				label,
				id,
				multiDiffEditorEnableViewChanges,
				this._uriIdentService
			);

			this._groupsByHandle[handle] = group;
			return group;
		});

		this.groups.splice(this.groups.length, 0, ...groups);
		this._onDidChangeResourceGroups.fire();
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
					const [handle, sourceUri, icons, tooltip, strikeThrough, faded, contextValue, command, multiDiffEditorOriginalUri, multiDiffEditorModifiedUri] = rawResource;

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
						command,
						URI.revive(multiDiffEditorOriginalUri),
						URI.revive(multiDiffEditorModifiedUri),
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
		this.groups.splice(this.groups.indexOf(group), 1);
		this._onDidChangeResourceGroups.fire();
	}

	async getOriginalResource(uri: URI): Promise<URI | null> {
		if (!this.features.hasQuickDiffProvider) {
			return null;
		}

		const result = await this.proxy.$provideOriginalResource(this.handle, uri, CancellationToken.None);
		return result && URI.revive(result);
	}

	$onDidChangeHistoryProviderCurrentHistoryItemGroup(currentHistoryItemGroup?: SCMHistoryItemGroupDto): void {
		if (!this.historyProvider.get()) {
			return;
		}

		this._historyProvider.get()?.$onDidChangeCurrentHistoryItemGroup(currentHistoryItemGroup);
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
	private _repositoryBarriers = new Map<number, Barrier>();
	private _repositoryDisposables = new Map<number, IDisposable>();
	private readonly _disposables = new DisposableStore();

	constructor(
		extHostContext: IExtHostContext,
		@ISCMService private readonly scmService: ISCMService,
		@ISCMViewService private readonly scmViewService: ISCMViewService,
		@ILanguageService private readonly languageService: ILanguageService,
		@IModelService private readonly modelService: IModelService,
		@ITextModelService private readonly textModelService: ITextModelService,
		@IQuickDiffService private readonly quickDiffService: IQuickDiffService,
		@IUriIdentityService private readonly _uriIdentService: IUriIdentityService,
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService
	) {
		this._proxy = extHostContext.getProxy(ExtHostContext.ExtHostSCM);

		this._disposables.add(new SCMInputBoxContentProvider(this.textModelService, this.modelService, this.languageService));
	}

	dispose(): void {
		dispose(this._repositories.values());
		this._repositories.clear();

		dispose(this._repositoryDisposables.values());
		this._repositoryDisposables.clear();

		this._disposables.dispose();
	}

	async $registerSourceControl(handle: number, id: string, label: string, rootUri: UriComponents | undefined, inputBoxDocumentUri: UriComponents): Promise<void> {
		this._repositoryBarriers.set(handle, new Barrier());

		const inputBoxTextModelRef = await this.textModelService.createModelReference(URI.revive(inputBoxDocumentUri));
		const provider = new MainThreadSCMProvider(this._proxy, handle, id, label, rootUri ? URI.revive(rootUri) : undefined, inputBoxTextModelRef.object.textEditorModel, this.quickDiffService, this._uriIdentService, this.workspaceContextService);
		const repository = this.scmService.registerSCMProvider(provider);
		this._repositories.set(handle, repository);

		const disposable = combinedDisposable(
			inputBoxTextModelRef,
			Event.filter(this.scmViewService.onDidFocusRepository, r => r === repository)(_ => this._proxy.$setSelectedSourceControl(handle)),
			repository.input.onDidChange(({ value }) => this._proxy.$onInputBoxValueChange(handle, value))
		);
		this._repositoryDisposables.set(handle, disposable);

		if (this.scmViewService.focusedRepository === repository) {
			setTimeout(() => this._proxy.$setSelectedSourceControl(handle), 0);
		}

		if (repository.input.value) {
			setTimeout(() => this._proxy.$onInputBoxValueChange(handle, repository.input.value), 0);
		}

		this._repositoryBarriers.get(handle)?.open();
	}

	async $updateSourceControl(handle: number, features: SCMProviderFeatures): Promise<void> {
		await this._repositoryBarriers.get(handle)?.wait();
		const repository = this._repositories.get(handle);

		if (!repository) {
			return;
		}

		const provider = repository.provider as MainThreadSCMProvider;
		provider.$updateSourceControl(features);
	}

	async $unregisterSourceControl(handle: number): Promise<void> {
		await this._repositoryBarriers.get(handle)?.wait();
		const repository = this._repositories.get(handle);

		if (!repository) {
			return;
		}

		this._repositoryDisposables.get(handle)!.dispose();
		this._repositoryDisposables.delete(handle);

		repository.dispose();
		this._repositories.delete(handle);
	}

	async $registerGroups(sourceControlHandle: number, groups: [number /*handle*/, string /*id*/, string /*label*/, SCMGroupFeatures, /* multiDiffEditorEnableViewChanges */ boolean][], splices: SCMRawResourceSplices[]): Promise<void> {
		await this._repositoryBarriers.get(sourceControlHandle)?.wait();
		const repository = this._repositories.get(sourceControlHandle);

		if (!repository) {
			return;
		}

		const provider = repository.provider as MainThreadSCMProvider;
		provider.$registerGroups(groups);
		provider.$spliceGroupResourceStates(splices);
	}

	async $updateGroup(sourceControlHandle: number, groupHandle: number, features: SCMGroupFeatures): Promise<void> {
		await this._repositoryBarriers.get(sourceControlHandle)?.wait();
		const repository = this._repositories.get(sourceControlHandle);

		if (!repository) {
			return;
		}

		const provider = repository.provider as MainThreadSCMProvider;
		provider.$updateGroup(groupHandle, features);
	}

	async $updateGroupLabel(sourceControlHandle: number, groupHandle: number, label: string): Promise<void> {
		await this._repositoryBarriers.get(sourceControlHandle)?.wait();
		const repository = this._repositories.get(sourceControlHandle);

		if (!repository) {
			return;
		}

		const provider = repository.provider as MainThreadSCMProvider;
		provider.$updateGroupLabel(groupHandle, label);
	}

	async $spliceResourceStates(sourceControlHandle: number, splices: SCMRawResourceSplices[]): Promise<void> {
		await this._repositoryBarriers.get(sourceControlHandle)?.wait();
		const repository = this._repositories.get(sourceControlHandle);

		if (!repository) {
			return;
		}

		const provider = repository.provider as MainThreadSCMProvider;
		provider.$spliceGroupResourceStates(splices);
	}

	async $unregisterGroup(sourceControlHandle: number, handle: number): Promise<void> {
		await this._repositoryBarriers.get(sourceControlHandle)?.wait();
		const repository = this._repositories.get(sourceControlHandle);

		if (!repository) {
			return;
		}

		const provider = repository.provider as MainThreadSCMProvider;
		provider.$unregisterGroup(handle);
	}

	async $setInputBoxValue(sourceControlHandle: number, value: string): Promise<void> {
		await this._repositoryBarriers.get(sourceControlHandle)?.wait();
		const repository = this._repositories.get(sourceControlHandle);

		if (!repository) {
			return;
		}

		repository.input.setValue(value, false);
	}

	async $setInputBoxPlaceholder(sourceControlHandle: number, placeholder: string): Promise<void> {
		await this._repositoryBarriers.get(sourceControlHandle)?.wait();
		const repository = this._repositories.get(sourceControlHandle);

		if (!repository) {
			return;
		}

		repository.input.placeholder = placeholder;
	}

	async $setInputBoxEnablement(sourceControlHandle: number, enabled: boolean): Promise<void> {
		await this._repositoryBarriers.get(sourceControlHandle)?.wait();
		const repository = this._repositories.get(sourceControlHandle);

		if (!repository) {
			return;
		}

		repository.input.enabled = enabled;
	}

	async $setInputBoxVisibility(sourceControlHandle: number, visible: boolean): Promise<void> {
		await this._repositoryBarriers.get(sourceControlHandle)?.wait();
		const repository = this._repositories.get(sourceControlHandle);

		if (!repository) {
			return;
		}

		repository.input.visible = visible;
	}

	async $showValidationMessage(sourceControlHandle: number, message: string | IMarkdownString, type: InputValidationType): Promise<void> {
		await this._repositoryBarriers.get(sourceControlHandle)?.wait();
		const repository = this._repositories.get(sourceControlHandle);
		if (!repository) {
			return;
		}

		repository.input.showValidationMessage(message, type);
	}

	async $setValidationProviderIsEnabled(sourceControlHandle: number, enabled: boolean): Promise<void> {
		await this._repositoryBarriers.get(sourceControlHandle)?.wait();
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

	async $onDidChangeHistoryProviderCurrentHistoryItemGroup(sourceControlHandle: number, historyItemGroup: SCMHistoryItemGroupDto | undefined): Promise<void> {
		await this._repositoryBarriers.get(sourceControlHandle)?.wait();
		const repository = this._repositories.get(sourceControlHandle);

		if (!repository) {
			return;
		}

		const provider = repository.provider as MainThreadSCMProvider;
		provider.$onDidChangeHistoryProviderCurrentHistoryItemGroup(historyItemGroup);
	}
}
