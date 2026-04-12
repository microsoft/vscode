/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { assertSnapshot } from '../../../../../base/test/common/snapshot.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ILanguageService } from '../../../../../editor/common/languages/language.js';
import { ContextMenuService } from '../../../../../platform/contextview/browser/contextMenuService.js';
import { IContextMenuService } from '../../../../../platform/contextview/browser/contextView.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IExtensionService } from '../../../../services/extensions/common/extensions.js';
import { SimpleSettingRenderer } from '../../../markdown/browser/markdownSettingRenderer.js';
import { IPreferencesService } from '../../../../services/preferences/common/preferences.js';
import { processConditionalBlocks, renderReleaseNotesMarkdown } from '../../browser/releaseNotesEditor.js';
import { URI } from '../../../../../base/common/uri.js';
import { Emitter } from '../../../../../base/common/event.js';
suite('Release notes renderer', () => {
    const store = ensureNoDisposablesAreLeakedInTestSuite();
    let instantiationService;
    let extensionService;
    let languageService;
    setup(() => {
        instantiationService = store.add(new TestInstantiationService());
        extensionService = instantiationService.get(IExtensionService);
        languageService = instantiationService.get(ILanguageService);
        instantiationService.stub(IContextMenuService, store.add(instantiationService.createInstance(ContextMenuService)));
    });
    test('Should render TOC', async () => {
        const content = `<table class="highlights-table">
	<tr>
		<th>a</th>
	</tr>
</table>

<br>

> text

<!-- TOC
<div class="toc-nav-layout">
	<nav id="toc-nav">
		<div>In this update</div>
		<ul>
			<li><a href="#chat">test</a></li>
		</ul>
	</nav>
	<div class="notes-main">
Navigation End -->

## Test`;
        const result = await renderReleaseNotesMarkdown(content, extensionService, languageService, instantiationService.createInstance(SimpleSettingRenderer));
        await assertSnapshot(result.toString());
    });
    test('Should render code settings', async () => {
        // Stub preferences service with a known setting so the SimpleSettingRenderer treats it as valid
        const testSettingId = 'editor.wordWrap';
        instantiationService.stub(IPreferencesService, {
            _serviceBrand: undefined,
            onDidDefaultSettingsContentChanged: new Emitter().event,
            userSettingsResource: URI.parse('test://test'),
            workspaceSettingsResource: null,
            getFolderSettingsResource: () => null,
            createPreferencesEditorModel: async () => null,
            getDefaultSettingsContent: () => undefined,
            hasDefaultSettingsContent: () => false,
            createSettings2EditorModel: () => { throw new Error('not needed'); },
            openPreferences: async () => undefined,
            openRawDefaultSettings: async () => undefined,
            openSettings: async () => undefined,
            openApplicationSettings: async () => undefined,
            openUserSettings: async () => undefined,
            openRemoteSettings: async () => undefined,
            openWorkspaceSettings: async () => undefined,
            openFolderSettings: async () => undefined,
            openGlobalKeybindingSettings: async () => undefined,
            openDefaultKeybindingsFile: async () => undefined,
            openLanguageSpecificSettings: async () => undefined,
            getEditableSettingsURI: async () => null,
            getSetting: (id) => {
                if (id === testSettingId) {
                    // Provide the minimal fields accessed by SimpleSettingRenderer
                    return {
                        key: testSettingId,
                        value: 'off',
                        type: 'string'
                    };
                }
                return undefined;
            },
            createSplitJsonEditorInput: () => { throw new Error('not needed'); }
        });
        const content = `Here is a setting: \`setting(${testSettingId}:on)\` and another \`setting(${testSettingId}:off)\``;
        const result = await renderReleaseNotesMarkdown(content, extensionService, languageService, instantiationService.createInstance(SimpleSettingRenderer));
        await assertSnapshot(result.toString());
    });
});
suite('Conditional blocks', () => {
    const store = ensureNoDisposablesAreLeakedInTestSuite();
    test('IN_PRODUCT block is revealed when IN_PRODUCT is active', () => {
        const text = 'before\n<!-- %IF IN_PRODUCT %\nin-product content\n%ENDIF % -->\nafter';
        const result = processConditionalBlocks(text, new Set(['IN_PRODUCT']));
        assert.ok(result.includes('in-product content'));
        assert.ok(!result.includes('%IF'));
        assert.ok(result.includes('before'));
        assert.ok(result.includes('after'));
    });
    test('WEB block is removed when only IN_PRODUCT is active', () => {
        const text = 'before\n<!-- %IF WEB %\nweb-only content\n%ENDIF % -->\nafter';
        const result = processConditionalBlocks(text, new Set(['IN_PRODUCT']));
        assert.ok(!result.includes('web-only content'));
        assert.ok(result.includes('before'));
        assert.ok(result.includes('after'));
    });
    test('STABLE block is revealed when STABLE is active', () => {
        const text = 'before\n<!-- %IF STABLE %\nstable content\n%ENDIF % -->\nafter';
        const result = processConditionalBlocks(text, new Set(['IN_PRODUCT', 'STABLE']));
        assert.ok(result.includes('stable content'));
        assert.ok(!result.includes('%IF'));
    });
    test('STABLE block is removed when INSIDERS is active', () => {
        const text = 'before\n<!-- %IF STABLE %\nstable content\n%ENDIF % -->\nafter';
        const result = processConditionalBlocks(text, new Set(['IN_PRODUCT', 'INSIDERS']));
        assert.ok(!result.includes('stable content'));
        assert.ok(result.includes('before'));
        assert.ok(result.includes('after'));
    });
    test('INSIDERS block is revealed when INSIDERS is active', () => {
        const text = 'before\n<!-- %IF INSIDERS %\ninsiders content\n%ENDIF % -->\nafter';
        const result = processConditionalBlocks(text, new Set(['IN_PRODUCT', 'INSIDERS']));
        assert.ok(result.includes('insiders content'));
        assert.ok(!result.includes('%IF'));
    });
    test('INSIDERS block is removed when STABLE is active', () => {
        const text = 'before\n<!-- %IF INSIDERS %\ninsiders content\n%ENDIF % -->\nafter';
        const result = processConditionalBlocks(text, new Set(['IN_PRODUCT', 'STABLE']));
        assert.ok(!result.includes('insiders content'));
    });
    test('Conditions are case-insensitive', () => {
        const text = '<!-- %IF in_product %\ncontent\n%endif % -->';
        const result = processConditionalBlocks(text, new Set(['IN_PRODUCT']));
        assert.ok(result.includes('content'));
        assert.ok(!result.includes('%IF'));
    });
    test('Multiple conditional blocks in same document', () => {
        const text = [
            'shared content',
            '<!-- %IF IN_PRODUCT %',
            'in-product only',
            '%ENDIF % -->',
            '<!-- %IF WEB %',
            'web only',
            '%ENDIF % -->',
            '<!-- %IF STABLE %',
            'stable only',
            '%ENDIF % -->',
            '<!-- %IF INSIDERS %',
            'insiders only',
            '%ENDIF % -->',
            'more shared content',
        ].join('\n');
        const result = processConditionalBlocks(text, new Set(['IN_PRODUCT', 'STABLE']));
        assert.ok(result.includes('shared content'));
        assert.ok(result.includes('in-product only'));
        assert.ok(!result.includes('web only'));
        assert.ok(result.includes('stable only'));
        assert.ok(!result.includes('insiders only'));
        assert.ok(result.includes('more shared content'));
    });
    test('renderReleaseNotesMarkdown passes stable quality correctly', async function () {
        const instantiationService = store.add(new TestInstantiationService());
        const extensionService = instantiationService.get(IExtensionService);
        const languageService = instantiationService.get(ILanguageService);
        instantiationService.stub(IContextMenuService, store.add(instantiationService.createInstance(ContextMenuService)));
        const content = [
            '## Title',
            '<!-- %IF STABLE %',
            'stable content',
            '%ENDIF % -->',
            '<!-- %IF INSIDERS %',
            'insiders content',
            '%ENDIF % -->',
        ].join('\n');
        const result = await renderReleaseNotesMarkdown(content, extensionService, languageService, instantiationService.createInstance(SimpleSettingRenderer), 'stable');
        const html = result.toString();
        assert.ok(html.includes('stable content'));
        assert.ok(!html.includes('insiders content'));
    });
    test('renderReleaseNotesMarkdown passes insider quality correctly', async function () {
        const instantiationService = store.add(new TestInstantiationService());
        const extensionService = instantiationService.get(IExtensionService);
        const languageService = instantiationService.get(ILanguageService);
        instantiationService.stub(IContextMenuService, store.add(instantiationService.createInstance(ContextMenuService)));
        const content = [
            '## Title',
            '<!-- %IF STABLE %',
            'stable content',
            '%ENDIF % -->',
            '<!-- %IF INSIDERS %',
            'insiders content',
            '%ENDIF % -->',
        ].join('\n');
        const result = await renderReleaseNotesMarkdown(content, extensionService, languageService, instantiationService.createInstance(SimpleSettingRenderer), 'insider');
        const html = result.toString();
        assert.ok(!html.includes('stable content'));
        assert.ok(html.includes('insiders content'));
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicmVsZWFzZU5vdGVzUmVuZGVyZXIudGVzdC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL3VwZGF0ZS90ZXN0L2Jyb3dzZXIvcmVsZWFzZU5vdGVzUmVuZGVyZXIudGVzdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUNoRyxPQUFPLE1BQU0sTUFBTSxRQUFRLENBQUM7QUFDNUIsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLDZDQUE2QyxDQUFDO0FBQzdFLE9BQU8sRUFBRSx1Q0FBdUMsRUFBRSxNQUFNLDBDQUEwQyxDQUFDO0FBQ25HLE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLG9EQUFvRCxDQUFDO0FBQ3RGLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLG1FQUFtRSxDQUFDO0FBQ3ZHLE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLDREQUE0RCxDQUFDO0FBQ2pHLE9BQU8sRUFBRSx3QkFBd0IsRUFBRSxNQUFNLCtFQUErRSxDQUFDO0FBQ3pILE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLHNEQUFzRCxDQUFDO0FBQ3pGLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLHNEQUFzRCxDQUFDO0FBQzdGLE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLHdEQUF3RCxDQUFDO0FBQzdGLE9BQU8sRUFBRSx3QkFBd0IsRUFBRSwwQkFBMEIsRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBQzNHLE9BQU8sRUFBRSxHQUFHLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUN4RCxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFHOUQsS0FBSyxDQUFDLHdCQUF3QixFQUFFLEdBQUcsRUFBRTtJQUNwQyxNQUFNLEtBQUssR0FBRyx1Q0FBdUMsRUFBRSxDQUFDO0lBRXhELElBQUksb0JBQThDLENB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