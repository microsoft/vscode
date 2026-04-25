/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../../base/common/uri.js';
import { Selection } from '../../../../../editor/common/core/selection.js';
import { CodeEditorWidget, ICodeEditorWidgetOptions } from '../../../../../editor/browser/widget/codeEditor/codeEditorWidget.js';
import { ComponentFixtureContext, createEditorServices, createTextModel, defineComponentFixture, defineThemedFixtureGroup, registerWorkbenchServices } from '../fixtureUtils.js';
import { InlineChatEditorAffordance } from '../../../../contrib/inlineChat/browser/inlineChatEditorAffordance.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { ContextKeyService } from '../../../../../platform/contextkey/browser/contextKeyService.js';
import { EditorContextKeys } from '../../../../../editor/common/editorContextKeys.js';
import { IMenuService, MenuId, MenuRegistry } from '../../../../../platform/actions/common/actions.js';
import { MenuService } from '../../../../../platform/actions/common/menuService.js';
import { ChatContextKeys } from '../../../../contrib/chat/common/actions/chatContextKeys.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { observableCodeEditor } from '../../../../../editor/browser/observableCodeEditor.js';


// Register menu items
import '../../../../contrib/inlineChat/browser/inlineChatActions.js';
import '../../../../../editor/contrib/codeAction/browser/codeActionContributions.js';

import '../../../../contrib/inlineChat/browser/media/inlineChatEditorAffordance.css';
import '../../../../../base/browser/ui/codicons/codiconStyles.js';

const SAMPLE_CODE = `function greet(name: string): string {
	return "Hello, " + name;
}

greet("World");
`;

function renderInlineChatAffordance({ container, disposableStore, theme }: ComponentFixtureContext, withSelection: boolean): void {
	container.style.width = '500px';
	container.style.height = '180px';
	container.style.border = '1px solid var(--vscode-editorWidget-border)';

	// Register fake menu items scoped to this fixture's lifetime
	disposableStore.add(MenuRegistry.appendMenuItem(MenuId.InlineChatEditorAffordance, {
		group: '0_chat', order: 2, when: ChatContextKeys.enabled,
		command: { id: 'workbench.action.chat.attachSelection', title: 'Add Selection to Chat', icon: Codicon.attach },
	}));

	const instantiationService = createEditorServices(disposableStore, {
		colorTheme: theme,
		additionalServices: (reg) => {
			registerWorkbenchServices(reg);
			reg.define(IContextKeyService, ContextKeyService);
			reg.define(IMenuService, MenuService);
		},
	});

	const textModel = disposableStore.add(createTextModel(
		instantiationService,
		SAMPLE_CODE,
		URI.parse('inmemory://inline-chat.ts'),
		'typescript'
	));

	const editor = disposableStore.add(instantiationService.createInstance(
		CodeEditorWidget,
		container,
		{
			automaticLayout: true,
			minimap: { enabled: false },
			lineNumbers: 'on',
			scrollBeyondLastLine: false,
			fontSize: 14,
			cursorBlinking: 'solid',
		},
		{ contributions: [] } satisfies ICodeEditorWidgetOptions
	));

	editor.setModel(textModel);

	// Set context keys required by InlineChatEditorAffordance menu items
	const contextKeyService = instantiationService.get(IContextKeyService);
	EditorContextKeys.readOnly.bindTo(contextKeyService).set(false);
	EditorContextKeys.hasNonEmptySelection.bindTo(contextKeyService).set(withSelection);
	EditorContextKeys.hasCodeActionsProvider.bindTo(contextKeyService).set(true);
	ChatContextKeys.enabled.bindTo(contextKeyService).set(true);

	const selection = withSelection
		? new Selection(2, 9, 2, 28)
		: new Selection(2, 1, 2, 1);
	editor.setSelection(selection);
	editor.focus();

	disposableStore.add(instantiationService.createInstance(
		InlineChatEditorAffordance,
		editor,
		observableCodeEditor(editor).cursorSelection.map(sel => sel ?? undefined),
	));
}

export default defineThemedFixtureGroup({ path: 'editor/' }, {
	InlineChatAffordance: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: (context) => renderInlineChatAffordance(context, true),
	}),
});
