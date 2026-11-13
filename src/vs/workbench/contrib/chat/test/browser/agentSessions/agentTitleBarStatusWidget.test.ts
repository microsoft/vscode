/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mainWindow } from '../../../../../../base/browser/window.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IAction } from '../../../../../../base/common/actions.js';
import { IFolderLocation } from '../../../../../../platform/workspace/common/folderLocations.js';
import { URI } from '../../../../../../base/common/uri.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { IHoverService } from '../../../../../../platform/hover/browser/hover.js';
import { ICommandService } from '../../../../../../platform/commands/common/commands.js';
import { IKeybindingService } from '../../../../../../platform/keybinding/common/keybinding.js';
import { IWorkspaceContextService } from '../../../../../../platform/workspace/common/workspace.js';
import { IMenuService } from '../../../../../../platform/actions/common/actions.js';
import { IContextKeyService } from '../../../../../../platform/contextkey/common/contextkey.js';
import { IStorageService } from '../../../../../../platform/storage/common/storage.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { ITelemetryService } from '../../../../../../platform/telemetry/common/telemetry.js';
import { IEditorGroupsService } from '../../../../../services/editor/common/editorGroupsService.js';
import { IEditorService } from '../../../../../services/editor/common/editorService.js';
import { IChatEntitlementService } from '../../../../../services/chat/common/chatEntitlementService.js';
import { IChatWidgetService } from '../../../browser/chat.js';
import { IAgentSessionsService } from '../../../browser/agentSessions/agentSessionsService.js';
import { IAgentTitleBarStatusService } from '../../../browser/agentSessions/experiments/agentTitleBarStatusService.js';
import { AgentTitleBarStatusWidget } from '../../../browser/agentSessions/experiments/agentTitleBarStatusWidget.js';
import { WindowTitle } from '../../../../../browser/parts/titlebar/windowTitle.js';

suite('AgentTitleBarStatusWidget', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	/** A service whose events never fire and whose methods do nothing, for the parts the widget does not use here. */
	function inert<T extends object>(overrides: Partial<Record<keyof T, unknown>> = {}): T {
		return new Proxy(overrides, {
			get: (target, key) => {
				if (Object.prototype.hasOwnProperty.call(target, key)) {
					return (target as Record<PropertyKey, unknown>)[key];
				}
				if (typeof key === 'string' && key.startsWith('onDid')) {
					return Event.None;
				}
				return () => undefined;
			}
		}) as T;
	}

	function renderWidget(location: { current: IFolderLocation | undefined }, store: DisposableStore) {
		const instantiationService = store.add(new TestInstantiationService());
		const windowTitle = inert<WindowTitle>({
			workspaceName: 'repo-tasks',
			getCommandCenterLabel: () => 'repo-tasks',
			get folderLocationInfo() { return location.current; },
			getTitleDecorations: () => ({ prefix: undefined, suffix: undefined }),
			isCustomTitleFormat: () => false,
			onDidChange: new Emitter<void>().event
		});

		instantiationService.stub(IAgentTitleBarStatusService, inert<IAgentTitleBarStatusService>({ mode: 'default', sessionInfo: undefined }));
		instantiationService.stub(IHoverService, inert<IHoverService>());
		instantiationService.stub(ICommandService, inert<ICommandService>());
		instantiationService.stub(IKeybindingService, inert<IKeybindingService>());
		instantiationService.stub(IAgentSessionsService, inert<IAgentSessionsService>({ model: inert({ sessions: [] }) }));
		instantiationService.stub(IWorkspaceContextService, inert<IWorkspaceContextService>());
		instantiationService.stub(IEditorGroupsService, inert<IEditorGroupsService>({ partOptions: { showTabs: 'multiple' } }));
		instantiationService.stub(IEditorService, inert<IEditorService>());
		instantiationService.stub(IMenuService, inert<IMenuService>({ createMenu: () => inert({ getActions: () => [] }) }));
		instantiationService.stub(IContextKeyService, inert<IContextKeyService>());
		instantiationService.stub(IStorageService, inert<IStorageService>({ onDidChangeValue: () => Event.None, get: () => undefined, getBoolean: () => false, getNumber: () => 0 }));
		instantiationService.stub(IConfigurationService, inert<IConfigurationService>({ getValue: () => undefined }));
		instantiationService.stub(IChatEntitlementService, inert<IChatEntitlementService>());
		instantiationService.stub(IChatWidgetService, inert<IChatWidgetService>());
		instantiationService.stub(ITelemetryService, inert<ITelemetryService>());

		const container = mainWindow.document.body.appendChild(mainWindow.document.createElement('div'));
		store.add({ dispose: () => container.remove() });
		const widget = store.add(instantiationService.invokeFunction(accessor => accessor.get(IInstantiationService)).createInstance(AgentTitleBarStatusWidget, { id: 'test' } as IAction, windowTitle, undefined));
		widget.render(container);
		return { container, widget };
	}

	test('the focusable button keeps its Quick Access name and adds the folder location while switched', () => {
		const location = { current: undefined as IFolderLocation | undefined };
		const { container, widget } = renderWidget(location, disposables.add(new DisposableStore()));
		const name = () => container.querySelector('.agent-status-input-area')?.getAttribute('aria-label');

		const atPrimary = name();
		location.current = { uri: URI.file('/wt-1'), label: 'wt-1', description: 'feature-x', icon: Codicon.folder };
		(widget as unknown as { _lastRenderState: undefined; _render(): void })._lastRenderState = undefined;
		(widget as unknown as { _render(): void })._render();
		const atAlternate = name();
		location.current = undefined;
		(widget as unknown as { _lastRenderState: undefined })._lastRenderState = undefined;
		(widget as unknown as { _render(): void })._render();

		assert.deepStrictEqual({ atPrimary, atAlternate, afterReturn: name() }, {
			atPrimary: 'Open Quick Access',
			atAlternate: 'Open Quick Access, repo-tasks, branch feature-x',
			afterReturn: 'Open Quick Access'
		});
	});
});
