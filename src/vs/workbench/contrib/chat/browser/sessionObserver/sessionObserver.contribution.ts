/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../../base/common/codicons.js';
import { Disposable, DisposableMap, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { localize } from '../../../../../nls.js';
import { SyncDescriptor } from '../../../../../platform/instantiation/common/descriptors.js';
import { InstantiationType, registerSingleton } from '../../../../../platform/instantiation/common/extensions.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../common/contributions.js';
import { Extensions as ViewExtensions, ICustomViewDescriptor, IViewContainersRegistry, IViewsRegistry, WindowEnablement } from '../../../../common/views.js';
import { IWorkbenchEnvironmentService } from '../../../../services/environment/common/environmentService.js';
import { isProposedApiEnabled } from '../../../../services/extensions/common/extensions.js';
import { ExtensionsRegistry } from '../../../../services/extensions/common/extensionsRegistry.js';
import { WebviewViewPane } from '../../../webviewView/browser/webviewViewPane.js';
import { chatSessionPanelRegistry, IChatDraftRequestService, IChatInputSuggestionService, IChatSessionAnnotationService, IChatSessionAttentionService, IChatSessionObserverService } from '../../common/sessionObserver/chatSessionObserver.js';
import { ChatSessionAnnotationService } from './chatSessionAnnotationService.js';
import { ChatSessionAttentionService } from './chatSessionAttentionService.js';
import { ChatContextKeys } from '../../common/actions/chatContextKeys.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { ChatViewContainerId, IChatWidget, IChatWidgetService } from '../chat.js';
import { ChatDraftRequestService } from './chatDraftRequestService.js';
import { ChatInputSuggestionService } from './chatInputSuggestionService.js';
import { ChatSessionObserverService } from './chatSessionObserverService.js';

registerSingleton(IChatSessionObserverService, ChatSessionObserverService, InstantiationType.Delayed);
registerSingleton(IChatDraftRequestService, ChatDraftRequestService, InstantiationType.Delayed);
registerSingleton(IChatInputSuggestionService, ChatInputSuggestionService, InstantiationType.Delayed);
registerSingleton(IChatSessionAnnotationService, ChatSessionAnnotationService, InstantiationType.Delayed);
registerSingleton(IChatSessionAttentionService, ChatSessionAttentionService, InstantiationType.Delayed);

// ---- N4: panels beside the active chat session (proposed API `chatSessionPanel`) ----

interface IChatSessionPanelContribution {
	readonly id: string;
	readonly title: string;
	readonly icon?: string;
	readonly when?: string;
}

const chatSessionPanelsExtensionPoint = ExtensionsRegistry.registerExtensionPoint<IChatSessionPanelContribution[]>({
	extensionPoint: 'chatSessionPanels',
	jsonSchema: {
		description: localize('chatSessionPanels', "Contributes webview panels that live beside the active chat session (proposed API `chatSessionPanel`)."),
		type: 'array',
		items: {
			type: 'object',
			additionalProperties: false,
			required: ['id', 'title'],
			properties: {
				id: { type: 'string', description: localize('chatSessionPanels.id', "The panel id; also the id passed to `registerChatSessionPanelProvider`.") },
				title: { type: 'string', description: localize('chatSessionPanels.title', "The panel title.") },
				icon: { type: 'string', description: localize('chatSessionPanels.icon', "A codicon id, e.g. `pulse`.") },
				when: { type: 'string', description: localize('chatSessionPanels.when', "In editor windows, a condition for showing the panel as a view beside the chat, as for any view. The Agents Window always offers the panel as a side-pane tab.") },
			},
		},
	},
	activationEventsGenerator: function* (contributions) {
		for (const c of contributions) {
			yield `onView:${c.id}`;
		}
	},
});

class ChatSessionPanelsContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.chatSessionPanels';

	private readonly registered = this._register(new DisposableMap<string>());

	constructor(@IWorkbenchEnvironmentService environmentService: IWorkbenchEnvironmentService) {
		super();
		const viewsRegistry = Registry.as<IViewsRegistry>(ViewExtensions.ViewsRegistry);
		const containers = Registry.as<IViewContainersRegistry>(ViewExtensions.ViewContainersRegistry);
		chatSessionPanelsExtensionPoint.setHandler((_extensions, delta) => {
			for (const ext of delta.removed) {
				for (const c of ext.value) {
					this.registered.deleteAndDispose(c.id);
				}
			}
			for (const ext of delta.added) {
				if (!isProposedApiEnabled(ext.description, 'chatSessionPanel')) {
					ext.collector.error(localize('chatSessionPanels.proposal', "Contributing `chatSessionPanels` requires the `chatSessionPanel` API proposal."));
					continue;
				}
				for (const c of ext.value) {
					// The Agents Window shows panels as side-pane tabs (vs/sessions/contrib/chatSessionPanels).
					if (environmentService.isSessionsWindow) {
						this.registered.set(c.id, chatSessionPanelRegistry.register({ id: c.id, title: c.title, ...(c.icon ? { icon: c.icon.replace(/^\$\((.*)\)$/, '$1') } : {}), extensionId: ext.description.identifier.value }));
						continue;
					}
					// Editor windows: stacked with the Chat view in its container.
					const container = containers.get(ChatViewContainerId);
					if (!container) {
						continue;
					}
					const icon = c.icon ? ThemeIcon.fromString(c.icon) : undefined;
					const descriptor: ICustomViewDescriptor = {
						type: 'webview',
						id: c.id,
						name: { value: c.title, original: c.title },
						ctorDescriptor: new SyncDescriptor(WebviewViewPane),
						containerIcon: icon ?? Codicon.pulse,
						canToggleVisibility: true,
						canMoveView: true,
						collapsed: false,
						order: -1,
						extensionId: ext.description.identifier,
						originalContainerId: container.id,
						windowEnablement: WindowEnablement.Editor,
						...(c.when ? { when: ContextKeyExpr.deserialize(c.when) } : {}),
					};
					viewsRegistry.registerViews([descriptor], container);
					this.registered.set(c.id, { dispose: () => viewsRegistry.deregisterViews([descriptor], container) });
				}
			}
		});
	}
}

