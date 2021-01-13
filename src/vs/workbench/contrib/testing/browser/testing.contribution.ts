/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from 'vs/base/common/codicons';
import { KeyCode } from 'vs/base/common/keyCodes';
import { URI } from 'vs/base/common/uri';
import { ICodeEditor, isCodeEditor } from 'vs/editor/browser/editorBrowser';
import { EditorAction2, registerEditorContribution } from 'vs/editor/browser/editorExtensions';
import { localize } from 'vs/nls';
import { registerAction2 } from 'vs/platform/actions/common/actions';
import { CommandsRegistry } from 'vs/platform/commands/common/commands';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { SyncDescriptor } from 'vs/platform/instantiation/common/descriptors';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { Registry } from 'vs/platform/registry/common/platform';
import { Extensions as WorkbenchExtensions, IWorkbenchContributionsRegistry } from 'vs/workbench/common/contributions';
import { Extensions as ViewContainerExtensions, IViewContainersRegistry, IViewsRegistry, ViewContainerLocation } from 'vs/workbench/common/views';
import { testingViewIcon } from 'vs/workbench/contrib/testing/browser/icons';
import { TestingExplorerView } from 'vs/workbench/contrib/testing/browser/testingExplorerView';
import { TestingOutputPeekController } from 'vs/workbench/contrib/testing/browser/testingOutputPeek';
import { TestingViewPaneContainer } from 'vs/workbench/contrib/testing/browser/testingViewPaneContainer';
import { Testing } from 'vs/workbench/contrib/testing/common/constants';
import { TestIdWithProvider } from 'vs/workbench/contrib/testing/common/testCollection';
import { ITestingCollectionService, TestingCollectionService } from 'vs/workbench/contrib/testing/common/testingCollectionService';
import { TestingContentProvider } from 'vs/workbench/contrib/testing/common/testingContentProvider';
import { TestingContextKeys } from 'vs/workbench/contrib/testing/common/testingContextKeys';
import { ITestService } from 'vs/workbench/contrib/testing/common/testService';
import { TestService } from 'vs/workbench/contrib/testing/common/testServiceImpl';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { LifecyclePhase } from 'vs/workbench/services/lifecycle/common/lifecycle';
import * as Action from './testExplorerActions';

registerSingleton(ITestService, TestService);
registerSingleton(ITestingCollectionService, TestingCollectionService);

const viewContainer = Registry.as<IViewContainersRegistry>(ViewContainerExtensions.ViewContainersRegistry).registerViewContainer({
	id: Testing.ViewletId,
	name: localize('testing', "Testing"),
	ctorDescriptor: new SyncDescriptor(TestingViewPaneContainer),
	icon: testingViewIcon,
	alwaysUseContainerInfo: true,
	order: 5,
	hideIfEmpty: true,
}, ViewContainerLocation.Sidebar);


const viewsRegistry = Registry.as<IViewsRegistry>(ViewContainerExtensions.ViewsRegistry);

viewsRegistry.registerViewWelcomeContent(Testing.ExplorerViewId, {
	content: localize('noTestProvidersRegistered', "No test providers are registered for this workspace."),
});

viewsRegistry.registerViewWelcomeContent(Testing.ExplorerViewId, {
	content: localize(
		{
			key: 'searchMarketplaceForTestExtensions',
			comment: ['Please do not translate the word "commmand", it is part of our internal syntax which must not change'],
		},
		"[Search Marketplace](command:{0})",
		`workbench.extensions.search?${encodeURIComponent(JSON.stringify(['@tag:testing']))}`
	),
});

viewsRegistry.registerViews([{
	id: Testing.ExplorerViewId,
	name: localize('testExplorer', "Test Explorer"),
	ctorDescriptor: new SyncDescriptor(TestingExplorerView),
	canToggleVisibility: true,
	workspace: true,
	canMoveView: true,
	weight: 80,
	order: -999,
	containerIcon: testingViewIcon,
	// temporary until release, at which point we can show the welcome view:
	when: ContextKeyExpr.greater(TestingContextKeys.providerCount.serialize(), 0),
}], viewContainer);

registerAction2(Action.TestingViewAsListAction);
registerAction2(Action.TestingViewAsTreeAction);
registerAction2(Action.CancelTestRunAction);
registerAction2(Action.RunSelectedAction);
registerAction2(Action.DebugSelectedAction);
registerAction2(Action.TestingGroupByLocationAction);
registerAction2(Action.TestingGroupByStatusAction);
registerAction2(Action.RefreshTestsAction);

Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench).registerWorkbenchContribution(TestingContentProvider, LifecyclePhase.Eventually);

registerEditorContribution(Testing.OutputPeekContributionId, TestingOutputPeekController);

CommandsRegistry.registerCommand({
	id: 'vscode.runTests',
	handler: async (accessor: ServicesAccessor, tests: TestIdWithProvider[]) => {
		const testService = accessor.get(ITestService);
		testService.runTests({ debug: false, tests: tests.filter(t => t.providerId && t.testId) });
	}
});

CommandsRegistry.registerCommand({
	id: 'vscode.debugTests',
	handler: async (accessor: ServicesAccessor, tests: TestIdWithProvider[]) => {
		const testService = accessor.get(ITestService);
		testService.runTests({ debug: true, tests: tests.filter(t => t.providerId && t.testId) });
	}
});

CommandsRegistry.registerCommand({
	id: 'vscode.revealTestMessage',
	handler: async (accessor: ServicesAccessor, testRef: TestIdWithProvider, messageIndex: number) => {
		const editorService = accessor.get(IEditorService);
		const testService = accessor.get(ITestService);

		const test = await testService.lookupTest(testRef);
		const message = test?.item.state.messages[messageIndex];
		if (!test || !message?.location) {
			return;
		}

		const pane = await editorService.openEditor({
			resource: URI.revive(message.location.uri),
			options: { selection: message.location.range }
		});

		const control = pane?.getControl();
		if (!isCodeEditor(control)) {
			return;
		}

		TestingOutputPeekController.get(control).show(test, messageIndex);
	}
});

registerAction2(class CloseTestPeek extends EditorAction2 {
	constructor() {
		super({
			id: 'editor.closeTestPeek',
			title: localize('close', 'Close'),
			icon: Codicon.close,
			precondition: ContextKeyExpr.and(
				TestingContextKeys.peekVisible,
				ContextKeyExpr.not('config.editor.stablePeek')
			),
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib + 10,
				primary: KeyCode.Escape
			}
		});
	}

	runEditorCommand(_accessor: ServicesAccessor, editor: ICodeEditor): void {
		TestingOutputPeekController.get(editor).removePeek();
	}
});
