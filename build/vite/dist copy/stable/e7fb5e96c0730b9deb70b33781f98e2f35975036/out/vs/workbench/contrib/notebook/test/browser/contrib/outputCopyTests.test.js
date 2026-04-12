/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { mock } from '../../../../../../base/test/common/mock.js';
import assert from 'assert';
import { VSBuffer } from '../../../../../../base/common/buffer.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { copyCellOutput } from '../../../browser/viewModel/cellOutputTextHelper.js';
suite('Cell Output Clipboard Tests', () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    class ClipboardService {
        constructor() {
            this._clipboardContent = '';
        }
        get clipboardContent() {
            return this._clipboardContent;
        }
        async writeText(value) {
            this._clipboardContent = value;
        }
    }
    const logService = new class extends mock() {
    };
    function createOutputViewModel(outputs, cellViewModel) {
        const outputViewModel = { model: { outputs: outputs } };
        if (cellViewModel) {
            cellViewModel.outputsViewModels.push(outputViewModel);
            cellViewModel.model.outputs.push(outputViewModel.model);
        }
        else {
            cellViewModel = {
                outputsViewModels: [outputViewModel],
                model: { outputs: [outputViewModel.model] }
            };
        }
        outputViewModel.cellViewModel = cellViewModel;
        return outputViewModel;
    }
    test('Copy text/plain output', async () => {
        const mimeType = 'text/plain';
        const clipboard = new ClipboardService();
        const outputDto = { data: VSBuffer.fromString('output content'), mime: 'text/plain' };
        const output = createOutputViewModel([outputDto]);
        await copyCellOutput(mimeType, output, clipboard, logService);
        assert.strictEqual(clipboard.clipboardContent, 'output content');
    });
    test('Nothing copied for invalid mimetype', async () => {
        const clipboard = new ClipboardService();
        const outputDtos = [
            { data: VSBuffer.fromString('output content'), mime: 'bad' },
            { data: VSBuffer.fromString('output 2'), mime: 'unknown' }
        ];
        const output = createOutputViewModel(outputDtos);
        await copyCellOutput('bad', output, clipboard, logService);
        assert.strictEqual(clipboard.clipboardContent, '');
    });
    test('Text copied if available instead of invalid mime type', async () => {
        const clipboard = new ClipboardService();
        const outputDtos = [
            { data: VSBuffer.fromString('output content'), mime: 'bad' },
            { data: VSBuffer.fromString('text content'), mime: 'text/plain' }
        ];
        const output = createOutputViewModel(outputDtos);
        await copyCellOutput('bad', output, clipboard, logService);
        assert.strictEqual(clipboard.clipboardContent, 'text content');
    });
    test('Selected mimetype is preferred', async () => {
        const clipboard = new ClipboardService();
        const outputDtos = [
            { data: VSBuffer.fromString('plain text'), mime: 'text/plain' },
            { data: VSBuffer.fromString('html content'), mime: 'text/html' }
        ];
        const output = createOutputViewModel(outputDtos);
        await copyCellOutput('text/html', output, clipboard, logService);
        assert.strictEqual(clipboard.clipboardContent, 'html content');
    });
    test('copy subsequent output', async () => {
        const clipboard = new ClipboardService();
        const output = createOutputViewModel([{ data: VSBuffer.fromString('first'), mime: 'text/plain' }]);
        const output2 = createOutputViewModel([{ data: VSBuffer.fromString('second'), mime: 'text/plain' }], output.cellViewModel);
        const output3 = createOutputViewModel([{ data: VSBuffer.fromString('third'), mime: 'text/plain' }], output.cellViewModel);
        await copyCellOutput('text/plain', output2, clipboard, logService);
        assert.strictEqual(clipboard.clipboardContent, 'second');
        await copyCellOutput('text/plain', output3, clipboard, logService);
        assert.strictEqual(clipboard.clipboardContent, 'third');
    });
    test('adjacent stream outputs are concanented', async () => {
        const clipboard = new ClipboardService();
        const output = createOutputViewModel([{ data: VSBuffer.fromString('stdout'), mime: 'application/vnd.code.notebook.stdout' }]);
        createOutputViewModel([{ data: VSBuffer.fromString('stderr'), mime: 'application/vnd.code.notebook.stderr' }], output.cellViewModel);
        createOutputViewModel([{ data: VSBuffer.fromString('text content'), mime: 'text/plain' }], output.cellViewModel);
        createOutputViewModel([{ data: VSBuffer.fromString('non-adjacent'), mime: 'application/vnd.code.notebook.stdout' }], output.cellViewModel);
        await copyCellOutput('application/vnd.code.notebook.stdout', output, clipboard, logService);
        assert.strictEqual(clipboard.clipboardContent, 'stdoutstderr');
    });
    test('error output uses the value in the stack', async () => {
        const clipboard = new ClipboardService();
        const data = VSBuffer.fromString(`{"name":"Error Name","message":"error message","stack":"error stack"}`);
        const output = createOutputViewModel([{ data, mime: 'application/vnd.code.notebook.error' }]);
        await copyCellOutput('application/vnd.code.notebook.error', output, clipboard, logService);
        assert.strictEqual(clipboard.clipboardContent, 'error stack');
    });
    test('error without stack uses the name and message', async () => {
        const clipboard = new ClipboardService();
        const data = VSBuffer.fromString(`{"name":"Error Name","message":"error message"}`);
        const output = createOutputViewModel([{ data, mime: 'application/vnd.code.notebook.error' }]);
        await copyCellOutput('application/vnd.code.notebook.error', output, clipboard, logService);
        assert.strictEqual(clipboard.clipboardContent, 'Error Name: error message');
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoib3V0cHV0Q29weVRlc3RzLnRlc3QuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9ub3RlYm9vay90ZXN0L2Jyb3dzZXIvY29udHJpYi9vdXRwdXRDb3B5VGVzdHMudGVzdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUdoRyxPQUFPLEVBQUUsSUFBSSxFQUFFLE1BQU0sNENBQTRDLENBQUM7QUFHbEUsT0FBTyxNQUFNLE1BQU0sUUFBUSxDQUFDO0FBQzVCLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUVuRSxPQUFPLEVBQUUsdUNBQXVDLEVBQUUsTUFBTSw2Q0FBNkMsQ0FBQztBQUN0RyxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sb0RBQW9ELENBQUM7QUFFcEYsS0FBSyxDQUFDLDZCQUE2QixFQUFFLEdBQUcsRUFBRTtJQUN6Qyx1Q0FBdUMsRUFBRSxDQUFDO0lBRTFDLE1BQU0sZ0JBQWdCO1FBQXRCO1lBQ1Msc0JBQWlCLEdBQUcsRUFBRSxDQUFDO1FBT2hDLENBQUM7UUFOQSxJQUFXLGdCQUFnQjtZQUMxQixPQUFPLElBQUksQ0FBQyxpQkFBaUIsQ0FBQztRQUMvQixDQUFDO1FBQ00sS0FBSyxDQUFDLFNBQVMsQ0FBQyxLQUFhO1lBQ25DLElBQUksQ0FBQyxpQkFBaUIsR0FBRyxLQUFLLENBQUM7UUFDaEMsQ0FBQztLQUNEO0lBRUQsTUFBTSxVQUFVLEdBQUcsSUFBSSxLQUFNLFNBQVEsSUFBSSxFQUFlO0tBQUksQ0FBQztJQUU3RCxTQUFTLHFCQUFxQixDQUFDLE9BQXlCLEVBQUUsYUFBOEI7UUFDdkYsTUFBTSxlQUFlLEdBQUcsRUFBRSxLQUFLLEVBQUUsRUFBRSxPQUFPLEVBQUUsT0FBTyxFQUFFLEVBQTBCLENBQUM7UUFFaEYsSUFBSSxhQUFhLEVBQUUsQ0FBQztZQUNuQixh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