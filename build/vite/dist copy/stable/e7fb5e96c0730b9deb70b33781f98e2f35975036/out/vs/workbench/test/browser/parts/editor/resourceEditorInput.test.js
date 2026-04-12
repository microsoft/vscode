/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import assert from 'assert';
import { URI } from '../../../../../base/common/uri.js';
import { workbenchInstantiationService } from '../../workbenchTestServices.js';
import { AbstractResourceEditorInput } from '../../../../common/editor/resourceEditorInput.js';
import { ILabelService } from '../../../../../platform/label/common/label.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { IFilesConfigurationService } from '../../../../services/filesConfiguration/common/filesConfigurationService.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ITextResourceConfigurationService } from '../../../../../editor/common/services/textResourceConfiguration.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { CustomEditorLabelService, ICustomEditorLabelService } from '../../../../services/editor/common/customEditorLabelService.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
suite('ResourceEditorInput', () => {
    const disposables = new DisposableStore();
    let TestResourceEditorInput = class TestResourceEditorInput extends AbstractResourceEditorInput {
        constructor(resource, labelService, fileService, filesConfigurationService, textResourceConfigurationService, customEditorLabelService) {
            super(resource, resource, labelService, fileService, filesConfigurationService, textResourceConfigurationService, customEditorLabelService);
            this.typeId = 'test.typeId';
        }
    };
    TestResourceEditorInput = __decorate([
        __param(1, ILabelService),
        __param(2, IFileService),
        __param(3, IFilesConfigurationService),
        __param(4, ITextResourceConfigurationService),
        __param(5, ICustomEditorLabelService)
    ], TestResourceEditorInput);
    async function createServices() {
        const instantiationService = workbenchInstantiationService(undefined, disposables);
        const testConfigurationService = new TestConfigurationService();
        instantiationService.stub(IConfigurationService, testConfigurationService);
        const customEditorLabelService = disposables.add(new CustomEditorLabelService(testConfigurationService, instantiationService.get(IWorkspaceContextService)));
        instantiationService.stub(ICustomEditorLabelService, customEditorLabelService);
        return [instantiationService, testConfigurationService, customEditorLabelService];
    }
    teardown(() => {
        disposables.clear();
    });
    test('basics', async () => {
        const [instantiationService] = await createServices();
        const resource = URI.from({ scheme: 'testResource', path: 'thePath/of/the/resource.txt' });
        const input = disposables.add(instantiationService.createInstance(TestResourceEditorInput, resource));
        assert.ok(input.getName().length > 0);
        assert.ok(input.getDescription(0 /* Verbosity.SHORT */).length > 0);
        assert.ok(input.getDescription(1 /* Verbosity.MEDIUM */).length > 0);
        assert.ok(input.getDescription(2 /* Verbosity.LONG */).length > 0);
        assert.ok(input.getTitle(0 /* Verbosity.SHORT */).length > 0);
        assert.ok(input.getTitle(1 /* Verbosity.MEDIUM */).length > 0);
        assert.ok(input.getTitle(2 /* Verbosity.LONG */).length > 0);
        assert.strictEqual(input.hasCapability(2 /* EditorInputCapabilities.Readonly */), false);
        assert.strictEqual(input.isReadonly(), false);
        assert.strictEqual(input.hasCapability(4 /* EditorInputCapabilities.Untitled */), true);
    });
    test('custom editor name', async () => {
        const [instantiationService, testConfigurationService, customEditorLabelService] = await createServices();
        const resource1 = URI.from({ scheme: 'testResource', path: 'thePath/of/the/resource.txt' });
        const resource2 = URI.from({ scheme: 'testResource', path: 'theOtherPath/of/the/resource.md' });
        const input1 = disposables.add(instantiationService.createInstance(TestResourceEditorInput, resource1));
        const input2 = disposables.add(instantiationService.createInstance(TestResourceEditorInput, resource2));
        await testConfigurationService.setUserConfiguration(CustomEditorLabelService.SETTING_ID_PATTERNS, {
            '**/theOtherPath/**': 'Label 1',
            '**/*.txt': 'Label 2',
            '**/resource.txt': 'Label 3',
        });
        // eslint-disable-next-line local/code-no-any-casts
        testConfigurationService.onDidChangeConfigurationEmitter.fire({ affectsConfiguration(configuration) { return configuration === CustomEditorLabelService.SETTING_ID_PATTERNS; }, source: 2 /* ConfigurationTarget.USER */ });
        let label1Name = '';
        let label2Name = '';
        disposables.add(customEditorLabelService.onDidChange(() => {
            label1Name = input1.getName();
            label2Name = input2.getName();
        }));
        await testConfigurationService.setUserConfiguration(CustomEditorLabelService.SETTING_ID_ENABLED, true);
        // eslint-disable-next-line local/code-no-any-casts
        testConfigurationService.onDidChangeConfigurationEmitter.fire({ affectsConfiguration(configuration) { return configuration === CustomEditorLabelService.SETTING_ID_ENABLED; }, source: 2 /* ConfigurationTarget.USER */ });
        assert.ok(label1Name === 'Label 3');
        assert.ok(label2Name === 'Label 1');
        await testConfigurationService.setUserConfiguration(CustomEditorLabelService.SETTING_ID_ENABLED, false);
        // eslint-disable-next-line local/code-no-any-casts
        testConfigurationService.onDidChangeConfigurationEmitter.fire({ affectsConfiguration(configuration) { return configuration === CustomEditorLabelService.SETTING_ID_ENABLED; }, source: 2 /* ConfigurationTarget.USER */ });
        assert.ok(label1Name === 'resource.txt');
        assert.ok(label2Name === 'resource.md');
        await testConfigurationService.setUserConfiguration(CustomEditorLabelService.SETTING_ID_ENABLED, true);
        // eslint-disable-next-line local/code-no-any-casts
        testConfigurationService.onDidChangeConfigurationEmitter.fire({ affectsConfiguration(configuration) { return configuration === CustomEditorLabelService.SETTING_ID_ENABLED; }, source: 2 /* ConfigurationTarget.USER */ });
        await testConfigurationService.setUserConfiguration(CustomEditorLabelService.SETTING_ID_PATTERNS, {
            'thePath/**/resource.txt': 'Label 4',
            'thePath/of/*/resource.txt': 'Label 5',
        });
        // eslint-disable-next-line local/code-no-any-casts
        testConfigurationService.onDidChangeConfigurationEmitter.fire({ affectsConfiguration(configuration) { return configuration === CustomEditorLabelService.SETTING_ID_PATTERNS; }, source: 2 /* ConfigurationTarget.USER */ });
        assert.ok(label1Name === 'Label 5');
        assert.ok(label2Name === 'resource.md');
    });
    ensureNoDisposablesAreLeakedInTestSuite();
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicmVzb3VyY2VFZGl0b3JJbnB1dC50ZXN0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL3Rlc3QvYnJvd3Nlci9wYXJ0cy9lZGl0b3IvcmVzb3VyY2VFZGl0b3JJbnB1dC50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sTUFBTSxNQUFNLFFBQVEsQ0FBQztBQUM1QixPQUFPLEVBQUUsR0FBRyxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFFeEQsT0FBTyxFQUFFLDZCQUE2QixFQUFFLE1BQU0sZ0NBQWdDLENBQUM7QUFDL0UsT0FBTyxFQUFFLDJCQUEyQixFQUFFLE1BQU0sa0RBQWtELENBQUM7QUFDL0YsT0FBTyxFQUFFLGFBQWEsRUFBRSxNQUFNLCtDQUErQyxDQUFDO0FBQzlFLE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSwrQ0FBK0MsQ0FBQztBQUU3RSxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDMUUsT0FBTyxFQUFFLDBCQUEwQixFQUFFLE1BQU0sNkVBQTZFLENBQUM7QUFDekgsT0FBTyxFQUFFLHVDQUF1QyxFQUFFLE1BQU0sMENBQTBDLENBQUM7QUFDbkcsT0FBTyxFQUFFLGlDQUFpQyxFQUFFLE1BQU0sb0VBQW9FLENBQUM7QUFDdkgsT0FBTyxFQUF1QixxQkFBcUIsRUFBRSxNQUFNLCtEQUErRCxDQUFDO0FBQzNILE9BQU8sRUFBRSx3QkFBd0IsRUFBRSx5QkFBeUIsRUFBRSxNQUFNLGdFQUFnRSxDQUFDO0FBQ3JJLE9BQU8sRUFBRSx3QkFBd0IsRUFBRSxNQUFNLCtFQUErRSxDQUFDO0FBQ3pILE9BQU8sRUFBRSx3QkFBd0IsRUFBRSxNQUFNLHVEQUF1RCxDQUFDO0FBRWpHLEtBQUssQ0FBQyxxQkFBcUIsRUFBRSxHQUFHLEVBQUU7SUFFakMsTUFB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