/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getWindow } from '../../../../base/browser/dom.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../../base/common/map.js';
import { autorun, derived, IReader, observableFromEvent, observableSignal, observableValue } from '../../../../base/common/observable.js';
import { isEqual } from '../../../../base/common/resources.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IEditorGroup, IEditorGroupsService, preferredSideBySideGroupDirection } from '../../../services/editor/common/editorGroupsService.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { ChatViewId, IChatWidget, IChatWidgetService, isIChatResourceViewContext, isIChatViewViewContext } from '../../chat/browser/chat.js';
import { ChatEditor } from '../../chat/browser/widgetHosts/editor/chatEditor.js';
import { IChatService } from '../../chat/common/chatService/chatService.js';
import { ChatAgentLocation } from '../../chat/common/constants.js';
import { IChatModel } from '../../chat/common/model/chatModel.js';
import { CanvasInput, canvasOwnerKey, ICanvasContext, ICanvasContextService, ICanvasOwner, isCanvasOwner } from '../common/canvas.js';

export class EditorCanvasContextService extends Disposable implements ICanvasContextService {

	declare readonly _serviceBrand: undefined;
	private readonly removedOwner = this._register(new Emitter<ICanvasOwner>());
	readonly onDidRemoveOwner = this.removedOwner.event;
	private readonly retainedContexts = new Map<string, ICanvasContext>();
	private readonly modelOwners = new ResourceMap<ICanvasOwner>();
	private readonly clearedModels = new WeakSet<IChatModel>();
	private readonly contextValue = observableValue<readonly ICanvasContext[]>(this, []);
	readonly contexts = this.contextValue;
	private readonly widgetStateChanged = observableSignal(this);
	private readonly visibleOwners;

	constructor(
		@IChatWidgetService widgetService: IChatWidgetService,
		@IChatService chatService: IChatService,
		@IEditorService editorService: IEditorService,
		@IEditorGroupsService private readonly editorGroupsService: IEditorGroupsService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
	) {
		super();
		const widgets = observableFromEvent(this, Event.any(widgetService.onDidAddWidget, widgetService.onDidRemoveWidget), () => widgetService.getAllWidgets().slice());
		this._register(autorun(reader => {
			for (const widget of widgets.read(reader)) {
				reader.store.add(widget.onDidChangeViewModel(() => this.widgetStateChanged.trigger(undefined)));
			}
		}));
		this._register(Event.any(widgetService.onDidChangeWidgetVisibility, editorService.onDidVisibleEditorsChange)(() => this.widgetStateChanged.trigger(undefined)));
		this.visibleOwners = derived(this, reader => {
			this.widgetStateChanged.read(reader);
			const owners: { readonly widget: IChatWidget; readonly context: ICanvasContext }[] = [];
			for (const widget of widgets.read(reader)) {
				if (!this.isSupportedWidget(widget)) {
					continue;
				}
				const model = widget.viewModel?.model;
				const context = model?.canvasContext?.read(reader);
				if (context && model && !this.clearedModels.has(model)) {
					owners.push({ widget, context });
				}
			}
			return owners;
		});
		this._register(autorun(reader => {
			const liveOwners = new Set<string>();
			for (const model of chatService.chatModels.read(reader)) {
				if (this.clearedModels.has(model)) {
					continue;
				}
				const context = model.canvasContext?.read(reader);
				if (context) {
					const key = canvasOwnerKey(context.owner);
					liveOwners.add(key);
					this.modelOwners.set(model.sessionResource, context.owner);
					this.retainedContexts.set(key, context);
				}
			}
			for (const [key, context] of this.retainedContexts) {
				const canvases = context.canvases.read(reader);
				if (!liveOwners.has(key) && (canvases === undefined || canvases.length === 0)) {
					this.retainedContexts.delete(key);
					if (canvases !== undefined) {
						this.removedOwner.fire(context.owner);
						for (const [resource, owner] of this.modelOwners) {
							if (isCanvasOwner(owner, context.owner)) {
								this.modelOwners.delete(resource);
							}
						}
					}
				}
			}
			this.contextValue.set([...this.retainedContexts.values()], undefined);
		}));
		this._register(chatService.onDidDisposeSession(event => {
			if (event.reason !== 'cleared') {
				return;
			}
			for (const resource of event.sessionResources) {
				for (const model of chatService.chatModels.get()) {
					if (isEqual(model.sessionResource, resource)) {
						this.clearedModels.add(model);
					}
				}
				const owner = this.modelOwners.get(resource);
				if (owner) {
					this.modelOwners.delete(resource);
					this.retainedContexts.delete(canvasOwnerKey(owner));
					this.contextValue.set([...this.retainedContexts.values()], undefined);
					this.removedOwner.fire(owner);
				}
			}
			this.widgetStateChanged.trigger(undefined);
		}));
	}

