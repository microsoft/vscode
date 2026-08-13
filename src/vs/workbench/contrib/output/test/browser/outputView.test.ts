/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ICodeEditorWidgetOptions } from '../../../../../editor/browser/widget/codeEditor/codeEditorWidget.js';
import { EditorOption } from '../../../../../editor/common/config/editorOptions.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ConfigurationTarget } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { LayoutSettings } from '../../../../services/layout/browser/layoutService.js';
import { workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';
import { OutputEditor } from '../../browser/outputView.js';

class TestOutputEditor extends OutputEditor {

	protected override getCodeEditorWidgetOptions(): ICodeEditorWidgetOptions {
		return { contributions: [] };
	}
}

suite('OutputEditor', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('applies Modern UI padding and updates when toggled', async () => {
		const configurationService = new TestConfigurationService({ [LayoutSettings.MODERN_UI]: false });
		store.add(configurationService.onDidChangeConfigurationEmitter);
		const instantiationService = workbenchInstantiationService({ configurationService: () => configurationService }, store);
		const editor = store.add(instantiationService.createInstance(TestOutputEditor));
		const container = document.createElement('div');
		editor.create(container);

		const codeEditor = editor.getControl();
		const getPadding = () => ({ ...codeEditor?.getOption(EditorOption.padding) });
		const setModernUI = async (enabled: boolean) => {
			await configurationService.setUserConfiguration(LayoutSettings.MODERN_UI, enabled);
			configurationService.onDidChangeConfigurationEmitter.fire({
				affectsConfiguration: key => key === LayoutSettings.MODERN_UI,
				source: ConfigurationTarget.USER,
				affectedKeys: new Set([LayoutSettings.MODERN_UI]),
				change: { keys: [LayoutSettings.MODERN_UI], overrides: [] }
			});
		};
		const padding = [getPadding()];
		await setModernUI(true);
		padding.push(getPadding());
		await setModernUI(false);
		padding.push(getPadding());

		assert.deepStrictEqual(padding, [
			{ top: 0, bottom: 0 },
			{ top: 8, bottom: 8 },
			{ top: 0, bottom: 0 },
		]);
	});
});