registerWorkbenchContribution2(ChatSessionPanelsContribution.ID, ChatSessionPanelsContribution, WorkbenchPhase.BlockStartup);

/** Keeps each chat widget's `chatSessionHasDraftRequest` key current, for the draft keyboard actions. */
class ChatDraftRequestContextContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.chatDraftRequestContext';

	private readonly widgets = this._register(new DisposableMap<IChatWidget>());

	constructor(
		@IChatWidgetService widgetService: IChatWidgetService,
		@IChatDraftRequestService private readonly drafts: IChatDraftRequestService,
	) {
		super();
		for (const w of widgetService.getAllWidgets()) {
			this.track(w);
		}
		this._register(widgetService.onDidAddWidget(w => this.track(w)));
		this._register(widgetService.onDidRemoveWidget(w => this.widgets.deleteAndDispose(w)));
	}

	private track(widget: IChatWidget): void {
		if (this.widgets.has(widget)) {
			return;
		}
		const store = new DisposableStore();
		const key = ChatContextKeys.hasDraftRequest.bindTo(widget.scopedContextKeyService);
		const update = () => {
			const session = widget.viewModel?.sessionResource;
			key.set(!!session && this.drafts.getDrafts(session).length > 0);
		};
		update();
		store.add(widget.onDidChangeViewModel(update));
		store.add(this.drafts.onDidChangeDrafts(uri => {
			if (uri.toString() === widget.viewModel?.sessionResource.toString()) {
				update();
			}
		}));
		store.add({ dispose: () => key.reset() });
		this.widgets.set(widget, store);
	}
}

registerWorkbenchContribution2(ChatDraftRequestContextContribution.ID, ChatDraftRequestContextContribution, WorkbenchPhase.AfterRestored);
