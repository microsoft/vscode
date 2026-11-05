/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mainWindow } from '../../../base/browser/window.js';
import { DisposableStore } from '../../../base/common/lifecycle.js';
import { constObservable } from '../../../base/common/observable.js';
import { URI } from '../../../base/common/uri.js';
import { upcastPartial } from '../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../base/test/common/utils.js';
import { IContextKeyService } from '../../../platform/contextkey/common/contextkey.js';
import { SyncDescriptor } from '../../../platform/instantiation/common/descriptors.js';
import { ServiceCollection } from '../../../platform/instantiation/common/serviceCollection.js';
import { Registry } from '../../../platform/registry/common/platform.js';
import { NullTelemetryService } from '../../../platform/telemetry/common/telemetryUtils.js';
import { TestThemeService } from '../../../platform/theme/test/common/testThemeService.js';
import { EditorPaneDescriptor, IEditorPaneRegistry } from '../../../workbench/browser/editor.js';
import { EditorPane } from '../../../workbench/browser/parts/editor/editorPane.js';
import { EditorExtensions } from '../../../workbench/common/editor.js';
import { IEditorGroup } from '../../../workbench/services/editor/common/editorGroupsService.js';
import { createEditorPart, TestFileEditorInput, workbenchInstantiationService } from '../../../workbench/test/browser/workbenchTestServices.js';
import { EditorParts } from '../../browser/parts/editorParts.js';
import { AgentWorkbenchLayout, IAgentWorkbenchLayoutService } from '../../browser/workbench.js';
import { TestStorageService } from '../../../workbench/test/common/workbenchTestServices.js';
import { ActiveSessionHost, createMainWindowInstantiationService, ISessionHost, ISessionHostService, SessionHostKind } from '../../services/sessions/browser/sessionHost.js';

const EDITOR_ID = 'test.mainWindowSessionHost.editor';
const INPUT_ID = 'test.mainWindowSessionHost.input';

let paneStorage: TestStorageService;

/** An editor pane that injects the session host of its scope. */
class HostEditorPane extends EditorPane {
	constructor(group: IEditorGroup, @ISessionHost readonly host: ISessionHost) {
		super(EDITOR_ID, group, NullTelemetryService, new TestThemeService(), paneStorage);
	}
	protected createEditor(): void { }
	layout(): void { }
}

suite('Main window session host', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	let store: DisposableStore;
	setup(() => store = disposables.add(new DisposableStore()));

	function hostOf(kind: SessionHostKind, parent?: ISessionHost): ISessionHost {
		return new ActiveSessionHost({ kind, parent, session: constObservable(undefined), contextKeyService: upcastPartial<IContextKeyService>({}), windowId: kind === SessionHostKind.MainWindow ? constObservable(mainWindow.vscodeWindowId) : undefined });
	}

	test('the main window\'s parts give their editors the grid host, and a scope nested in them its own host', async () => {
		paneStorage = disposables.add(new TestStorageService());
		const gridHost = hostOf(SessionHostKind.MainWindow);
		const instantiationService = workbenchInstantiationService(undefined, disposables);
		instantiationService.stub(ISessionHostService, upcastPartial<ISessionHostService>({ getHostOfWindow: windowId => windowId === mainWindow.vscodeWindowId ? gridHost : undefined }));
		disposables.add(Registry.as<IEditorPaneRegistry>(EditorExtensions.EditorPane).registerEditorPane(EditorPaneDescriptor.create(HostEditorPane, EDITOR_ID, 'Host Editor'), [new SyncDescriptor(TestFileEditorInput)]));
		const mainWindowInstantiationService = disposables.add(createMainWindowInstantiationService(instantiationService));

		// A real editor part, as the main window creates it: its groups and their editor panes inherit its scope.
		const part = await createEditorPart(mainWindowInstantiationService, store);
		await part.activeGroup.openEditor(disposables.add(new TestFileEditorInput(URI.file('/file'), INPUT_ID)));
		const pane = part.activeGroup.activeEditorPane;

		// A pane's own scope, as a session view provides it, overrides the window's.
		const paneHost = hostOf(SessionHostKind.Pane, gridHost);
		const nested = disposables.add(mainWindowInstantiationService.createChild(new ServiceCollection([ISessionHost, paneHost]))).invokeFunction(accessor => accessor.get(ISessionHost));

		assert.deepStrictEqual({
			editor: pane instanceof HostEditorPane && pane.host === gridHost,
			nested: nested === paneHost,
		}, { editor: true, nested: true });
	});

	test('the Sessions editor parts give the editors of modal parts the grid host, and a part created with a host of its own, as a chat window\'s, that host', async () => {
		paneStorage = disposables.add(new TestStorageService());
		const gridHost = hostOf(SessionHostKind.MainWindow);
		const chatWindowHost = hostOf(SessionHostKind.ChatWindow);
		const instantiationService = workbenchInstantiationService(undefined, disposables);
		instantiationService.stub(ISessionHostService, upcastPartial<ISessionHostService>({ getHostOfWindow: windowId => windowId === mainWindow.vscodeWindowId ? gridHost : undefined }));
		disposables.add(Registry.as<IEditorPaneRegistry>(EditorExtensions.EditorPane).registerEditorPane(EditorPaneDescriptor.create(HostEditorPane, EDITOR_ID, 'Host Editor'), [new SyncDescriptor(TestFileEditorInput)]));
		// The agent layout service refines the workbench layout service: same service, one more property.
		const layoutService = instantiationService.get(IAgentWorkbenchLayoutService);
		instantiationService.stub(IAgentWorkbenchLayoutService, Object.assign(Object.create(layoutService), { agentWorkbenchLayout: AgentWorkbenchLayout.Mobile }));
		const parts = store.add(instantiationService.createInstance(EditorParts));
		parts.mainPart.create(document.createElement('div'));
		parts.mainPart.layout(1080, 800, 0, 0);
		await parts.whenReady;
		const hostOfOpenedPane = async (group: IEditorGroup) => {
			await group.openEditor(store.add(new TestFileEditorInput(URI.file(`/file${group.id}`), INPUT_ID)));
			const pane = group.activeEditorPane;
			return pane instanceof HostEditorPane ? pane.host : undefined;
		};

		const modal = await parts.createModalEditorPart();
		const modalHost = await hostOfOpenedPane(modal.activeGroup);
		await modal.close();
		const container = document.createElement('div');
		const chatWindowPart = parts.createEditorPart({ container, services: new ServiceCollection([ISessionHost, chatWindowHost]) });
		store.add({ dispose: () => chatWindowPart.close() });
		const chatWindowPaneHost = await hostOfOpenedPane(chatWindowPart.activeGroup);

		assert.deepStrictEqual({ modal: modalHost === gridHost, chatWindow: chatWindowPaneHost === chatWindowHost }, { modal: true, chatWindow: true });
	});
});
