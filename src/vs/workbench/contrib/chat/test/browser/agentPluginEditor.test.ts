/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { $ } from '../../../../../base/browser/dom.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IEditorGroup } from '../../../../services/editor/common/editorGroupsService.js';
import { workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';
import { IWebviewService } from '../../../webview/browser/webview.js';
import { AgentPluginEditor } from '../../browser/agentPluginEditor/agentPluginEditor.js';
import { IAgentPluginService } from '../../common/plugins/agentPluginService.js';
import { IPluginInstallService } from '../../common/plugins/pluginInstallService.js';
import { IPluginMarketplaceService } from '../../common/plugins/pluginMarketplaceService.js';

suite('AgentPluginEditor', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('the marketplace, the only entry of the header subtitle, draws no separator after it', () => {
		const instantiationService = workbenchInstantiationService(undefined, disposables);
		instantiationService.stub(IWebviewService, new class extends mock<IWebviewService>() { });
		instantiationService.stub(IAgentPluginService, new class extends mock<IAgentPluginService>() { });
		instantiationService.stub(IPluginInstallService, new class extends mock<IPluginInstallService>() { });
		instantiationService.stub(IPluginMarketplaceService, new class extends mock<IPluginMarketplaceService>() { });
		const container = mainWindow.document.body.appendChild($('div'));
		disposables.add(toDisposable(() => container.remove()));
		const editor = disposables.add(instantiationService.createInstance(AgentPluginEditor, new class extends mock<IEditorGroup>() {
			override readonly windowId = mainWindow.vscodeWindowId;
		}()));
		editor.create(container);

		const entries = [...container.querySelectorAll<HTMLElement>('.extension-editor > .header > .details > .subtitle > .subtitle-entry')];
		// The separator rule only applies to entries with content, as the marketplace has once a plugin is shown.
		entries.forEach(entry => entry.textContent = 'github/awesome-copilot');

		assert.deepStrictEqual(entries.map(entry => mainWindow.getComputedStyle(entry).borderRightStyle), ['none']);
	});
});
