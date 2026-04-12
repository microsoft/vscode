/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { CustomEditorLabelService } from '../../common/customEditorLabelService.js';
import { TestServiceAccessor, workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';
suite('Custom Editor Label Service', () => {
    const disposables = new DisposableStore();
    setup(() => { });
    teardown(async () => {
        disposables.clear();
    });
    ensureNoDisposablesAreLeakedInTestSuite();
    async function createCustomLabelService(instantiationService = workbenchInstantiationService(undefined, disposables)) {
        const configService = new TestConfigurationService();
        await configService.setUserConfiguration(CustomEditorLabelService.SETTING_ID_ENABLED, true);
        instantiationService.stub(IConfigurationService, configService);
        const customLabelService = disposables.add(instantiationService.createInstance(CustomEditorLabelService));
        return [customLabelService, configService, instantiationService.createInstance(TestServiceAccessor)];
    }
    async function updatePattern(configService, value) {
        await configService.setUserConfiguration(CustomEditorLabelService.SETTING_ID_PATTERNS, value);
        configService.onDidChangeConfigurationEmitter.fire({
            affectsConfiguration: (key) => key === CustomEditorLabelService.SETTING_ID_PATTERNS,
            source: 2 /* ConfigurationTarget.USER */,
            affectedKeys: new Set(CustomEditorLabelService.SETTING_ID_PATTERNS),
            change: {
                keys: [],
                overrides: []
            }
        });
    }
    test('Custom Labels: filename.extname', async () => {
        const [customLabelService, configService] = await createCustomLabelService();
        await updatePattern(configService, {
            '**': '${filename}.${extname}'
        });
        const filenames = [
            'file.txt',
            'file.txt1.tx2',
            '.file.txt',
        ];
        for (const filename of filenames) {
            const label = customLabelService.getName(URI.file(filename));
            assert.strictEqual(label, filename);
        }
        let label = customLabelService.getName(URI.file('file'));
        assert.strictEqual(label, 'file.${extname}');
        label = customLabelService.getName(URI.file('.file'));
        assert.strictEqual(label, '.file.${extname}');
    });
    test('Custom Labels: filename', async () => {
        const [customLabelService, configService] = await createCustomLabelService();
        await updatePattern(configService, {
            '**': '${filename}',
        });
        assert.strictEqual(customLabelService.getName(URI.file('file')), 'file');
        assert.strictEqual(customLabelService.getName(URI.file('file.txt')), 'file');
        assert.strictEqual(customLabelService.getName(URI.file('file.txt1.txt2')), 'file');
        assert.strictEqual(customLabelService.getName(URI.file('folder/file.txt1.txt2')), 'file');
        assert.strictEqual(customLabelService.getName(URI.file('.file')), '.file');
        assert.strictEqual(customLabelService.getName(URI.file('.file.txt')), '.file');
        assert.strictEqual(customLabelService.getName(URI.file('.file.txt1.txt2')), '.file');
        assert.strictEqual(customLabelService.getName(URI.file('folder/.file.txt1.txt2')), '.file');
    });
    test('Custom Labels: extname(N)', async () => {
        const [customLabelService, configService] = await createCustomLabelService();
        await updatePattern(configService, {
            '**/ext/**': '${extname}',
            '**/ext0/**': '${extname(0)}',
            '**/ext1/**': '${extname(1)}',
            '**/ext2/**': '${extname(2)}',
            '**/extMinus1/**': '${extname(-1)}',
            '**/extMinus2/**': '${extname(-2)}',
        });
        function assertExtname(filename, ext) {
            assert.strictEqual(customLabelService.getName(URI.file(`test/ext/${filename}`)), ext.extname ?? '${extname}', filename);
            assert.strictEqual(customLabelService.getName(URI.file(`test/ext0/${filename}`)), ext.ext0 ?? '${extname(0)}', filename);
            assert.strictEqual(customLabelService.getName(URI.file(`test/ext1/${filename}`)), ext.ext1 ?? '${extname(1)}', filename);
            assert.strictEqual(customLabelService.getName(URI.file(`test/ext2/${filename}`)), ext.ext2 ?? '${extname(2)}', filename);
            assert.strictEqual(customLabelService.getName(URI.file(`test/extMinus1/${filename}`)), ext.extMinus1 ?? '${extname(-1)}', filename);
            assert.strictEqual(customLabelService.getName(URI.file(`test/extMinus2/${filename}`)), ext.extMinus2 ?? '${extname(-2)}', filename);
        }
        assertExtname('file.txt', {
            extname: 'txt',
            ext0: 'txt',
            extMinus1: 'txt',
        });
        assertExtname('file.txt1.txt2', {
            extname: 'txt1.txt2',
            ext0: 'txt2',
            ext1: 'txt1',
            extMinus1: 'txt1',
            extMinus2: 'txt2',
        });
        assertExtname('.file.txt1.txt2', {
            extname: 'txt1.txt2',
            ext0: 'txt2',
            ext1: 'txt1',
            extMinus1: 'txt1',
            extMinus2: 'txt2',
        });
        assertExtname('.file.txt1.txt2.txt3.txt4', {
            extname: 'txt1.txt2.txt3.txt4',
            ext0: 'txt4',
            ext1: 'txt3',
            ext2: 'txt2',
            extMinus1: 'txt1',
            extMinus2: 'txt2',
        });
        assertExtname('file', {});
        assertExtname('.file', {});
    });
    test('Custom Labels: dirname(N)', async () => {
        const [customLabelService, configService] = await createCustomLabelService();
        await updatePattern(configService, {
            '**': '${dirname},${dirname(0)},${dirname(1)},${dirname(2)},${dirname(-1)},${dirname(-2)}',
        });
        function assertDirname(path, dir) {
            assert.strictEqual(customLabelService.getName(URI.file(path))?.split(',')[0], dir.dirname ?? '${dirname}', path);
            assert.strictEqual(customLabelService.getName(URI.file(path))?.split(',')[1], dir.dir0 ?? '${dirname(0)}', path);
            assert.strictEqual(customLabelService.getName(URI.file(path))?.split(',')[2], dir.dir1 ?? '${dirname(1)}', path);
            assert.strictEqual(customLabelService.getName(URI.file(path))?.split(',')[3], dir.dir2 ?? '${dirname(2)}', path);
            assert.strictEqual(customLabelService.getName(URI.file(path))?.split(',')[4], dir.dirMinus1 ?? '${dirname(-1)}', path);
            assert.strictEqual(customLabelService.getName(URI.file(path))?.split(',')[5], dir.dirMinus2 ?? '${dirname(-2)}', path);
        }
        assertDirname('folder/file.txt', {
            dirname: 'folder',
            dir0: 'folder',
            dirMinus1: 'folder',
        });
        assertDirname('root/folder/file.txt', {
            dirname: 'folder',
            dir0: 'folder',
            dir1: 'root',
            dirMinus1: 'root',
            dirMinus2: 'folder',
        });
        assertDirname('root/.folder/file.txt', {
            dirname: '.folder',
            dir0: '.folder',
            dir1: 'root',
            dirMinus1: 'root',
            dirMinus2: '.folder',
        });
        assertDirname('root/parent/folder/file.txt', {
            dirname: 'folder',
            dir0: 'folder',
            dir1: 'parent',
            dir2: 'root',
            dirMinus1: 'root',
            dirMinus2: 'parent',
        });
        assertDirname('file.txt', {});
    });
    test('Custom Labels: no pattern match', async () => {
        const [customLabelService, configService] = await createCustomLabelService();
        await updatePattern(configService, {
            '**/folder/**': 'folder',
            'file': 'file',
        });
        assert.strictEqual(customLabelService.getName(URI.file('file')), undefined);
        assert.strictEqual(customLabelService.getName(URI.file('file.txt')), undefined);
        assert.strictEqual(customLabelService.getName(URI.file('file.txt1.txt2')), undefined);
        assert.strictEqual(customLabelService.getName(URI.file('folder1/file.txt1.txt2')), undefined);
        assert.strictEqual(customLabelService.getName(URI.file('.file')), undefined);
        assert.strictEqual(customLabelService.getName(URI.file('.file.txt')), undefined);
        assert.strictEqual(customLabelService.getName(URI.file('.file.txt1.txt2')), undefined);
        assert.strictEqual(customLabelService.getName(URI.file('folder1/file.txt1.txt2')), undefined);
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY3VzdG9tRWRpdG9yTGFiZWxTZXJ2aWNlLnRlc3QuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvc2VydmljZXMvZWRpdG9yL3Rlc3QvYnJvd3Nlci9jdXN0b21FZGl0b3JMYWJlbFNlcnZpY2UudGVzdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLE1BQU0sTUFBTSxRQUFRLENBQUM7QUFDNUIsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQzFFLE9BQU8sRUFBRSxHQUFHLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUN4RCxPQUFPLEVBQUUsdUNBQXVDLEVBQUUsTUFBTSwwQ0FBMEMsQ0FBQztBQUNuRyxPQUFPLEVBQXVCLHFCQUFxQixFQUFFLE1BQU0sK0RBQStELENBQUM7QUFDM0gsT0FBTyxFQUFFLHdCQUF3QixFQUFFLE1BQU0sK0VBQStFLENBQUM7QUFDekgsT0FBTyxFQUFFLHdCQUF3QixFQUFFLE1BQU0sMENBQTBDLENBQUM7QUFDcEYsT0FBTyxFQUE2QixtQkFBbUIsRUFBRSw2QkFBNkIsRUFBRSxNQUFNLG1EQUFtRCxDQUFDO0FBRWxKLEtBQUssQ0FBQyw2QkFBNkIsRUFBRSxHQUFHLEVBQUU7SUFFekMsTUFBTSxXQUFXLEdBQUcsSUFBSSxlQUFlLEVBQUUsQ0FBQztJQUUxQyxLQUFLLENBQUMsR0FBRyxFQUFFLEdBQUcsQ0FBQyxDQUFDLENBQUM7SUFFakIsUUFBUSxDQUFDLEtBQUssSUFBSSxFQUFFO1FBQ25CLFdBQVcsQ0FBQyxLQUFLLEVBQUUsQ0FBQztJQUNyQixDQUFDLENBQUMsQ0FBQztJQUVILHVDQUF1QyxFQUFFLENBQUM7SUFFMUMsS0FBSyxVQUFVLHdCQUF3QixDQUFDLHVCQUFrRCw2QkFBNkIsQ0FBQyxTQUFTLEVBQUUsV0FBVyxDQUFDO1FBQzlJLE1BQU0s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