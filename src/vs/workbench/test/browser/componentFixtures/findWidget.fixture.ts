/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../base/common/uri.js';
import { IContextViewProvider } from '../../../../base/browser/ui/contextview/contextview.js';
import { ComponentFixtureContext, createEditorServices, createTextModel, defineComponentFixture, defineThemedFixtureGroup } from './fixtureUtils.js';
import { CodeEditorWidget, ICodeEditorWidgetOptions } from '../../../../editor/browser/widget/codeEditor/codeEditorWidget.js';
import { FindReplaceState } from '../../../../editor/contrib/find/browser/findState.js';
import { FindWidget, IFindController } from '../../../../editor/contrib/find/browser/findWidget.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IAccessibilityService } from '../../../../platform/accessibility/common/accessibility.js';

import '../../../../editor/contrib/find/browser/findWidget.css';
import '../../../../base/browser/ui/codicons/codiconStyles.js';

const SAMPLE_CODE = `import { useState } from 'react';

function Counter({ initialCount }: { initialCount: number }) {
	const [count, setCount] = useState(initialCount);

	return (
		<div>
			<p>Count: {count}</p>
			<button onClick={() => setCount(count + 1)}>Increment</button>
			<button onClick={() => setCount(count - 1)}>Decrement</button>
		</div>
	);
}

export default Counter;
`;

interface FindFixtureOptions extends ComponentFixtureContext {
	searchString?: string;
	replaceString?: string;
	showReplace?: boolean;
	matchesCount?: number;
	matchesPosition?: number;
}

async function renderFindWidget(options: FindFixtureOptions): Promise<void> {
	const { container, disposableStore, theme } = options;
	container.style.width = '600px';
	container.style.height = '350px';
	container.style.border = '1px solid var(--vscode-editorWidget-border)';

	const instantiationService = createEditorServices(disposableStore, { colorTheme: theme });

	const textModel = disposableStore.add(createTextModel(
		instantiationService,
		SAMPLE_CODE,
		URI.parse('inmemory://find-fixture.tsx'),
		'typescript'
	));

	const editorWidgetOptions: ICodeEditorWidgetOptions = {
		contributions: []
	};

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
			find: { addExtraSpaceOnTop: false },
		},
		editorWidgetOptions
	));

	editor.setModel(textModel);
	editor.focus();

	const state = disposableStore.add(new FindReplaceState());

	const mockController: IFindController = {
		replace: () => { },
		replaceAll: () => { },
		getGlobalBufferTerm: async () => '',
	};

	const mockContextViewProvider: IContextViewProvider = {
		showContextView: () => { },
		hideContextView: () => { },
		layout: () => { },
	};

	disposableStore.add(new FindWidget(
		editor,
		mockController,
		state,
		mockContextViewProvider,
		instantiationService.get(IKeybindingService),
		instantiationService.get(IContextKeyService),
		instantiationService.get(IHoverService),
		undefined,
		undefined,
		instantiationService.get(IConfigurationService),
		instantiationService.get(IAccessibilityService),
	));

	state.change({
		searchString: options.searchString ?? 'count',
		isRevealed: true,
		isReplaceRevealed: options.showReplace ?? false,
		replaceString: options.replaceString ?? '',
	}, false);

	// Wait for the CSS transition (top: -64px → 0, 200ms linear)
	await new Promise(resolve => setTimeout(resolve, 300));
}

export default defineThemedFixtureGroup({
	Find: defineComponentFixture({
		render: (context) => renderFindWidget({ ...context, searchString: 'count' }),
	}),
	FindAndReplace: defineComponentFixture({
		render: (context) => renderFindWidget({ ...context, searchString: 'count', replaceString: 'value', showReplace: true }),
	}),
});
