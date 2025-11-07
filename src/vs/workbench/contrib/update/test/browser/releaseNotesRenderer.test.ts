/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { assertSnapshot } from '../../../../../base/test/common/snapshot.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ILanguageService } from '../../../../../editor/common/languages/language.js';
import { ContextMenuService } from '../../../../../platform/contextview/browser/contextMenuService.js';
import { IContextMenuService } from '../../../../../platform/contextview/browser/contextView.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IExtensionService } from '../../../../services/extensions/common/extensions.js';
import { SimpleSettingRenderer } from '../../../markdown/browser/markdownSettingRenderer.js';
import { IPreferencesService } from '../../../../services/preferences/common/preferences.js';
import { renderReleaseNotesMarkdown } from '../../browser/releaseNotesEditor.js';
import { URI } from '../../../../../base/common/uri.js';
import { Emitter } from '../../../../../base/common/event.js';


suite('Release notes renderer', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	let instantiationService: TestInstantiationService;
	let extensionService: IExtensionService;
	let languageService: ILanguageService;

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
		instantiationService.stub(IPreferencesService, <Partial<IPreferencesService>>{
			_serviceBrand: undefined,
			onDidDefaultSettingsContentChanged: new Emitter<URI>().event,
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
			getSetting: (id: string) => {
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
