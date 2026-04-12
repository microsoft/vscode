/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import * as platform from '../../../../base/common/platform.js';
import { URI } from '../../../../base/common/uri.js';
import { EditOperation } from '../../../common/core/editOperation.js';
import { Range } from '../../../common/core/range.js';
import { Selection } from '../../../common/core/selection.js';
import { StringBuilder } from '../../../common/core/stringBuilder.js';
import { createTextBuffer } from '../../../common/model/textModel.js';
import { ModelService } from '../../../common/services/modelService.js';
import { TestConfigurationService } from '../../../../platform/configuration/test/common/testConfigurationService.js';
import { createModelServices, createTextModel } from '../testTextModel.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { IModelService } from '../../../common/services/model.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
const GENERATE_TESTS = false;
suite('ModelService', () => {
    let disposables;
    let modelService;
    let instantiationService;
    setup(() => {
        disposables = new DisposableStore();
        const configService = new TestConfigurationService();
        configService.setUserConfiguration('files', { 'eol': '\n' });
        configService.setUserConfiguration('files', { 'eol': '\r\n' }, URI.file(platform.isWindows ? 'c:\\myroot' : '/myroot'));
        instantiationService = createModelServices(disposables, [
            [IConfigurationService, configService]
        ]);
        modelService = instantiationService.get(IModelService);
    });
    teardown(() => {
        disposables.dispose();
    });
    ensureNoDisposablesAreLeakedInTestSuite();
    test('EOL setting respected depending on root', () => {
        const model1 = modelService.createModel('farboo', null);
        const model2 = modelService.createModel('farboo', null, URI.file(platform.isWindows ? 'c:\\myroot\\myfile.txt' : '/myroot/myfile.txt'));
        const model3 = modelService.createModel('farboo', null, URI.file(platform.isWindows ? 'c:\\other\\myfile.txt' : '/other/myfile.txt'));
        assert.strictEqual(model1.getOptions().defaultEOL, 1 /* DefaultEndOfLine.LF */);
        assert.strictEqual(model2.getOptions().defaultEOL, 2 /* DefaultEndOfLine.CRLF */);
        assert.strictEqual(model3.getOptions().defaultEOL, 1 /* DefaultEndOfLine.LF */);
        model1.dispose();
        model2.dispose();
        model3.dispose();
    });
    test('_computeEdits no change', function () {
        const model = disposables.add(createTextModel([
            'This is line one', //16
            'and this is line number two', //27
            'it is followed by #3', //20
            'and finished with the fourth.', //29
        ].join('\n')));
        const textBuffer = createAndRegisterTextBuffer(disposables, [
            'This is line one', //16
            'and this is line number two', //27
            'it is followed by #3', //20
            'and finished with the fourth.', //29
        ].join('\n'), 1 /* DefaultEndOfLine.LF */);
        const actual = ModelService._computeEdits(model, textBuffer);
        assert.deepStrictEqual(actual, []);
    });
    test('_computeEdits first line changed', function () {
        const model = disposables.add(createTextModel([
            'This is line one', //16
            'and this is line number two', //27
            'it is followed by #3', //20
            'and finished with the fourth.', //29
        ].join('\n')));
        const textBuffer = createAndRegisterTextBuffer(disposables, [
            'This is line One', //16
            'and this is line number two', //27
            'it is followed by #3', //20
            'and finished with the fourth.', //29
        ].join('\n'), 1 /* DefaultEndOfLine.LF */);
        const actual = ModelService._computeEdits(model, textBuffer);
        assert.deepStrictEqual(actual, [
            EditOperation.replaceMove(new Range(1, 1, 2, 1), 'This is line One\n')
        ]);
    });
    test('_computeEdits EOL changed', function () {
        const model = disposables.add(createTextModel([
            'This is line one', //16
            'and this is line number two', //27
            'it is followed by #3', //20
            'and finished with the fourth.', //29
        ].join('\n')));
        const textBuffer = createAndRegisterTextBuffer(disposables, [
            'This is line one', //16
            'and this is line number two', //27
            'it is followed by #3', //20
            'and finished with the fourth.', //29
        ].join('\r\n'), 1 /* DefaultEndOfLine.LF */);
        const actual = ModelService._computeEdits(model, textBuffer);
        assert.deepStrictEqual(actual, []);
    });
    test('_computeEdits EOL and other change 1', function () {
        const model = disposables.add(createTextModel([
            'This is line one', //16
            'and this is line number two', //27
            'it is followed by #3', //20
            'and finished with the fourth.', //29
        ].join('\n')));
        const textBuffer = createAndRegisterTextBuffer(disposables, [
            'This is line One', //16
            'and this is line number two', //27
            'It is followed by #3', //20
            'and finished with the fourth.', //29
        ].join('\r\n'), 1 /* DefaultEndOfLine.LF */);
        const actual = ModelService._computeEdits(model, textBuffer);
        assert.deepStrictEqual(actual, [
            EditOperation.replaceMove(new Range(1, 1, 4, 1), [
                'This is line One',
                'and this is line number two',
                'It is followed by #3',
                ''
            ].join('\r\n'))
        ]);
    });
    test('_computeEdits EOL and other change 2', function () {
        const model = disposables.add(createTextModel([
            'package main', // 1
            'func foo() {', // 2
            '}' // 3
        ].join('\n')));
        const textBuffer = createAndRegisterTextBuffer(disposables, [
            'package main', // 1
            'func foo() {', // 2
            '}', // 3
            ''
        ].join('\r\n'), 1 /* DefaultEndOfLine.LF */);
        const actual = ModelService._computeEdits(model, textBuffer);
        assert.deepStrictEqual(actual, [
            EditOperation.replaceMove(new Range(3, 2, 3, 2), '\r\n')
        ]);
    });
    test('generated1', () => {
        const file1 = ['pram', 'okctibad', 'pjuwtemued', 'knnnm', 'u', ''];
        const file2 = ['tcnr', 'rxwlicro', 'vnzy', '', '', 'pjzcogzur', 'ptmxyp', 'dfyshia', 'pee', 'ygg'];
        assertComputeEdits(file1, file2);
    });
    test('generated2', () => {
        const file1 = ['', 'itls', 'hrilyhesv', ''];
        const file2 = ['vdl', '', 'tchgz', 'bhx', 'nyl'];
        assertComputeEdits(file1, file2);
    });
    test('generated3', () => {
        const file1 = ['ubrbrcv', 'wv', 'xodspybszt', 's', 'wednjxm', 'fklajt', 'fyfc', 'lvejgge', 'rtpjlodmmk', 'arivtgmjdm'];
        const file2 = ['s', 'qj', 'tu', 'ur', 'qerhjjhyvx', 't'];
        assertComputeEdits(file1, file2);
    });
    test('generated4', () => {
        const file1 = ['ig', 'kh', 'hxegci', 'smvker', 'pkdmjjdqnv', 'vgkkqqx', '', 'jrzeb'];
        const file2 = ['yk', ''];
        assertComputeEdits(file1, file2);
    });
    test('does insertions in the middle of the document', () => {
        const file1 = [
            'line 1',
            'line 2',
            'line 3'
        ];
        const file2 = [
            'line 1',
            'line 2',
            'line 5',
            'line 3'
        ];
        assertComputeEdits(file1, file2);
    });
    test('does insertions at the end of the document', () => {
        const file1 = [
            'line 1',
            'line 2',
            'line 3'
        ];
        const file2 = [
            'line 1',
            'line 2',
            'line 3',
            'line 4'
        ];
        assertComputeEdits(file1, file2);
    });
    test('does insertions at the beginning of the document', () => {
        const file1 = [
            'line 1',
            'line 2',
            'line 3'
        ];
        const file2 = [
            'line 0',
            'line 1',
            'line 2',
            'line 3'
        ];
        assertComputeEdits(file1, file2);
    });
    test('does replacements', () => {
        const file1 = [
            'line 1',
            'line 2',
            'line 3'
        ];
        const file2 = [
            'line 1',
            'line 7',
            'line 3'
        ];
        assertComputeEdits(file1, file2);
    });
    test('does deletions', () => {
        const file1 = [
            'line 1',
            'line 2',
            'line 3'
        ];
        const file2 = [
            'line 1',
            'line 3'
        ];
        assertComputeEdits(file1, file2);
    });
    test('does insert, replace, and delete', () => {
        const file1 = [
            'line 1',
            'line 2',
            'line 3',
            'line 4',
            'line 5',
        ];
        const file2 = [
            'line 0', // insert line 0
            'line 1',
            'replace line 2', // replace line 2
            'line 3',
            // delete line 4
            'line 5',
        ];
        assertComputeEdits(file1, file2);
    });
    test('maintains undo for same resource and same content', () => {
        const resource = URI.parse('file://test.txt');
        // create a model
        const model1 = modelService.createModel('text', null, resource);
        // make an edit
        model1.pushEditOperations(null, [{ range: new Range(1, 5, 1, 5), text: '1' }], () => [new Selection(1, 5, 1, 5)]);
        assert.strictEqual(model1.getValue(), 'text1');
        // dispose it
        modelService.destroyModel(resource);
        // create a new model with the same content
        const model2 = modelService.createModel('text1', null, resource);
        // undo
        model2.undo();
        assert.strictEqual(model2.getValue(), 'text');
        // dispose it
        modelService.destroyModel(resource);
    });
    test('maintains version id and alternative version id for same resource and same content', () => {
        const resource = URI.parse('file://test.txt');
        // create a model
        const model1 = modelService.createModel('text', null, resource);
        // make an edit
        model1.pushEditOperations(null, [{ range: new Range(1, 5, 1, 5), text: '1' }], () => [new Selection(1, 5, 1, 5)]);
        assert.strictEqual(model1.getValue(), 'text1');
        const versionId = model1.getVersionId();
        const alternativeVersionId = model1.getAlternativeVersionId();
        // dispose it
        modelService.destroyModel(resource);
        // create a new model with the same content
        const model2 = modelService.createModel('text1', null, resource);
        assert.strictEqual(model2.getVersionId(), versionId);
        assert.strictEqual(model2.getAlternativeVersionId(), alternativeVersionId);
        // dispose it
        modelService.destroyModel(resource);
    });
    test('does not maintain undo for same resource and different content', () => {
        const resource = URI.parse('file://test.txt');
        // create a model
        const model1 = modelService.createModel('text', null, resource);
        // make an edit
        model1.pushEditOperations(null, [{ range: new Range(1, 5, 1, 5), text: '1' }], () => [new Selection(1, 5, 1, 5)]);
        assert.strictEqual(model1.getValue(), 'text1');
        // dispose it
        modelService.destroyModel(resource);
        // create a new model with the same content
        const model2 = modelService.createModel('text2', null, resource);
        // undo
        model2.undo();
        assert.strictEqual(model2.getValue(), 'text2');
        // dispose it
        modelService.destroyModel(resource);
    });
    test('setValue should clear undo stack', () => {
        const resource = URI.parse('file://test.txt');
        const model = modelService.createModel('text', null, resource);
        model.pushEditOperations(null, [{ range: new Range(1, 5, 1, 5), text: '1' }], () => [new Selection(1, 5, 1, 5)]);
        assert.strictEqual(model.getValue(), 'text1');
        model.setValue('text2');
        model.undo();
        assert.strictEqual(model.getValue(), 'text2');
        // dispose it
        modelService.destroyModel(resource);
    });
});
function assertComputeEdits(lines1, lines2) {
    const model = createTextModel(lines1.join('\n'));
    const { disposable, textBuffer } = createTextBuffer(lines2.join('\n'), 1 /* DefaultEndOfLine.LF */);
    // compute required edits
    // let start = Date.now();
    const edits = ModelService._computeEdits(model, textBuffer);
    // console.log(`took ${Date.now() - start} ms.`);
    // apply edits
    model.pushEditOperations([], edits, null);
    assert.strictEqual(model.getValue(), lines2.join('\n'));
    disposable.dispose();
    model.dispose();
}
function getRandomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}
function getRandomString(minLength, maxLength) {
    const length = getRandomInt(minLength, maxLength);
    const t = new StringBuilder(length);
    for (let i = 0; i < length; i++) {
        t.appendASCIICharCode(getRandomInt(97 /* CharCode.a */, 122 /* CharCode.z */));
    }
    return t.build();
}
function generateFile(small) {
    const lineCount = getRandomInt(1, small ? 3 : 10000);
    const lines = [];
    for (let i = 0; i < lineCount; i++) {
        lines.push(getRandomString(0, small ? 3 : 10000));
    }
    return lines;
}
if (GENERATE_TESTS) {
    let number = 1;
    while (true) {
        console.log('------TEST: ' + number++);
        const file1 = generateFile(true);
        const file2 = generateFile(true);
        console.log('------TEST GENERATED');
        try {
            assertComputeEdits(file1, file2);
        }
        catch (err) {
            console.log(err);
            console.log(`
const file1 = ${JSON.stringify(file1).replace(/"/g, '\'')};
const file2 = ${JSON.stringify(file2).replace(/"/g, '\'')};
assertComputeEdits(file1, file2);
`);
            break;
        }
    }
}
function createAndRegisterTextBuffer(store, value, defaultEOL) {
    const { disposable, textBuffer } = createTextBuffer(value, defaultEOL);
    store.add(disposable);
    return textBuffer;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibW9kZWxTZXJ2aWNlLnRlc3QuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9lZGl0b3IvdGVzdC9jb21tb24vc2VydmljZXMvbW9kZWxTZXJ2aWNlLnRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxNQUFNLE1BQU0sUUFBUSxDQUFDO0FBRTVCLE9BQU8sS0FBSyxRQUFRLE1BQU0scUNBQXFDLENBQUM7QUFDaEUsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLGdDQUFnQyxDQUFDO0FBQ3JELE9BQU8sRUFBRSxhQUFhLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUN0RSxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0sK0JBQStCLENBQUM7QUFDdEQsT0FBTyxFQUFFLFNBQVMsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQzlELE9BQU8sRUFBRSxhQUFhLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUV0RSxPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSxvQ0FBb0MsQ0FBQztBQUN0RSxPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0sMENBQTBDLENBQUM7QUFDeEUsT0FBTyxFQUFFLHdCQUF3QixFQUFFLE1BQU0sNEVBQTRFLENBQUM7QUFDdEgsT0FBTyxFQUFFLG1CQUFtQixFQUFFLGVBQWUsRUFBRSxNQUFNLHFCQUFxQixDQUFDO0FBQzNFLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUN2RSxPQUFPLEVBQUUsYUFBYSxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDbEUsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sNERBQTRELENBQUM7QUFFbkcsT0FBTyxFQUFFLHVDQUF1QyxFQUFFLE1BQU0sdUNBQXVDLENBQUM7QUFFaEcsTUFBTSxjQUFjLEdBQUcsS0FBSyxDQUFDO0FBRTdCLEtBQUssQ0FBQyxjQUFj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