	isOwnerVisible(owner: ICanvasOwner, reader?: IReader): boolean {
		return this.visibleOwners.read(reader).some(candidate => isCanvasOwner(candidate.context.owner, owner));
	}

	getContext(owner: ICanvasOwner, reader?: IReader): ICanvasContext | undefined {
		return this.contexts.read(reader).find(context => isCanvasOwner(context.owner, owner));
	}

	getEditorGroup(owner: ICanvasOwner, input: CanvasInput): IEditorGroup | undefined {
		const owners = this.visibleOwners.get();
		const originating = owners.find(candidate => isCanvasOwner(candidate.context.owner, owner));
		if (!originating) {
			return undefined;
		}
		const mainPart = this.editorGroupsService.mainPart;
		const ownerGroups = new Set<IEditorGroup>();
		for (const candidate of owners) {
			const group = this.getChatEditorGroup(candidate.widget);
			if (group) {
				ownerGroups.add(group);
			}
		}
		const available = mainPart.groups.filter(group => !ownerGroups.has(group) && !group.isLocked);
		const existing = available.find(group => group.editors.includes(input));
		const canvasGroup = available.find(group => group.editors.some(editor => editor instanceof CanvasInput && isCanvasOwner(editor.reference, owner)))
			?? available.find(group => group.activeEditor instanceof CanvasInput);
		if (existing || canvasGroup) {
			return existing ?? canvasGroup;
		}
		const source = this.getChatEditorGroup(originating.widget);
		if (!source) {
			return available.find(group => group === mainPart.activeGroup) ?? available[0]
				?? mainPart.addGroup(mainPart.activeGroup, preferredSideBySideGroupDirection(this.configurationService));
		}
		const adjacent = mainPart.findGroup({ direction: preferredSideBySideGroupDirection(this.configurationService) }, source);
		return (adjacent && available.includes(adjacent) ? adjacent : available[0])
			?? mainPart.addGroup(source, preferredSideBySideGroupDirection(this.configurationService));
	}

	private isSupportedWidget(widget: IChatWidget): boolean {
		if (!widget.visible || widget.location !== ChatAgentLocation.Chat || getWindow(widget.domNode).vscodeWindowId !== this.editorGroupsService.mainPart.windowId) {
			return false;
		}
		if (isIChatViewViewContext(widget.viewContext)) {
			return widget.viewContext.viewId === ChatViewId;
		}
		return isIChatResourceViewContext(widget.viewContext)
			&& !widget.viewContext.isQuickChat
			&& !widget.viewContext.isInlineChat
			&& this.getChatEditorGroup(widget) !== undefined;
	}

	private getChatEditorGroup(widget: IChatWidget): IEditorGroup | undefined {
		if (isIChatViewViewContext(widget.viewContext)) {
			return undefined;
		}
		for (const group of this.editorGroupsService.mainPart.groups) {
			const editor = group.activeEditorPane;
			if (editor instanceof ChatEditor && editor.widget === widget) {
				return group;
			}
		}
		return undefined;
	}
}
