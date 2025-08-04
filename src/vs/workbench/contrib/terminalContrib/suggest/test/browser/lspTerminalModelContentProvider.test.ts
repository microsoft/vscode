/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ITextModelService } from '../../../../../../editor/common/services/resolverService.js';
import { IModelService } from '../../../../../../editor/common/services/model.js';
import { ITextModel } from '../../../../../../editor/common/model.js';
import { createTerminalLanguageVirtualUri, LspTerminalModelContentProvider } from '../../browser/lspTerminalModelContentProvider.js';
import * as sinon from 'sinon';
import assert from 'assert';
import { URI } from '../../../../../../base/common/uri.js';
import { TerminalCapabilityStore } from '../../../../../../platform/terminal/common/capabilities/terminalCapabilityStore.js';
import { IMarkerService } from '../../../../../../platform/markers/common/markers.js';
import { ILanguageService } from '../../../../../../editor/common/languages/language.js';
import { GeneralShellType } from '../../../../../../platform/terminal/common/terminal.js';
import { ITerminalCapabilityStore } from '../../../../../../platform/terminal/common/capabilities/capabilities.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { Schemas } from '../../../../../../base/common/network.js';
import { VSCODE_LSP_TERMINAL_PROMPT_TRACKER } from '../../browser/lspTerminalUtil.js';

suite('LspTerminalModelContentProvider', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	let instantiationService: TestInstantiationService;
	let capabilityStore: ITerminalCapabilityStore;
	let textModelService: ITextModelService;
	let modelService: IModelService;
	let mockTextModel: ITextModel;
	let lspTerminalModelContentProvider: LspTerminalModelContentProvider;
	let virtualTerminalDocumentUri: URI;
	let setValueSpy: sinon.SinonStub;
	let getValueSpy: sinon.SinonStub;

	setup(async () => {
		instantiationService = store.add(new TestInstantiationService());
		capabilityStore = store.add(new TerminalCapabilityStore());
		virtualTerminalDocumentUri = URI.from({ scheme: 'vscodeTerminal', path: '/terminal1.py' });

		// Create stubs for the mock text model methods
		setValueSpy = sinon.stub();
		getValueSpy = sinon.stub();

		mockTextModel = {
			setValue: setValueSpy,
			getValue: getValueSpy,
			dispose: sinon.stub(),
			isDisposed: sinon.stub().returns(false)
		} as unknown as ITextModel;

		// Create a stub for modelService.getModel
		modelService = {} as IModelService;
		modelService.getModel = sinon.stub().callsFake((uri: URI) => {
			return uri.toString() === virtualTerminalDocumentUri.toString() ? mockTextModel : null;
		});

		// Create stub services for instantiation service
		textModelService = {} as ITextModelService;
		textModelService.registerTextModelContentProvider = sinon.stub().returns({ dispose: sinon.stub() });

		const markerService = {} as IMarkerService;
		markerService.installResourceFilter = sinon.stub().returns({ dispose: sinon.stub() });

		const languageService = {} as ILanguageService;

		// Set up the services in the instantiation service
		instantiationService.stub(IModelService, modelService);
		instantiationService.stub(ITextModelService, textModelService);
		instantiationService.stub(IMarkerService, markerService);
		instantiationService.stub(ILanguageService, languageService);

		// Create the provider instance
		lspTerminalModelContentProvider = store.add(instantiationService.createInstance(
			LspTerminalModelContentProvider,
			capabilityStore,
			1,
			virtualTerminalDocumentUri,
			GeneralShellType.Python
		));
	});

	teardown(() => {
		sinon.restore();
		lspTerminalModelContentProvider?.dispose();
	});

	suite('setContent', () => {
		test('should not call setValue if content is "exit()"', () => {
			lspTerminalModelContentProvider.setContent('exit()');
			assert.strictEqual(setValueSpy.called, false);
		});

		test('should add delimiter when setting content on empty document', () => {
			getValueSpy.returns('');

			lspTerminalModelContentProvider.setContent('print("hello")');

			assert.strictEqual(setValueSpy.calledOnce, true);
			assert.strictEqual(setValueSpy.args[0][0], VSCODE_LSP_TERMINAL_PROMPT_TRACKER);
		});

		test('should update content with delimiter when document already has content', () => {
			const existingContent = 'previous content\n' + VSCODE_LSP_TERMINAL_PROMPT_TRACKER;
			getValueSpy.returns(existingContent);

			lspTerminalModelContentProvider.setContent('print("hello")');

			assert.strictEqual(setValueSpy.calledOnce, true);
			const expectedContent = 'previous content\n\nprint("hello")\n' + VSCODE_LSP_TERMINAL_PROMPT_TRACKER;
			assert.strictEqual(setValueSpy.args[0][0], expectedContent);
		});

		test('should sanitize content when delimiter is in the middle of existing content', () => {
			// Simulating a corrupted state where the delimiter is in the middle
			const existingContent = 'previous content\n' + VSCODE_LSP_TERMINAL_PROMPT_TRACKER + 'some extra text';
			getValueSpy.returns(existingContent);

			lspTerminalModelContentProvider.setContent('print("hello")');

			assert.strictEqual(setValueSpy.calledOnce, true);
			const expectedContent = 'previous content\n\nprint("hello")\n' + VSCODE_LSP_TERMINAL_PROMPT_TRACKER;
			assert.strictEqual(setValueSpy.args[0][0], expectedContent);
		});

		test('Mac, Linux - createTerminalLanguageVirtualUri should return the correct URI', () => {
			const expectedUri = URI.from({ scheme: Schemas.vscodeTerminal, path: '/terminal1.py' });
			const actualUri = createTerminalLanguageVirtualUri(1, 'py');
			assert.strictEqual(actualUri.toString(), expectedUri.toString());
		});
	});

	suite('shellTypeChanged', () => {
		test('should clear virtual document when shell type changes from Python to non-Python', () => {
			// Set initial content in the mock text model
			getValueSpy.returns('some python content\n' + VSCODE_LSP_TERMINAL_PROMPT_TRACKER);

			// Change shell type from Python to undefined (regular shell)
			lspTerminalModelContentProvider.shellTypeChanged(undefined);

			// Should clear the document content
			assert.strictEqual(setValueSpy.calledWith(''), true, 'Should clear document content when leaving Python shell');
		});

		test('should not clear virtual document when shell type changes within Python or to Python', () => {
			// Change shell type from Python to Python (no-op)
			lspTerminalModelContentProvider.shellTypeChanged(GeneralShellType.Python);

			// Should not clear the document
			assert.strictEqual(setValueSpy.called, false, 'Should not clear document when staying in Python shell');

			// Change from non-Python to Python
			lspTerminalModelContentProvider.shellTypeChanged(undefined);
			setValueSpy.resetHistory();
			lspTerminalModelContentProvider.shellTypeChanged(GeneralShellType.Python);

			// Should not clear the document
			assert.strictEqual(setValueSpy.calledWith(''), false, 'Should not clear document when entering Python shell');
		});

		test('should update shellType getter when shell type changes', () => {
			assert.strictEqual(lspTerminalModelContentProvider.shellType, GeneralShellType.Python, 'Initial shell type should be Python');

			lspTerminalModelContentProvider.shellTypeChanged(undefined);
			assert.strictEqual(lspTerminalModelContentProvider.shellType, undefined, 'Shell type should be updated to undefined');

			lspTerminalModelContentProvider.shellTypeChanged(GeneralShellType.PowerShell);
			assert.strictEqual(lspTerminalModelContentProvider.shellType, GeneralShellType.PowerShell, 'Shell type should be updated to PowerShell');
		});
	});
});
