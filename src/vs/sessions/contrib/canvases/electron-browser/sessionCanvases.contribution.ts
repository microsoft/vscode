/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { isEqual } from '../../../../base/common/resources.js';
import { localize, localize2 } from '../../../../nls.js';
import { AccessibleViewRegistry } from '../../../../platform/accessibility/browser/accessibleViewRegistry.js';
import { AccessibleViewType, IAccessibleViewService } from '../../../../platform/accessibility/browser/accessibleView.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { ConfigurationScope, Extensions as ConfigurationExtensions, IConfigurationRegistry } from '../../../../platform/configuration/common/configurationRegistry.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IInstantiationService, ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { IListService } from '../../../../platform/list/browser/listService.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { EditorPaneDescriptor, IEditorPaneRegistry } from '../../../../workbench/browser/editor.js';
import { resolveCommandsContext } from '../../../../workbench/browser/parts/editor/editorCommandsContext.js';
import { IsAuxiliaryWindowContext, IsSessionsWindowContext, IsTopRightEditorGroupContext } from '../../../../workbench/common/contextkeys.js';
import { registerWorkbenchContribution2, WorkbenchPhase } from '../../../../workbench/common/contributions.js';
import { EditorExtensions, IEditorFactoryRegistry } from '../../../../workbench/common/editor.js';
import { ChatContextKeys } from '../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { IEditorResolverService, RegisteredEditorPriority } from '../../../../workbench/services/editor/common/editorResolverService.js';
import { IEditorService } from '../../../../workbench/services/editor/common/editorService.js';
import { IEditorGroupsService } from '../../../../workbench/services/editor/common/editorGroupsService.js';
import { Menus } from '../../../browser/menus.js';
import { SessionSupportsCanvasesContext } from '../../../common/contextkeys.js';
import { SessionsCategories } from '../../../common/categories.js';
import { SessionCanvasesEnabledSettingId, SessionCanvasUri, type ISessionCanvasReference } from '../../../services/sessions/common/sessionCanvases.js';
import { ISessionCanvasService, SessionCanvasInput, SessionCanvasSerializer } from '../common/sessionCanvas.js';
import { canvasReferenceFromContext, SessionCanvasActions, SessionCanvasCommands } from './sessionCanvasActions.js';
import { SessionCanvasEditor, sessionCanvasCanManage, sessionCanvasFocused } from './sessionCanvasEditor.js';
import { SessionCanvasService } from './sessionCanvasService.js';

const enabled = ContextKeyExpr.and(IsSessionsWindowContext, IsAuxiliaryWindowContext.toNegated(), ChatContextKeys.enabled, ContextKeyExpr.equals(`config.${SessionCanvasesEnabledSettingId}`, true));
const active = ContextKeyExpr.and(enabled, ContextKeyExpr.equals('activeEditor', SessionCanvasInput.EDITOR_ID));
const canManage = ContextKeyExpr.and(active, sessionCanvasCanManage);
Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).registerConfiguration({
	id: 'sessions', title: localize('canvas.configurationTitle', "Agents"),
	properties: {
		[SessionCanvasesEnabledSettingId]: {
			type: 'boolean', default: false, scope: ConfigurationScope.WINDOW, tags: ['experimental'],
			markdownDescription: localize('canvas.configurationDescription', "Show native canvas views in the local Agents window when the connected runtime supports them. This preview preference does not approve extension execution, grant environment access, or override runtime policy. Web, remote execution, and moving views between windows are not supported."),
		},
	},
});
registerSingleton(ISessionCanvasService, SessionCanvasService, InstantiationType.Delayed);
Registry.as<IEditorPaneRegistry>(EditorExtensions.EditorPane).registerEditorPane(
	EditorPaneDescriptor.create(SessionCanvasEditor, SessionCanvasInput.EDITOR_ID, localize('canvas.editor', "Canvas")),
	[new SyncDescriptor(SessionCanvasInput)],
);
Registry.as<IEditorFactoryRegistry>(EditorExtensions.EditorFactory).registerEditorSerializer(SessionCanvasInput.ID, SessionCanvasSerializer);

