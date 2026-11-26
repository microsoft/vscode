/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { OperatingSystem } from '../../../../../base/common/platform.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ILabelService } from '../../../../../platform/label/common/label.js';
import { IRemoteAgentEnvironment } from '../../../../../platform/remote/common/remoteAgentEnvironment.js';
import { TestRemoteAgentService, workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';
import { LabelService } from '../../../../services/label/common/labelService.js';
import { IRemoteAgentService } from '../../../../services/remote/common/remoteAgentService.js';
import { IOverlayWebview } from '../../../webview/browser/webview.js';
import { IWebviewWorkbenchService } from '../../../webviewPanel/browser/webviewWorkbenchService.js';
import { CustomEditorInput, getCustomEditorWindowMoveVeto } from '../../browser/customEditorInput.js';
import { ICustomEditorService } from '../../common/customEditor.js';

suite('CustomEditorInput', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('custom editor fallback names respect resource formatter separators', async () => {
		const instantiationService = workbenchInstantiationService(undefined, disposables);
		instantiationService.stub(IRemoteAgentService, new class extends TestRemoteAgentService {
			override async getEnvironment(): Promise<IRemoteAgentEnvironment> {
				return new class extends mock<IRemoteAgentEnvironment>() {
					override readonly os = OperatingSystem.Linux;
				}();
			}
		}());
		const labelService = disposables.add(instantiationService.createInstance(LabelService));
		instantiationService.stub(ILabelService, labelService);
		instantiationService.stub(ICustomEditorService, new class extends mock<ICustomEditorService>() { }());
		instantiationService.stub(IWebviewWorkbenchService, new class extends mock<IWebviewWorkbenchService>() { }());
		disposables.add(labelService.registerFormatter({ scheme: 'remote-windows', formatting: { label: '${path}', separator: '\\' } }));
		disposables.add(labelService.registerFormatter({ scheme: 'remote-linux', formatting: { label: '${path}', separator: '/' } }));
		await Promise.resolve();

		const createInput = (resource: URI, preferredName?: string) => {
			const webview = new class extends mock<IOverlayWebview>() {
				override setTitle(): void { }
				override dispose(): void { }
			}();
			return disposables.add(instantiationService.createInstance(CustomEditorInput, {
				resource,
				viewType: 'test',
				webviewTitle: undefined,
				preferredName,
				iconPath: undefined,
			}, webview, {}));
		};
		const windows = createInput(URI.from({ scheme: 'remote-windows', path: '/C:/workspace/report.md' }));
		const linux = createInput(URI.from({ scheme: 'remote-linux', path: '/workspace/report\\Q4.md' }));
		const preferred = createInput(windows.resource, 'Preferred title');
		const names = [windows.getName(), linux.getName(), preferred.getName()];
		windows.setWebviewTitle('Extension title');
		names.push(windows.getName());
		assert.deepStrictEqual(names, ['report.md', 'report\\Q4.md', 'Preferred title', 'Extension title']);
	});

	test('only a modified editor whose model cannot hot exit is kept in its window, exactly as canHotExit === false', () => {
		const veto = (modified: boolean, canHotExit: boolean | undefined, sameWindow: boolean) => typeof getCustomEditorWindowMoveVeto({ modified, canHotExit, isSameWindow: () => sameWindow, getName: () => 'image.png' });

		assert.deepStrictEqual({
			modifiedCannotHotExitToOtherWindow: veto(true, false, false),
			modifiedCannotHotExitInItsWindow: veto(true, false, true),
			modifiedCanHotExit: veto(true, true, false),
			modifiedHotExitUnknown: veto(true, undefined, false),
			unmodified: veto(false, false, false),
		}, {
			modifiedCannotHotExitToOtherWindow: 'string',
			modifiedCannotHotExitInItsWindow: 'boolean',
			modifiedCanHotExit: 'boolean',
			modifiedHotExitUnknown: 'boolean',
			unmodified: 'boolean',
		});
	});
});
