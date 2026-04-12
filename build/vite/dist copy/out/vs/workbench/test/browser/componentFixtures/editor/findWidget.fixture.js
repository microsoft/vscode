/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { URI } from '../../../../../base/common/uri.js';
import { createEditorServices, createTextModel, defineComponentFixture, defineThemedFixtureGroup } from '../fixtureUtils.js';
import { CodeEditorWidget } from '../../../../../editor/browser/widget/codeEditor/codeEditorWidget.js';
import { FindReplaceState } from '../../../../../editor/contrib/find/browser/findState.js';
import { FindWidget } from '../../../../../editor/contrib/find/browser/findWidget.js';
import { IKeybindingService } from '../../../../../platform/keybinding/common/keybinding.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IAccessibilityService } from '../../../../../platform/accessibility/common/accessibility.js';
import '../../../../../editor/contrib/find/browser/findWidget.css';
import '../../../../../base/browser/ui/codicons/codiconStyles.js';
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
async function renderFindWidget(options) {
    const { container, disposableStore, theme } = options;
    container.style.width = '600px';
    container.style.height = '350px';
    container.style.border = '1px solid var(--vscode-editorWidget-border)';
    const instantiationService = createEditorServices(disposableStore, { colorTheme: theme });
    const textModel = disposableStore.add(createTextModel(instantiationService, SAMPLE_CODE, URI.parse('inmemory://find-fixture.tsx'), 'typescript'));
    const editorWidgetOptions = {
        contributions: []
    };
    const editor = disposableStore.add(instantiationService.createInstance(CodeEditorWidget, container, {
        automaticLayout: true,
        minimap: { enabled: false },
        lineNumbers: 'on',
        scrollBeyondLastLine: false,
        fontSize: 14,
        cursorBlinking: 'solid',
        find: { addExtraSpaceOnTop: false },
    }, editorWidgetOptions));
    editor.setModel(textModel);
    editor.focus();
    const state = disposableStore.add(new FindReplaceState());
    const mockController = {
        replace: () => { },
        replaceAll: () => { },
        getGlobalBufferTerm: async () => '',
    };
    const mockContextViewProvider = {
        showContextView: () => { },
        hideContextView: () => { },
        layout: () => { },
    };
    disposableStore.add(new FindWidget(editor, mockController, state, mockContextViewProvider, instantiationService.get(IKeybindingService), instantiationService.get(IContextKeyService), instantiationService.get(IHoverService), undefined, undefined, instantiationService.get(IConfigurationService), instantiationService.get(IAccessibilityService)));
    state.change({
        searchString: options.searchString ?? 'count',
        isRevealed: true,
        isReplaceRevealed: options.showReplace ?? false,
        replaceString: options.replaceString ?? '',
    }, false);
    // Wait for the CSS transition (top: -64px → 0, 200ms linear)
    await new Promise(resolve => setTimeout(resolve, 300));
}
export default defineThemedFixtureGroup({ path: 'editor/' }, {
    Find: defineComponentFixture({
        labels: { kind: 'animated' },
        render: (context) => renderFindWidget({ ...context, searchString: 'count' }),
    }),
    FindAndReplace: defineComponentFixture({
        labels: { kind: 'animated' },
        render: (context) => renderFindWidget({ ...context, searchString: 'count', replaceString: 'value', showReplace: true }),
    }),
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZmluZFdpZGdldC5maXh0dXJlLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL3Rlc3QvYnJvd3Nlci9jb21wb25lbnRGaXh0dXJlcy9lZGl0b3IvZmluZFdpZGdldC5maXh0dXJlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSxHQUFHLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUV4RCxPQUFPLEVBQTJCLG9CQUFvQixFQUFFLGVBQWUsRUFBRSxzQkFBc0IsRUFBRSx3QkFBd0IsRUFBRSxNQUFNLG9CQUFvQixDQUFDO0FBQ3RKLE9BQU8sRUFBRSxnQkFBZ0IsRUFBNEIsTUFBTSxxRUFBcUUsQ0FBQztBQUNqSSxPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSx5REFBeUQsQ0FBQztBQUMzRixPQUFPLEVBQUUsVUFBVSxFQUFtQixNQUFNLDBEQUEwRCxDQUFDO0FBQ3ZHLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLHlEQUF5RCxDQUFDO0FBQzdGLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLHlEQUF5RCxDQUFDO0FBQzdGLE9BQU8sRUFBRSxhQUFhLEVBQUUsTUFBTSxnREFBZ0QsQ0FBQztBQUMvRSxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSwrREFBK0QsQ0FBQztBQUN0RyxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSwrREFBK0QsQ0FBQztBQUV0RyxPQUFPLDJEQUEyRCxDQUFDO0FBQ25FLE9BQU8sMERBQTBELENBQUM7QUFFbEUsTUFBTSxXQUFXLEdBQUc7Ozs7Ozs7Ozs7Ozs7OztDQWVuQixDQUFDO0FBVUYsS0FBSyxVQUFVLGdCQUFnQixDQUFDLE9BQTJCO0lBQzFELE1BQU0sRUFBRSxTQUFTLEVBQUUsZUFBZSxFQUFFLEtBQUssRUFBRSxHQUFHLE9BQU8sQ0FBQztJQUN0RCxTQUFT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