class SessionCanvasesContribution extends Disposable {
	static readonly ID = 'sessions.contrib.canvases';
	constructor(
		@IEditorResolverService resolverService: IEditorResolverService,
		@ISessionCanvasService canvasService: ISessionCanvasService,
	) {
		super();
		this._register(resolverService.registerEditor(`${SessionCanvasUri.scheme}:/**`, {
			id: SessionCanvasInput.EDITOR_ID, label: localize('canvas.editor', "Canvas"), priority: RegisteredEditorPriority.exclusive,
		}, { singlePerResource: true }, {
			createEditorInput: ({ resource, options }) => ({ editor: canvasService.getInput(resource), options }),
		}));
		for (const type of [AccessibleViewType.Help, AccessibleViewType.View]) {
			this._register(AccessibleViewRegistry.register({
				type, priority: 200, name: `sessionCanvas-${type}`, when: ContextKeyExpr.and(active, sessionCanvasFocused),
				getProvider: accessor => {
					const pane = accessor.get(IEditorService).activeEditorPane;
					return pane instanceof SessionCanvasEditor ? pane.createAccessibleProvider(type) : undefined;
				},
			}));
		}
	}
}
registerWorkbenchContribution2(SessionCanvasesContribution.ID, SessionCanvasesContribution, WorkbenchPhase.BlockRestore);

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: SessionCanvasCommands.manage, title: localize2('canvas.manage', "Canvases…"), category: SessionsCategories.Sessions, icon: Codicon.preview, f1: true,
			precondition: ContextKeyExpr.and(enabled, SessionSupportsCanvasesContext),
			menu: [
				{ id: Menus.SessionBarToolbar, group: 'navigation', order: 30, when: ContextKeyExpr.and(enabled, SessionSupportsCanvasesContext) },
				{ id: Menus.SessionsEditorTabsBarAddTab, group: 'navigation', order: 4, when: ContextKeyExpr.and(enabled, IsTopRightEditorGroupContext, SessionSupportsCanvasesContext) },
			],
		});
	}
	async run(accessor: ServicesAccessor, context?: unknown): Promise<void> {
		await accessor.get(IInstantiationService).createInstance(SessionCanvasActions).manage(context);
	}
});

function references(accessor: ServicesAccessor, args: unknown[]): ISessionCanvasReference[] {
	const explicit = canvasReferenceFromContext(args[0]);
	if (explicit) {
		return [explicit];
	}
	const context = resolveCommandsContext(args, accessor.get(IEditorService), accessor.get(IEditorGroupsService), accessor.get(IListService));
	return context.groupedEditors.flatMap(group => group.editors.filter((editor): editor is SessionCanvasInput => editor instanceof SessionCanvasInput).map(editor => editor.reference));
}

registerAction2(class extends Action2 {
	constructor() {
		super({ id: SessionCanvasCommands.reload, title: localize2('canvas.reload', "Reload View"), category: SessionsCategories.Sessions, icon: Codicon.refresh, f1: true, precondition: canManage, menu: [{ id: Menus.Canvas, group: 'navigation', order: 1, when: enabled }] });
	}
	run(accessor: ServicesAccessor, ...args: unknown[]): void {
		for (const reference of references(accessor, args)) {
			accessor.get(ISessionCanvasService).reload(reference);
		}
	}
});
registerAction2(class extends Action2 {
	constructor() {
		super({ id: SessionCanvasCommands.close, title: localize2('canvas.close', "Close Canvas"), category: SessionsCategories.Sessions, icon: Codicon.close, f1: true, precondition: canManage, menu: [{ id: Menus.Canvas, group: 'manage', order: 3, when: enabled }] });
	}
	async run(accessor: ServicesAccessor, ...args: unknown[]): Promise<void> {
		const service = accessor.get(ISessionCanvasService);
		for (const reference of references(accessor, args)) {
			try {
				await service.close(reference);
			} catch (error) {
				throw new Error(localize('canvas.closeUncertain', "Close Canvas did not complete. Its outcome may be uncertain; check membership in Canvases before retrying."), { cause: error });
			}
		}
	}
});
registerAction2(class extends Action2 {
	constructor() {
		super({ id: SessionCanvasCommands.restart, title: localize2('canvas.restart', "Restart Canvas Provider…"), category: SessionsCategories.Sessions, f1: true, precondition: canManage, menu: [{ id: Menus.Canvas, group: 'manage', order: 2, when: enabled }] });
	}
	async run(accessor: ServicesAccessor, ...args: unknown[]): Promise<void> {
		const actions = accessor.get(IInstantiationService).createInstance(SessionCanvasActions);
		for (const reference of references(accessor, args)) {
			try {
				await actions.restart(reference);
			} catch (error) {
				throw new Error(localize('canvas.restartUnavailable', "The canvas provider could not be restarted. Recovery may be unsupported or the outcome uncertain. Check the owning runtime before trying again; the operation was not automatically retried."), { cause: error });
			}
		}
	}
});
registerAction2(class extends Action2 {
	constructor() {
		super({ id: SessionCanvasCommands.accessibleView, title: localize2('canvas.readAccessible', "Read Accessible Content"), icon: Codicon.book, precondition: active, menu: [{ id: Menus.Canvas, group: 'navigation', order: 2, when: enabled }] });
	}
	run(accessor: ServicesAccessor, ...args: unknown[]): void {
		const editorService = accessor.get(IEditorService);
		for (const reference of references(accessor, args)) {
			const resource = SessionCanvasUri.create(reference);
			const pane = editorService.visibleEditorPanes.find(pane => pane.input instanceof SessionCanvasInput && isEqual(pane.input.resource, resource));
			if (pane instanceof SessionCanvasEditor) {
				accessor.get(IAccessibleViewService).show(pane.createAccessibleProvider(AccessibleViewType.View));
				return;
			}
		}
	}
});
