/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from '../../../../../base/browser/dom.js';
import { onUnexpectedError } from '../../../../../base/common/errors.js';
import { Event } from '../../../../../base/common/event.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { localize } from '../../../../../nls.js';
import { AccessibleContentProvider, AccessibleViewProviderId, AccessibleViewType } from '../../../../../platform/accessibility/browser/accessibleView.js';
import { AccessibleViewRegistry, IAccessibleViewImplementation } from '../../../../../platform/accessibility/browser/accessibleViewRegistry.js';
import { ModelRouterEnabledSettingId } from '../../../../../platform/agentHost/common/modelRouterConfig.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { SyncDescriptor } from '../../../../../platform/instantiation/common/descriptors.js';
import { IInstantiationService, ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { EditorPaneDescriptor, IEditorPaneRegistry } from '../../../../browser/editor.js';
import { ActiveEditorContext } from '../../../../common/contextkeys.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../common/contributions.js';
import { EditorExtensions, EditorsOrder, IEditorFactoryRegistry, IEditorSerializer } from '../../../../common/editor.js';
import { IChatEntitlementService } from '../../../../services/chat/common/chatEntitlementService.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { AccessibilityVerbositySettingId } from '../../../accessibility/browser/accessibilityConfiguration.js';
import { ChatContextKeys } from '../../common/actions/chatContextKeys.js';
import { ModelRoutersEditor } from './modelRoutersEditor.js';
import { ModelRoutersEditorInput } from './modelRoutersEditorInput.js';

// Model routers are read by this window's own Copilot agent, which only a desktop window has. The editor
// pane registered here is what makes the Language Models command open the Model Routers editor beside it.
Registry.as<IEditorPaneRegistry>(EditorExtensions.EditorPane).registerEditorPane(
	EditorPaneDescriptor.create(ModelRoutersEditor, ModelRoutersEditor.ID, localize('modelRoutersEditor', "Model Routers Editor")),
	[new SyncDescriptor(ModelRoutersEditorInput)]
);

/** Whether the editor has a place in this window: model routers are turned on, and AI features are not hidden. */
function isModelRoutersEditorOffered(configurationService: IConfigurationService, chatEntitlementService: IChatEntitlementService): boolean {
	return configurationService.getValue(ModelRouterEnabledSettingId) === true && !chatEntitlementService.sentiment.hidden;
}

class ModelRoutersEditorInputSerializer implements IEditorSerializer {

	canSerialize(): boolean {
		return true;
	}

	serialize(): string {
		return '';
	}

	deserialize(instantiationService: IInstantiationService): ModelRoutersEditorInput | undefined {
		return instantiationService.invokeFunction(accessor => isModelRoutersEditorOffered(accessor.get(IConfigurationService), accessor.get(IChatEntitlementService))) ? new ModelRoutersEditorInput() : undefined;
	}
}

Registry.as<IEditorFactoryRegistry>(EditorExtensions.EditorFactory).registerEditorSerializer(ModelRoutersEditorInput.ID, ModelRoutersEditorInputSerializer);

/** Closes the Model Routers editors when model routers are turned off or AI features are hidden. */
class ModelRoutersEditorEnablement extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.modelRoutersEditorEnablement';

	constructor(
		@IConfigurationService configurationService: IConfigurationService,
		@IChatEntitlementService chatEntitlementService: IChatEntitlementService,
		@IEditorService editorService: IEditorService,
	) {
		super();
		const closeUnlessOffered = () => {
			if (!isModelRoutersEditorOffered(configurationService, chatEntitlementService)) {
				editorService.closeEditors(editorService.getEditors(EditorsOrder.SEQUENTIAL).filter(({ editor }) => editor instanceof ModelRoutersEditorInput)).catch(onUnexpectedError);
			}
		};
		this._register(Event.filter(configurationService.onDidChangeConfiguration, e => e.affectsConfiguration(ModelRouterEnabledSettingId))(closeUnlessOffered));
		this._register(chatEntitlementService.onDidChangeSentiment(closeUnlessOffered));
	}
}

registerWorkbenchContribution2(ModelRoutersEditorEnablement.ID, ModelRoutersEditorEnablement, WorkbenchPhase.AfterRestored);

class ModelRoutersAccessibility implements IAccessibleViewImplementation {
	readonly priority = 125;
	readonly name = 'model-routers';
	readonly when = ContextKeyExpr.and(ChatContextKeys.enabled, ActiveEditorContext.isEqualTo(ModelRoutersEditor.ID));

	constructor(readonly type: AccessibleViewType) { }

	getProvider(accessor: ServicesAccessor): AccessibleContentProvider | undefined {
		const editor = accessor.get(IEditorService).activeEditorPane;
		if (!(editor instanceof ModelRoutersEditor)) {
			return undefined;
		}
		// The form for a router has its own help, and its fields read as they are.
		const routers = editor.getAccessibilityContent();
		if (editor.isShowingForm) {
			return this.type === AccessibleViewType.Help ? this.provide(editor, localize('modelRouters.help.form', "Give the router a name and say what it is for, then for each route choose its model and say when to use it. Use Tab and Shift+Tab to move between the fields. Add Route adds a route, and a route's Remove button takes it out. Create or Save writes the router's file, and Cancel goes back to the routers without writing it. What is wrong with the router is said above those buttons.")) : undefined;
		}
		if (!routers) {
			return undefined;
		}
		const content = this.type === AccessibleViewType.Help ? [
			localize('modelRouters.help.overview', "A model router sends each chat to the route that best matches your request. The tree lists each router with its routes as children: a route's name, its model and settings, and when it is used. The first route is used when no route clearly fits."),
			localize('modelRouters.help.navigation', "Use Tab and Shift+Tab to move between search, Add Router, the tree, and the actions of the focused router. Use the Up Arrow, Down Arrow, Home, and End keys to navigate, and the Left Arrow and Right Arrow keys to collapse or expand a router. Press Enter on a router or a route to edit the router in a form."),
			localize('modelRouters.help.actions', "On a router, Tab to the Route Switching switch and press Space to change whether a chat can move to another route after its first message, or to More Actions to edit the router, open its file, or edit it with AI. Press Enter on Add Router to enter a new router in a form."),
		].join('\n\n') : routers;
		return this.provide(editor, content);
	}

	private provide(editor: ModelRoutersEditor, content: string): AccessibleContentProvider {
		const focused = DOM.getActiveElement();
		return new AccessibleContentProvider(
			AccessibleViewProviderId.ModelRouters,
			{ type: this.type, language: 'plaintext' },
			() => content,
			() => DOM.isHTMLElement(focused) && focused.isConnected ? focused.focus() : editor.focus(),
			// Routers are a customization of the agent, so they follow the hint setting of the other customization pages.
			AccessibilityVerbositySettingId.CustomizationDiscovery,
		);
	}
}

AccessibleViewRegistry.register(new ModelRoutersAccessibility(AccessibleViewType.Help));
AccessibleViewRegistry.register(new ModelRoutersAccessibility(AccessibleViewType.View));
