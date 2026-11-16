/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $ } from '../../../../base/browser/dom.js';
import { Event } from '../../../../base/common/event.js';
import { Disposable, IDisposable } from '../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../base/common/network.js';
import { autorun, constObservable, IObservable } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ServiceCollection } from '../../../../platform/instantiation/common/serviceCollection.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { editorBackground, editorForeground, inputBackground } from '../../../../platform/theme/common/colorRegistry.js';
import { ViewEditorInput } from '../../../browser/parts/editor/viewEditorInput.js';
import { IViewEditorRegistry, IViewEditorView, ViewEditorExtensions } from '../../../browser/parts/editor/viewEditorRegistry.js';
import { EDITOR_DRAG_AND_DROP_BACKGROUND } from '../../../common/theme.js';
import { ChatWidget } from '../../chat/browser/widget/chatWidget.js';
import { ChatContextKeys } from '../../chat/common/actions/chatContextKeys.js';
import { ChatAgentLocation } from '../../chat/common/constants.js';
import { ChatModel } from '../../chat/common/model/chatModel.js';
import { IChatScheduledRequest } from '../../chat/common/model/chatViewModel.js';

export class ScheduledChatEditorInput extends ViewEditorInput {
	static readonly ViewType = 'sessions.scheduledChat';

	constructor(readonly id: string, readonly item: IObservable<IChatScheduledRequest | undefined>, private readonly title: string) {
		super(ScheduledChatEditorInput.ViewType, URI.from({ scheme: Schemas.vscodeChatEditor, path: `/scheduled/${encodeURIComponent(id)}` }));
	}

	override getName(): string {
		return this.title;
	}
}

export class ScheduledChatEditor extends Disposable implements IViewEditorView {
	readonly element = $('.scheduled-chat-editor');
	readonly minimumWidth = 280;
	readonly maximumWidth = Number.POSITIVE_INFINITY;
	readonly minimumHeight = 120;
	readonly maximumHeight = Number.POSITIVE_INFINITY;
	readonly onDidChange = Event.None;
	readonly providesTitle = false;
	private readonly widget: ChatWidget;

	constructor(
		input: ScheduledChatEditorInput,
		@IInstantiationService instantiationService: IInstantiationService,
		@IContextKeyService contextKeyService: IContextKeyService,
	) {
		super();
		const context = this._register(contextKeyService.createScoped(this.element));
		ChatContextKeys.inChatEditor.bindTo(context).set(true);
		const scopedInstantiationService = this._register(instantiationService.createChild(new ServiceCollection([IContextKeyService, context])));
		const model = this._register(scopedInstantiationService.createInstance(ChatModel, undefined, {
			initialLocation: ChatAgentLocation.Chat,
			canUseTools: false,
			disableBackgroundKeepAlive: true,
			isReadOnly: constObservable(true),
		}));
		this.widget = this._register(scopedInstantiationService.createInstance(ChatWidget, ChatAgentLocation.Chat, undefined, {
			isSessionsWindow: true,
			renderGettingStartedTip: false,
			enableFind: true,
			rendererOptions: { editable: false },
		}, {
			listForeground: editorForeground,
			listBackground: editorBackground,
			overlayBackground: EDITOR_DRAG_AND_DROP_BACKGROUND,
			inputEditorBackground: inputBackground,
			resultEditorBackground: editorBackground,
		}));
		this.widget.render(this.element);
		this.widget.setModel(model);
		this.widget.setReadOnly(true);
		this.widget.setVisible(true);
		this._register(autorun(reader => {
			const item = input.item.read(reader);
			this.widget.viewModel?.setScheduledRequests(item ? [{ ...item, actions: item.actions.filter(action => action.id !== 'sessions.scheduled.preview') }] : []);
			this.widget.setTranscriptProgress(item ? undefined : localize('scheduledChat.noLongerPending', "This request is no longer scheduled. It may have been sent or cancelled."), undefined, { complete: true });
		}));
	}

	layout(width: number, height: number): void {
		this.widget.layout(height, width);
	}

	focus(): void {
		this.widget.focusResponseItem();
	}

	setVisible(visible: boolean): void {
		this.widget.setVisible(visible);
	}
}

export function registerScheduledChatEditor(): IDisposable {
	return Registry.as<IViewEditorRegistry>(ViewEditorExtensions.ViewEditors).register({
		viewType: ScheduledChatEditorInput.ViewType,
		name: localize('scheduledChat.editor', "Scheduled Request"),
		createView: (instantiationService, input) => {
			if (!(input instanceof ScheduledChatEditorInput)) {
				throw new Error('Expected a scheduled chat editor input');
			}
			return instantiationService.createInstance(ScheduledChatEditor, input);
		},
	});
}
