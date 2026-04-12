/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ITextModelService } from '../../../../../../editor/common/services/resolverService.js';
import { IModelService } from '../../../../../../editor/common/services/model.js';
import { createTerminalLanguageVirtualUri, LspTerminalModelContentProvider } from '../../browser/lspTerminalModelContentProvider.js';
import * as sinon from 'sinon';
import assert from 'assert';
import { URI } from '../../../../../../base/common/uri.js';
import { TerminalCapabilityStore } from '../../../../../../platform/terminal/common/capabilities/terminalCapabilityStore.js';
import { IMarkerService } from '../../../../../../platform/markers/common/markers.js';
import { ILanguageService } from '../../../../../../editor/common/languages/language.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { Schemas } from '../../../../../../base/common/network.js';
import { VSCODE_LSP_TERMINAL_PROMPT_TRACKER } from '../../browser/lspTerminalUtil.js';
suite('LspTerminalModelContentProvider', () => {
    const store = ensureNoDisposablesAreLeakedInTestSuite();
    let instantiationService;
    let capabilityStore;
    let textModelService;
    let modelService;
    let mockTextModel;
    let lspTerminalModelContentProvider;
    let virtualTerminalDocumentUri;
    let setValueSpy;
    let getValueSpy;
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
        };
        // Create a stub for modelService.getModel
        modelService = {};
        modelService.getModel = sinon.stub().callsFake((uri) => {
            return uri.toString() === virtualTerminalDocumentUri.toString() ? mockTextModel : null;
        });
        // Create stub services for instantiation service
        textModelService = {};
        textModelService.registerTextModelContentProvider = sinon.stub().returns({ dispose: sinon.stub() });
        const markerService = {};
        markerService.installResourceFilter = sinon.stub().returns({ dispose: sinon.stub() });
        const languageService = {};
        // Set up the services in the instantiation service
        instantiationService.stub(IModelService, modelService);
        instantiationService.stub(ITextModelService, textModelService);
        instantiationService.stub(IMarkerService, markerService);
        instantiationService.stub(ILanguageService, languageService);
        // Create the provider instance
        lspTerminalModelContentProvider = store.add(instantiationService.createInstance(LspTerminalModelContentProvider, capabilityStore, 1, virtualTerminalDocumentUri, "python" /* GeneralShellType.Python */));
    });
    teardown(() => {
        sinon.restore();
        lspTerminalModelContentProvider?.dispose();
    });
    suite('setContent', () => {
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
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibHNwVGVybWluYWxNb2RlbENvbnRlbnRQcm92aWRlci50ZXN0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvdGVybWluYWxDb250cmliL3N1Z2dlc3QvdGVzdC9icm93c2VyL2xzcFRlcm1pbmFsTW9kZWxDb250ZW50UHJvdmlkZXIudGVzdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQUUsd0JBQXdCLEVBQUUsTUFBTSxrRkFBa0YsQ0FBQztBQUM1SCxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSw2REFBNkQsQ0FBQztBQUNoRyxPQUFPLEVBQUUsYUFBYSxFQUFFLE1BQU0sbURBQW1ELENBQUM7QUFFbEYsT0FBTyxFQUFFLGdDQUFnQyxFQUFFLCtCQUErQixFQUFFLE1BQU0sa0RBQWtELENBQUM7QUFDckksT0FBTyxLQUFLLEtBQUssTUFBTSxPQUFPLENBQUM7QUFDL0IsT0FBTyxNQUFNLE1BQU0sUUFBUSxDQUFDO0FBQzVCLE9BQU8sRUFBRSxHQUFHLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUMzRCxPQUFPLEVBQUUsdUJBQXVCLEVBQUUsTUFBTSxvRkFBb0YsQ0FBQztBQUM3SCxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sc0RBQXNELENBQUM7QUFDdEYsT0FBTyxFQUFFLGdCQUFnQixFQUFFLE1BQU0sdURBQXVELENBQUM7QUFHekYsT0FBTyxFQUFFLHVDQUF1QyxFQUFFLE1BQU0sNkNBQTZDLENBQUM7QUFDdEcsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLDBDQUEwQyxDQUFDO0FBQ25FLE9BQU8sRUFBRSxrQ0FBa0MsRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBRXRGLEtBQUssQ0FBQyxpQ0FBaUMsRUFBRSxHQUFHLEVBQUU7SUFDN0MsTUFBTSxLQUFLLEdBQUcsdUNBQXVDLEVB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