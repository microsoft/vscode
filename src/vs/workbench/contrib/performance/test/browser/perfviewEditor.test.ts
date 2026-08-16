/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter } from '../../../../../base/common/event.js';
import { dispose } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { ICodeEditorService } from '../../../../../editor/browser/services/codeEditorService.js';
import { ILanguageSelection, ILanguageService } from '../../../../../editor/common/languages/language.js';
import { ITextModel } from '../../../../../editor/common/model.js';
import { IModelService } from '../../../../../editor/common/services/model.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { IRemoteAgentService } from '../../../../services/remote/common/remoteAgentService.js';
import { IExtensionService } from '../../../../services/extensions/common/extensions.js';
import { ILifecycleService } from '../../../../services/lifecycle/common/lifecycle.js';
import { ITimerService } from '../../../../services/timer/browser/timerService.js';
import { ITerminalService } from '../../../terminal/browser/terminal.js';
import { PerfModelContentProvider } from '../../browser/perfviewEditor.js';

suite('PerfModelContentProvider', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('discards listeners for a disposed model', async () => {
		const modelStates: Array<{ disposed: boolean }> = [];
		const modelService = {
			getModel: () => null,
			createModel: () => {
				const state = { disposed: false };
				modelStates.push(state);
				return {
					isDisposed: () => state.disposed,
					setLanguage: () => { }
				} as unknown as ITextModel;
			}
		} as unknown as IModelService;
		const languageService = {
			createById: () => {
				const emitter = store.add(new Emitter<string>());
				return { languageId: 'markdown', onDidChange: emitter.event } as ILanguageSelection;
			}
		} as unknown as ILanguageService;
		const extensionStatusEmitter = store.add(new Emitter());
		const extensionService = {
			onDidChangeExtensionsStatus: extensionStatusEmitter.event,
			whenInstalledExtensionsRegistered: () => Promise.resolve(true)
		} as unknown as IExtensionService;
		const neverReady = new Promise<boolean>(() => { });
		const provider = new PerfModelContentProvider(
			modelService,
			languageService,
			{ setTransientModelProperty: () => { } } as unknown as ICodeEditorService,
			{ when: () => Promise.resolve() } as unknown as ILifecycleService,
			{ whenReady: () => neverReady } as unknown as ITimerService,
			extensionService,
			{} as IProductService,
			{ getConnection: () => undefined } as unknown as IRemoteAgentService,
			{ whenConnected: Promise.resolve() } as unknown as ITerminalService,
		);

		try {
			await provider.provideTextContent(URI.parse('perf:Startup Performance'));
			assert.strictEqual(provider['_modelDisposables'].length, 2);

			modelStates[0].disposed = true;
			await provider.provideTextContent(URI.parse('perf:Startup Performance'));
			assert.strictEqual(provider['_modelDisposables'].length, 2);
		} finally {
			dispose(provider['_modelDisposables']);
		}
	});
});
