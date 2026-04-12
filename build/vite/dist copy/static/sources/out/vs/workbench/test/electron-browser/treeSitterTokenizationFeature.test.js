/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { TestInstantiationService } from '../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../base/test/common/utils.js';
import { IModelService } from '../../../editor/common/services/model.js';
import { Event } from '../../../base/common/event.js';
import { URI } from '../../../base/common/uri.js';
import { IFileService } from '../../../platform/files/common/files.js';
import { ILogService, NullLogService } from '../../../platform/log/common/log.js';
import { ITelemetryService } from '../../../platform/telemetry/common/telemetry.js';
import { IConfigurationService } from '../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../platform/configuration/test/common/testConfigurationService.js';
import { IEnvironmentService } from '../../../platform/environment/common/environment.js';
import { ModelService } from '../../../editor/common/services/modelService.js';
import { FileService } from '../../../platform/files/common/fileService.js';
import { Schemas } from '../../../base/common/network.js';
import { TestIPCFileSystemProvider } from './workbenchTestServices.js';
import { ILanguageService } from '../../../editor/common/languages/language.js';
import { LanguageService } from '../../../editor/common/services/languageService.js';
import { TestColorTheme, TestThemeService } from '../../../platform/theme/test/common/testThemeService.js';
import { IThemeService } from '../../../platform/theme/common/themeService.js';
import { ITextResourcePropertiesService } from '../../../editor/common/services/textResourceConfiguration.js';
import { TestTextResourcePropertiesService } from '../common/workbenchTestServices.js';
import { TestLanguageConfigurationService } from '../../../editor/test/common/modes/testLanguageConfigurationService.js';
import { ILanguageConfigurationService } from '../../../editor/common/languages/languageConfigurationRegistry.js';
import { IUndoRedoService } from '../../../platform/undoRedo/common/undoRedo.js';
import { UndoRedoService } from '../../../platform/undoRedo/common/undoRedoService.js';
import { TestDialogService } from '../../../platform/dialogs/test/common/testDialogService.js';
import { TestNotificationService } from '../../../platform/notification/test/common/testNotificationService.js';
import { DisposableStore } from '../../../base/common/lifecycle.js';
import { TokenStyle } from '../../../platform/theme/common/tokenClassificationRegistry.js';
import { Color } from '../../../base/common/color.js';
import { Range } from '../../../editor/common/core/range.js';
import { ITreeSitterLibraryService } from '../../../editor/common/services/treeSitter/treeSitterLibraryService.js';
import { TreeSitterLibraryService } from '../../services/treeSitter/browser/treeSitterLibraryService.js';
import { autorunHandleChanges, recordChanges, waitForState } from '../../../base/common/observable.js';
import { ITreeSitterThemeService } from '../../../editor/common/services/treeSitter/treeSitterThemeService.js';
import { TreeSitterThemeService } from '../../services/treeSitter/browser/treeSitterThemeService.js';
class MockTelemetryService {
    constructor() {
        this.telemetryLevel = 0 /* TelemetryLevel.NONE */;
        this.sessionId = '';
        this.machineId = '';
        this.sqmId = '';
        this.devDeviceId = '';
        this.firstSessionDate = '';
        this.sendErrorTelemetry = false;
    }
    publicLog(eventName, data) {
    }
    publicLog2(eventName, data) {
    }
    publicLogError(errorEventName, data) {
    }
    publicLogError2(eventName, data) {
    }
    setExperimentProperty(name, value) {
    }
    setCommonProperty(name, value) {
    }
}
class TestTreeSitterColorTheme extends TestColorTheme {
    resolveScopes(scopes, definitions) {
        return new TokenStyle(Color.red, undefined, undefined, undefined, undefined);
    }
    getTokenColorIndex() {
        return { get: () => 10 };
    }
}
suite('Tree Sitter TokenizationFeature', function () {
    let instantiationService;
    let modelService;
    let fileService;
    let textResourcePropertiesService;
    let languageConfigurationService;
    let telemetryService;
    let logService;
    let configurationService;
    let themeService;
    let languageService;
    let environmentService;
    let disposables;
    setup(async () => {
        disposables = new DisposableStore();
        instantiationService = disposables.add(new TestInstantiationService());
        telemetryService = new MockTelemetryService();
        logService = new NullLogService();
        configurationService = new TestConfigurationService({ 'editor.experimental.preferTreeSitter.typescript': true });
        themeService = new TestThemeService(new TestTreeSitterColorTheme());
        environmentService = {};
        instantiationService.set(IEnvironmentService, environmentService);
        instantiationService.set(IConfigurationService, configurationService);
        instantiationService.set(ILogService, logService);
        instantiationService.set(ITelemetryService, telemetryService);
        languageService = disposables.add(instantiationService.createInstance(LanguageService));
        instantiationService.set(ILanguageService, languageService);
        instantiationService.set(IThemeService, themeService);
        textResourcePropertiesService = instantiationService.createInstance(TestTextResourcePropertiesService);
        instantiationService.set(ITextResourcePropertiesService, textResourcePropertiesService);
        languageConfigurationService = disposables.add(instantiationService.createInstance(TestLanguageConfigurationService));
        instantiationService.set(ILanguageConfigurationService, languageConfigurationService);
        fileService = disposables.add(instantiationService.createInstance(FileService));
        const fileSystemProvider = new TestIPCFileSystemProvider();
        disposables.add(fileService.registerProvider(Schemas.file, fileSystemProvider));
        instantiationService.set(IFileService, fileService);
        const libraryService = disposables.add(instantiationService.createInstance(TreeSitterLibraryService));
        libraryService.isTest = true;
        instantiationService.set(ITreeSitterLibraryService, libraryService);
        instantiationService.set(ITreeSitterThemeService, instantiationService.createInstance(TreeSitterThemeService));
        const dialogService = new TestDialogService();
        const notificationService = new TestNotificationService();
        const undoRedoService = new UndoRedoService(dialogService, notificationService);
        instantiationService.set(IUndoRedoService, undoRedoService);
        modelService = new ModelService(configurationService, textResourcePropertiesService, undoRedoService, instantiationService);
        instantiationService.set(IModelService, modelService);
    });
    teardown(() => {
        disposables.dispose();
    });
    ensureNoDisposablesAreLeakedInTestSuite();
    function tokensContentSize(tokens) {
        return tokens[tokens.length - 1].startOffsetInclusive + tokens[tokens.length - 1].length;
    }
    let nameNumber = 1;
    async function getModelAndPrepTree(content) {
        const model = disposables.add(modelService.createModel(content, { languageId: 'typescript', onDidChange: Event.None }, URI.file(`file${nameNumber++}.ts`)));
        const treeSitterTreeObs = disposables.add(model.tokenization.tokens.get()).tree;
        const tokenizationImplObs = disposables.add(model.tokenization.tokens.get()).tokenizationImpl;
        const treeSitterTree = treeSitterTreeObs.get() ?? await waitForState(treeSitterTreeObs);
        if (!treeSitterTree.tree.get()) {
            await waitForState(treeSitterTree.tree);
        }
        const tokenizationImpl = tokenizationImplObs.get() ?? await waitForState(tokenizationImplObs);
        assert.ok(treeSitterTree);
        return { model, treeSitterTree, tokenizationImpl };
    }
    function verifyTokens(tokens) {
        assert.ok(tokens);
        for (let i = 1; i < tokens.length; i++) {
            const previousToken = tokens[i - 1];
            const token = tokens[i];
            assert.deepStrictEqual(previousToken.startOffsetInclusive + previousToken.length, token.startOffsetInclusive);
        }
    }
    test('Three changes come back to back ', async () => {
        const content = `/**
**/
class x {
}




class y {
}`;
        const { model, treeSitterTree } = await getModelAndPrepTree(content);
        let updateListener;
        const changePromise = new Promise(resolve => {
            updateListener = autorunHandleChanges({
                owner: this,
                changeTracker: recordChanges({ tree: treeSitterTree.tree }),
            }, (reader, ctx) => {
                const changeEvent = ctx.changes.at(0)?.change;
                if (changeEvent) {
                    resolve(changeEvent);
                }
            });
        });
        const edit1 = new Promise(resolve => {
            model.applyEdits([{ range: new Range(7, 1, 8, 1), text: '' }]);
            resolve();
        });
        const edit2 = new Promise(resolve => {
            model.applyEdits([{ range: new Range(6, 1, 7, 1), text: '' }]);
            resolve();
        });
        const edit3 = new Promise(resolve => {
            model.applyEdits([{ range: new Range(5, 1, 6, 1), text: '' }]);
            resolve();
        });
        const edits = Promise.all([edit1, edit2, edit3]);
        const change = await changePromise;
        await edits;
        assert.ok(change);
        assert.strictEqual(change.versionId, 4);
        assert.strictEqual(change.ranges[0].newRangeStartOffset, 0);
        assert.strictEqual(change.ranges[0].newRangeEndOffset, 32);
        assert.strictEqual(change.ranges[0].newRange.startLineNumber, 1);
        assert.strictEqual(change.ranges[0].newRange.endLineNumber, 7);
        updateListener?.dispose();
        modelService.destroyModel(model.uri);
    });
    test('File single line file', async () => {
        const content = `console.log('x');`;
        const { model, tokenizationImpl } = await getModelAndPrepTree(content);
        const tokens = tokenizationImpl.getTokensInRange(new Range(1, 1, 1, 18), 0, 17);
        verifyTokens(tokens);
        assert.deepStrictEqual(tokens?.length, 9);
        assert.deepStrictEqual(tokensContentSize(tokens), content.length);
        modelService.destroyModel(model.uri);
    });
    test('File with new lines at beginning and end', async () => {
        const content = `
console.log('x');
`;
        const { model, tokenizationImpl } = await getModelAndPrepTree(content);
        const tokens = tokenizationImpl.getTokensInRange(new Range(1, 1, 3, 1), 0, 19);
        verifyTokens(tokens);
        assert.deepStrictEqual(tokens?.length, 11);
        assert.deepStrictEqual(tokensContentSize(tokens), content.length);
        modelService.destroyModel(model.uri);
    });
    test('File with new lines at beginning and end \\r\\n', async () => {
        const content = '\r\nconsole.log(\'x\');\r\n';
        const { model, tokenizationImpl } = await getModelAndPrepTree(content);
        const tokens = tokenizationImpl.getTokensInRange(new Range(1, 1, 3, 1), 0, 21);
        verifyTokens(tokens);
        assert.deepStrictEqual(tokens?.length, 11);
        assert.deepStrictEqual(tokensContentSize(tokens), content.length);
        modelService.destroyModel(model.uri);
    });
    test('File with empty lines in the middle', async () => {
        const content = `
console.log('x');

console.log('7');
`;
        const { model, tokenizationImpl } = await getModelAndPrepTree(content);
        const tokens = tokenizationImpl.getTokensInRange(new Range(1, 1, 5, 1), 0, 38);
        verifyTokens(tokens);
        assert.deepStrictEqual(tokens?.length, 21);
        assert.deepStrictEqual(tokensContentSize(tokens), content.length);
        modelService.destroyModel(model.uri);
    });
    test('File with empty lines in the middle \\r\\n', async () => {
        const content = '\r\nconsole.log(\'x\');\r\n\r\nconsole.log(\'7\');\r\n';
        const { model, tokenizationImpl } = await getModelAndPrepTree(content);
        const tokens = tokenizationImpl.getTokensInRange(new Range(1, 1, 5, 1), 0, 42);
        verifyTokens(tokens);
        assert.deepStrictEqual(tokens?.length, 21);
        assert.deepStrictEqual(tokensContentSize(tokens), content.length);
        modelService.destroyModel(model.uri);
    });
    test('File with non-empty lines that match no scopes', async () => {
        const content = `console.log('x');
;
{
}
`;
        const { model, tokenizationImpl } = await getModelAndPrepTree(content);
        const tokens = tokenizationImpl.getTokensInRange(new Range(1, 1, 5, 1), 0, 24);
        verifyTokens(tokens);
        assert.deepStrictEqual(tokens?.length, 16);
        assert.deepStrictEqual(tokensContentSize(tokens), content.length);
        modelService.destroyModel(model.uri);
    });
    test('File with non-empty lines that match no scopes \\r\\n', async () => {
        const content = 'console.log(\'x\');\r\n;\r\n{\r\n}\r\n';
        const { model, tokenizationImpl } = await getModelAndPrepTree(content);
        const tokens = tokenizationImpl.getTokensInRange(new Range(1, 1, 5, 1), 0, 28);
        verifyTokens(tokens);
        assert.deepStrictEqual(tokens?.length, 16);
        assert.deepStrictEqual(tokensContentSize(tokens), content.length);
        modelService.destroyModel(model.uri);
    });
    test('File with tree-sitter token that spans multiple lines', async () => {
        const content = `/**
**/

console.log('x');

`;
        const { model, tokenizationImpl } = await getModelAndPrepTree(content);
        const tokens = tokenizationImpl.getTokensInRange(new Range(1, 1, 6, 1), 0, 28);
        verifyTokens(tokens);
        assert.deepStrictEqual(tokens?.length, 12);
        assert.deepStrictEqual(tokensContentSize(tokens), content.length);
        modelService.destroyModel(model.uri);
    });
    test('File with tree-sitter token that spans multiple lines \\r\\n', async () => {
        const content = '/**\r\n**/\r\n\r\nconsole.log(\'x\');\r\n\r\n';
        const { model, tokenizationImpl } = await getModelAndPrepTree(content);
        const tokens = tokenizationImpl.getTokensInRange(new Range(1, 1, 6, 1), 0, 33);
        verifyTokens(tokens);
        assert.deepStrictEqual(tokens?.length, 12);
        assert.deepStrictEqual(tokensContentSize(tokens), content.length);
        modelService.destroyModel(model.uri);
    });
    test('File with tabs', async () => {
        const content = `function x() {
	return true;
}

class Y {
	private z = false;
}`;
        const { model, tokenizationImpl } = await getModelAndPrepTree(content);
        const tokens = tokenizationImpl.getTokensInRange(new Range(1, 1, 7, 1), 0, 63);
        verifyTokens(tokens);
        assert.deepStrictEqual(tokens?.length, 30);
        assert.deepStrictEqual(tokensContentSize(tokens), content.length);
        modelService.destroyModel(model.uri);
    });
    test('File with tabs \\r\\n', async () => {
        const content = 'function x() {\r\n\treturn true;\r\n}\r\n\r\nclass Y {\r\n\tprivate z = false;\r\n}';
        const { model, tokenizationImpl } = await getModelAndPrepTree(content);
        const tokens = tokenizationImpl.getTokensInRange(new Range(1, 1, 7, 1), 0, 69);
        verifyTokens(tokens);
        assert.deepStrictEqual(tokens?.length, 30);
        assert.deepStrictEqual(tokensContentSize(tokens), content.length);
        modelService.destroyModel(model.uri);
    });
    test('Template string', async () => {
        const content = '`t ${6}`';
        const { model, tokenizationImpl } = await getModelAndPrepTree(content);
        const tokens = tokenizationImpl.getTokensInRange(new Range(1, 1, 1, 8), 0, 8);
        verifyTokens(tokens);
        assert.deepStrictEqual(tokens?.length, 6);
        assert.deepStrictEqual(tokensContentSize(tokens), content.length);
        modelService.destroyModel(model.uri);
    });
    test('Many nested scopes', async () => {
        const content = `y = new x(ttt({
	message: '{0} i\\n\\n [commandName]({1}).',
	args: ['Test', \`command:\${openSettingsCommand}?\${encodeURIComponent('["SettingName"]')}\`],
	// To make sure the translators don't break the link
	comment: ["{Locked=']({'}"]
}));`;
        const { model, tokenizationImpl } = await getModelAndPrepTree(content);
        const tokens = tokenizationImpl.getTokensInRange(new Range(1, 1, 6, 5), 0, 238);
        verifyTokens(tokens);
        assert.deepStrictEqual(tokens?.length, 65);
        assert.deepStrictEqual(tokensContentSize(tokens), content.length);
        modelService.destroyModel(model.uri);
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidHJlZVNpdHRlclRva2VuaXphdGlvbkZlYXR1cmUudGVzdC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC90ZXN0L2VsZWN0cm9uLWJyb3dzZXIvdHJlZVNpdHRlclRva2VuaXphdGlvbkZlYXR1cmUudGVzdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLE1BQU0sTUFBTSxRQUFRLENBQUM7QUFDNUIsT0FBTyxFQUFFLHdCQUF3QixFQUFFLE1BQU0seUVBQXlFLENBQUM7QUFDbkgsT0FBTyxFQUFFLHVDQUF1QyxFQUFFLE1BQU0sb0NBQW9DLENBQUM7QUFDN0YsT0FBTyxFQUFFLGFBQWEsRUFBRSxNQUFNLDBDQUEwQyxDQUFDO0FBQ3pFLE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSwrQkFBK0IsQ0FBQztBQUN0RCxPQUFPLEVBQUUsR0FBRyxFQUFFLE1BQU0sNkJBQTZCLENBQUM7QUFDbEQsT0FBTyxFQUFFLFlBQVksRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQ3ZFLE9BQU8sRUFBRSxXQUFXLEVBQUUsY0FBYyxFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFDbEYsT0FBTyxFQUFrQixpQkFBaUIsRUFBa0IsTUFBTSxpREFBaUQsQ0FBQztBQUVwSCxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSx5REFBeUQsQ0FBQztBQUNoRyxPQUFPLEVBQUUsd0JBQXdCLEVBQUUsTUFBTSx5RUFBeUUsQ0FBQztBQUNuSCxPQUFPLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSxxREFBcUQsQ0FBQztBQUMxRixPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0saURBQWlELENBQUM7QUFFL0UsT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLCtDQUErQyxDQUFDO0FBQzVFLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxpQ0FBaUMsQ0FBQztBQUMxRCxPQUFPLEVBQUUseUJBQXlCLEVBQUUsTUFBTSw0QkFBNEIsQ0FBQztBQUN2RSxPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSw4Q0FBOEMsQ0FBQztBQUNoRixPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sb0RBQW9ELENBQUM7QUFDckYsT0FBTyxFQUFFLGNBQWMsRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLHlEQUF5RCxDQUFDO0FBQzNHLE9BQU8sRUFBRSxhQUFhLEVBQUUsTUFBTSxnREFBZ0QsQ0FBQztBQUMvRSxPQUFPLEVBQUUsOEJBQThCLEVBQUUsTUFBTSw4REFBOEQsQ0FBQztBQUM5RyxPQUFPLEVBQUUsaUNBQWlDLEVBQUUsTUFBTSxvQ0FBb0MsQ0FBQztBQUN2RixPQUFPLEVBQUUsZ0NBQWdDLEVBQUUsTUFBTSx1RUFBdUUsQ0FBQztBQUN6SCxPQUFPLEVBQUUsNkJBQTZCLEVBQUUsTUFBTSxtRUFBbUUsQ0FBQztBQUNsSCxPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSwrQ0FBK0MsQ0FBQztBQUNqRixPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sc0RBQXNELENBQUM7QUFDdkYsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sNERBQTRELENBQUM7QUFDL0YsT0FBTyxFQUFFLHVCQUF1QixFQUFFLE1BQU0sdUVBQXVFLENBQUM7QUFDaEgsT0FBTyxFQUFFLGVBQWUsRUFBZSxNQUFNLG1DQUFtQyxDQUFDO0FBQ2pGLE9BQU8sRUFBYyxVQUFVLEVBQUUsTUFBTSwrREFBK0QsQ0FBQztBQUV2RyxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0sK0JBQStCLENBQUM7QUFDdEQsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBRTdELE9BQU8sRUFBRSx5QkFBeUIsRUFBRSxNQUFNLHdFQUF3RSxDQUFDO0FBQ25ILE9BQU8sRUFBRSx3QkFBd0IsRUFBRSxNQUFNLCtEQUErRCxDQUFDO0FBTXpHLE9BQU8sRUFBRSxvQkFBb0IsRUFBRSxhQUFhLEVBQUUsWUFBWSxFQUFFLE1BQU0sb0NBQW9DLENBQUM7QUFDdkcsT0FBTyxFQUFFLHVCQUF1QixFQUFFLE1BQU0sc0VBQXNFLENBQUM7QUFDL0csT0FBTyxFQUFFLHNCQUFzQixFQUFFLE1BQU0sNkRBQTZELENBQUM7QUFFckcsTUFBTSxvQkFBb0I7SUFBMUI7UUFFQyxtQkFBYywrQkFBdUM7UUFDckQsY0FBUyxHQUFXLEVBQUUsQ0FBQztRQUN2QixjQUFTLEdBQVcsRUFBRSxDQUFDO1FBQ3ZCLFVBQUssR0FBVyxFQUFFLENBQUM7UUFDbkIsZ0JBQVcsR0FBVyxFQUFFLENBQUM7UUFDekIscUJBQWdCLEdBQVcsRUFBRSxDQUFDO1FBQzlCLHVCQUFrQixHQUFZLEtBQUssQ0FBQztJQWFyQyxDQUFDO0lBWkEsU0FBUyxDQUFDLFNBQWlCLEVBQUUsSUFBcUI7SUFDbEQsQ0FBQztJQUNELFVBQVUsQ0FBc0YsU0FBaUIsRUFBRSxJQUFnQztJQUNuSixDQUFDO0lBQ0QsY0FBYyxDQUFDLGNBQXNCLEVBQUUsSUFBcUI7SUFDNUQsQ0FBQztJQUNELGVBQWUsQ0FBc0YsU0FBaUIsRUFBRSxJQUFnQztJQUN4SixDQUFDO0lBQ0QscUJBQXFCLENBQUMsSUFBWSxFQUFFLEtBQWE7SUFDakQsQ0FBQztJQUNELGlCQUFpQixDQUFDLElBQVksRUFBRSxLQUFhO0lBQzdDLENBQUM7Q0FDRDtBQUdELE1BQU0sd0JBQXlCLFNBQVEsY0FBYztJQUM3QyxhQUFhLENBQUMsTUFBb0IsRUFBRSxXQUE0QztRQUN0RixPQUFPLElBQUksVUFBVSxDQUFDLEtBQUssQ0FBQyxHQUFHLEVBQUUsU0FBUyxFQUFFLFNBQVMsRUFBRSxTQUFTLEVBQUUsU0FBUyxDQUFDLENBQUM7SUFDOUUsQ0FBQztJQUNNLGtCQUFrQjtRQUN4QixPQUFPLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDO0lBQzFCLENBQUM7Q0FDRDtBQUVELEtBQUssQ0FBQyxpQ0FBaUMsRUFBRTtJQUV4QyxJQUFJLG9CQUE4QyxDQUFDO0lBQ25ELElBQUksWUFBMkIsQ0FBQztJQUNoQyxJQUFJLFdBQXlCLENBQUM7SUFDOUIsSUFBSSw2QkFBNkQsQ0FBQztJQUNsRSxJQUFJLDRCQUEyRCxDQUFDO0lBQ2hFLElBQUksZ0JBQW1DLENBQUM7SUFDeEMsSUFBSSxVQUF1QixDQUFDO0lBQzVCLElBQUksb0JBQTJDLENBQUM7SUFDaEQsSUFBSSxZQUEyQixDQUFDO0lBQ2hDLElBQUksZUFBaUMsQ0FBQztJQUN0QyxJQUFJLGtCQUF1QyxDQUFDO0lBRTVDLElBQUksV0FBNEIsQ0FBQztJQUVqQyxLQUFLLENBQUMsS0FBSyxJQUFJLEVBQUU7UUFDaEIsV0FBVyxHQUFHLElBQUksZUFBZSxFQUFFLENBQUM7UUFDcEMsb0JBQW9CLEdBQUcsV0FBVyxDQUFDLEdBQUcsQ0FBQyxJQUFJLHdCQUF3QixFQUFFLENBQUMsQ0FBQztRQUV2RSxnQkFBZ0IsR0FBRyxJQUFJLG9CQUFvQixFQUFFLENBQUM7UUFDOUMsVUFBVSxHQUFHLElBQUksY0FBYyxFQUFFLENBQUM7UUFDbEMsb0JBQW9CLEdBQUcsSUFBSSx3QkFBd0IsQ0FBQyxFQUFFLGlEQUFpRCxFQUFFLElBQUksRUFBRSxDQUFDLENBQUM7UUFDakgsWUFBWSxHQUFHLElBQUksZ0JBQWdCLENBQUMsSUFBSSx3QkFBd0IsRUFBRSxDQUFDLENBQUM7UUFDcEUsa0JBQWtCLEdBQUcsRUFBeUIsQ0FBQztRQUUvQyxvQkFBb0IsQ0FBQyxHQUFHLENBQUMsbUJBQW1CLEVBQUUsa0JBQWtCLENBQUMsQ0FBQztRQUNsRSxvQkFBb0IsQ0FBQyxHQUFHLENBQUMscUJBQXFCLEVBQUUsb0JBQW9CLENBQUMsQ0FBQztRQUN0RSxvQkFBb0IsQ0FBQyxHQUFHLENBQUMsV0FBVyxFQUFFLFVBQVUsQ0FBQyxDQUFDO1FBQ2xELG9CQUFvQixDQUFDLEdBQUcsQ0FBQyxpQkFBaUIsRUFBRSxnQkFBZ0IsQ0FBQyxDQUFDO1FBQzlELGVBQWUsR0FBRyxXQUFXLENBQUMsR0FBRyxDQUFDLG9CQUFvQixDQUFDLGNBQWMsQ0FBQyxlQUFlLENBQUMsQ0FBQyxDQUFDO1FBQ3hGLG9CQUFvQixDQUFDLEdBQUcsQ0FBQyxnQkFBZ0IsRUFBRSxlQUFlLENBQUMsQ0FBQztRQUM1RCxvQkFBb0IsQ0FBQyxHQUFHLENBQUMsYUFBYSxFQUFFLFlBQVksQ0FBQyxDQUFDO1FBQ3RELDZCQUE2QixHQUFHLG9CQUFvQixDQUFDLGNBQWMsQ0FBQyxpQ0FBaUMsQ0FBQyxDQUFDO1FBQ3ZHLG9CQUFvQixDQUFDLEdBQUcsQ0FBQyw4QkFBOEIsRUFBRSw2QkFBNkIsQ0FBQyxDQUFDO1FBQ3hGLDRCQUE0QixHQUFHLFdBQVcsQ0FBQyxHQUFHLENBQUMsb0JBQW9CLENBQUMsY0FBYyxDQUFDLGdDQUFnQyxDQUFDLENBQUMsQ0FBQztRQUN0SCxvQkFBb0IsQ0FBQyxHQUFHLENBQUMsNkJBQTZCLEVBQUUsNEJBQTRCLENBQUMsQ0FBQztRQUV0RixXQUFXLEdBQUcsV0FBVyxDQUFDLEdBQUcsQ0FBQyxvQkFBb0IsQ0FBQyxjQUFjLENBQUMsV0FBVyxDQUFDLENBQUMsQ0FBQztRQUNoRixNQUFNLGtCQUFrQixHQUFHLElBQUkseUJBQXlCLEVBQUUsQ0FBQztRQUMzRCxXQUFXLENBQUMsR0FBRyxDQUFDLFdBQVcsQ0FBQyxnQkFBZ0IsQ0FBQyxPQUFPLENBQUMsSUFBSSxFQUFFLGtCQUFrQixDQUFDLENBQUMsQ0FBQztRQUNoRixvQkFBb0IsQ0FBQyxHQUFHLENBQUMsWUFBWSxFQUFFLFdBQVcsQ0FBQyxDQUFDO1FBRXBELE1BQU0sY0FBYyxHQUFHLFdBQVcsQ0FBQyxHQUFHLENBQUMsb0JBQW9CLENBQUMsY0FBYyxDQUFDLHdCQUF3QixDQUFDLENBQUMsQ0FBQztRQUN0RyxjQUFjLENBQUMsTUFBTSxHQUFHLElBQUksQ0FBQztRQUM3QixvQkFBb0IsQ0FBQyxHQUFHLENBQUMseUJBQXlCLEVBQUUsY0FBYyxDQUFDLENBQUM7UUFFcEUsb0JBQW9CLENBQUMsR0FBRyxDQUFDLHVCQUF1QixFQUFFLG9CQUFvQixDQUFDLGNBQWMsQ0FBQyxzQkFBc0IsQ0FBQyxDQUFDLENBQUM7UUFFL0csTUFBTSxhQUFhLEdBQUcsSUFBSSxpQkFBaUIsRUFBRSxDQUFDO1FBQzlDLE1BQU0sbUJBQW1CLEdBQUcsSUFBSSx1QkFBdUIsRUFBRSxDQUFDO1FBQzFELE1BQU0sZUFBZSxHQUFHLElBQUksZUFBZSxDQUFDLGFBQWEsRUFBRSxtQkFBbUIsQ0FBQyxDQUFDO1FBQ2hGLG9CQUFvQixDQUFDLEdBQUcsQ0FBQyxnQkFBZ0IsRUFBRSxlQUFlLENBQUMsQ0FBQztRQUM1RCxZQUFZLEdBQUcsSUFBSSxZQUFZLENBQzlCLG9CQUFvQixFQUNwQiw2QkFBNkIsRUFDN0IsZUFBZSxFQUNmLG9CQUFvQixDQUNwQixDQUFDO1FBQ0Ysb0JBQW9CLENBQUMsR0FBRyxDQUFDLGFBQWEsRUFBRSxZQUFZLENBQUMsQ0FBQztJQUN2RCxDQUFDLENBQUMsQ0FBQztJQUVILFFBQVEsQ0FBQyxHQUFHLEVBQUU7UUFDYixXQUFXLENBQUMsT0FBTyxFQUFFLENBQUM7SUFDdkIsQ0FBQyxDQUFDLENBQUM7SUFFSCx1Q0FBdUMsRUFBRSxDQUFDO0lBRTFDLFNBQVMsaUJBQWlCLENBQUMsTUFBcUI7UUFDL0MsT0FBTyxNQUFNLENBQUMsTUFBTSxDQUFDLE1BQU0sR0FBRyxDQUFDLENBQUMsQ0FBQyxvQkFBb0IsR0FBRyxNQUFNLENBQUMsTUFBTSxDQUFDLE1BQU0sR0FBRyxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUM7SUFDMUYsQ0FBQztJQUVELElBQUksVUFBVSxHQUFHLENBQUMsQ0FBQztJQUNuQixLQUFLLFVBQVUsbUJBQW1CLENBQUMsT0FBZTtRQUNqRCxNQUFNLEtBQUssR0FBRyxXQUFXLENBQUMsR0FBRyxDQUFDLFlBQVksQ0FBQyxXQUFXLENBQUMsT0FBTyxFQUFFLEVBQUUsVUFBVSxFQUFFLFlBQVksRUFBRSxXQUFXLEVBQUUsS0FBSyxDQUFDLElBQUksRUFBRSxFQUFFLEdBQUcsQ0FBQyxJQUFJLENBQUMsT0FBTyxVQUFVLEVBQUUsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQzVKLE1BQU0saUJBQWlCLEdBQUcsV0FBVyxDQUFDLEdBQUcsQ0FBRSxLQUFLLENBQUMsWUFBMEMsQ0FBQyxNQUFNLENBQUMsR0FBRyxFQUFrQyxDQUFDLENBQUMsSUFBSSxDQUFDO1FBQy9JLE1BQU0sbUJBQW1CLEdBQUcsV0FBVyxDQUFDLEdBQUcsQ0FBRSxLQUFLLENBQUMsWUFBMEMsQ0FBQyxNQUFNLENBQUMsR0FBRyxFQUFrQyxDQUFDLENBQUMsZ0JBQWdCLENBQUM7UUFDN0osTUFBTSxjQUFjLEdBQUcsaUJBQWlCLENBQUMsR0FBRyxFQUFFLElBQUksTUFBTSxZQUFZLENBQUMsaUJBQWlCLENBQUMsQ0FBQztRQUN4RixJQUFJLENBQUMsY0FBYyxDQUFDLElBQUksQ0FBQyxHQUFHLEVBQUUsRUFBRSxDQUFDO1lBQ2hDLE1BQU0sWUFBWSxDQUFDLGNBQWMsQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUN6QyxDQUFDO1FBQ0QsTUFBTSxnQkFBZ0IsR0FBRyxtQkFBbUIsQ0FBQyxHQUFHLEVBQUUsSUFBSSxNQUFNLFlBQVksQ0FBQyxtQkFBbUIsQ0FBQyxDQUFDO1FBRTlGLE1BQU0sQ0FBQyxFQUFFLENBQUMsY0FBYyxDQUFDLENBQUM7UUFDMUIsT0FBTyxFQUFFLEtBQUssRUFBRSxjQUFjLEVBQUUsZ0JBQWdCLEVBQUUsQ0FBQztJQUNwRCxDQUFDO0lBRUQsU0FBUyxZQUFZLENBQUMsTUFBaUM7UUFDdEQsTUFBTSxDQUFDLEVBQUUsQ0FBQyxNQUFNLENBQUMsQ0FBQztRQUNsQixLQUFLLElBQUksQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLEdBQUcsTUFBTSxDQUFDLE1BQU0sRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDO1lBQ3hDLE1BQU0sYUFBYSxHQUFnQixNQUFNLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDO1lBQ2pELE1BQU0sS0FBSyxHQUFnQixNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDckMsTUFBTSxDQUFDLGVBQWUsQ0FBQyxhQUFhLENBQUMsb0JBQW9CLEdBQUcsYUFBYSxDQUFDLE1BQU0sRUFBRSxLQUFLLENBQUMsb0JBQW9CLENBQUMsQ0FBQztRQUMvRyxDQUFDO0lBQ0YsQ0FBQztJQUVELElBQUksQ0FBQyxrQ0FBa0MsRUFBRSxLQUFLLElBQUksRUFBRTtRQUNuRCxNQUFNLE9BQU8sR0FBRzs7Ozs7Ozs7O0VBU2hCLENBQUM7UUFDRCxNQUFNLEVBQUUsS0FBSyxFQUFFLGNBQWMsRUFBRSxHQUFHLE1BQU0sbUJBQW1CLENBQUMsT0FBTyxDQUFDLENBQUM7UUFFckUsSUFBSSxjQUF1QyxDQUFDO1FBQzVDLE1BQU0sYUFBYSxHQUFHLElBQUksT0FBTyxDQUFtQyxPQUFPLENBQUMsRUFBRTtZQUM3RSxjQUFjLEdBQUcsb0JBQW9CLENBQUM7Z0JBQ3JDLEtBQUssRUFBRSxJQUFJO2dCQUNYLGFBQWEsRUFBRSxhQUFhLENBQUMsRUFBRSxJQUFJLEVBQUUsY0FBYyxDQUFDLElBQUksRUFBRSxDQUFDO2FBQzNELEVBQUUsQ0FBQyxNQUFNLEVBQUUsR0FBRyxFQUFFLEVBQUU7Z0JBQ2xCLE1BQU0sV0FBVyxHQUFHLEdBQUcsQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxFQUFFLE1BQU0sQ0FBQztnQkFDOUMsSUFBSSxXQUFXLEVBQUUsQ0FBQztvQkFDakIsT0FBTyxDQUFDLFdBQVcsQ0FBQyxDQUFDO2dCQUN0QixDQUFDO1lBQ0YsQ0FBQyxDQUFDLENBQUM7UUFDSixDQUFDLENBQUMsQ0FBQztRQUVILE1BQU0sS0FBSyxHQUFHLElBQUksT0FBTyxDQUFPLE9BQU8sQ0FBQyxFQUFFO1lBQ3pDLEtBQUssQ0FBQyxVQUFVLENBQUMsQ0FBQyxFQUFFLEtBQUssRUFBRSxJQUFJLEtBQUssQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsRUFBRSxJQUFJLEVBQUUsRUFBRSxFQUFFLENBQUMsQ0FBQyxDQUFDO1lBQy9ELE9BQU8sRUFBRSxDQUFDO1FBQ1gsQ0FBQyxDQUFDLENBQUM7UUFDSCxNQUFNLEtBQUssR0FBRyxJQUFJLE9BQU8sQ0FBTyxPQUFPLENBQUMsRUFBRTtZQUN6QyxLQUFLLENBQUMsVUFBVSxDQUFDLENBQUMsRUFBRSxLQUFLLEVBQUUsSUFBSSxLQUFLLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQUUsSUFBSSxFQUFFLEVBQUUsRUFBRSxDQUFDLENBQUMsQ0FBQztZQUMvRCxPQUFPLEVBQUUsQ0FBQztRQUNYLENBQUMsQ0FBQyxDQUFDO1FBQ0gsTUFBTSxLQUFLLEdBQUcsSUFBSSxPQUFPLENBQU8sT0FBTyxDQUFDLEVBQUU7WUFDekMsS0FBSyxDQUFDLFVBQVUsQ0FBQyxDQUFDLEVBQUUsS0FBSyxFQUFFLElBQUksS0FBSyxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLElBQUksRUFBRSxFQUFFLEVBQUUsQ0FBQyxDQUFDLENBQUM7WUFDL0QsT0FBTyxFQUFFLENBQUM7UUFDWCxDQUFDLENBQUMsQ0FBQztRQUNILE1BQU0sS0FBSyxHQUFHLE9BQU8sQ0FBQyxHQUFHLENBQUMsQ0FBQyxLQUFLLEVBQUUsS0FBSyxFQUFFLEtBQUssQ0FBQyxDQUFDLENBQUM7UUFDakQsTUFBTSxNQUFNLEdBQUcsTUFBTSxhQUFhLENBQUM7UUFDbkMsTUFBTSxLQUFLLENBQUM7UUFDWixNQUFNLENBQUMsRUFBRSxDQUFDLE1BQU0sQ0FBQyxDQUFDO1FBRWxCLE1BQU0sQ0FBQyxXQUFXLENBQUMsTUFBTSxDQUFDLFNBQVMsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUN4QyxNQUFNLENBQUMsV0FBVyxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUMsbUJBQW1CLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDNUQsTUFBTSxDQUFDLFdBQVcsQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDLGlCQUFpQixFQUFFLEVBQUUsQ0FBQyxDQUFDO1FBQzNELE1BQU0sQ0FBQyxXQUFXLENBQUMsTUFBTSxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQyxRQUFRLENBQUMsZUFBZSxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQ2pFLE1BQU0sQ0FBQyxXQUFXLENBQUMsTUFBTSxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQyxRQUFRLENBQUMsYUFBYSxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBRS9ELGNBQWMsRUFBRSxPQUFPLEVBQUUsQ0FBQztRQUMxQixZQUFZLENBQUMsWUFBWSxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQztJQUN0QyxDQUFDLENBQUMsQ0FBQztJQUVILElBQUksQ0FBQyx1QkFBdUIsRUFBRSxLQUFLLElBQUksRUFBRTtRQUN4QyxNQUFNLE9BQU8sR0FBRyxtQkFBbUIsQ0FBQztRQUNwQyxNQUFNLEVBQUUsS0FBSyxFQUFFLGdCQUFnQixFQUFFLEdBQUcsTUFBTSxtQkFBbUIsQ0FBQyxPQUFPLENBQUMsQ0FBQztRQUN2RSxNQUFNLE1BQU0sR0FBRyxnQkFBZ0IsQ0FBQyxnQkFBZ0IsQ0FBQyxJQUFJLEtBQUssQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFDaEYsWUFBWSxDQUFDLE1BQU0sQ0FBQyxDQUFDO1FBQ3JCLE1BQU0sQ0FBQyxlQUFlLENBQUMsTUFBTSxFQUFFLE1BQU0sRUFBRSxDQUFDLENBQUMsQ0FBQztRQUMxQyxNQUFNLENBQUMsZUFBZSxDQUFDLGlCQUFpQixDQUFDLE1BQU0sQ0FBQyxFQUFFLE9BQU8sQ0FBQyxNQUFNLENBQUMsQ0FBQztRQUNsRSxZQUFZLENBQUMsWUFBWSxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQztJQUN0QyxDQUFDLENBQUMsQ0FBQztJQUVILElBQUksQ0FBQywwQ0FBMEMsRUFBRSxLQUFLLElBQUksRUFBRTtRQUMzRCxNQUFNLE9BQU8sR0FBRzs7Q0FFakIsQ0FBQztRQUNBLE1BQU0sRUFBRSxLQUFLLEVBQUUsZ0JBQWdCLEVBQUUsR0FBRyxNQUFNLG1CQUFtQixDQUFDLE9BQU8sQ0FBQyxDQUFDO1FBQ3ZFLE1BQU0sTUFBTSxHQUFHLGdCQUFnQixDQUFDLGdCQUFnQixDQUFDLElBQUksS0FBSyxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQztRQUMvRSxZQUFZLENBQUMsTUFBTSxDQUFDLENBQUM7UUFDckIsTUFBTSxDQUFDLGVBQWUsQ0FBQyxNQUFNLEVBQUUsTUFBTSxFQUFFLEVBQUUsQ0FBQyxDQUFDO1FBQzNDLE1BQU0sQ0FBQyxlQUFlLENBQUMsaUJBQWlCLENBQUMsTUFBTSxDQUFDLEVBQUUsT0FBTyxDQUFDLE1BQU0sQ0FBQyxDQUFDO1FBQ2xFLFlBQVksQ0FBQyxZQUFZLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxDQUFDO0lBQ3RDLENBQUMsQ0FBQyxDQUFDO0lBRUgsSUFBSSxDQUFDLGlEQUFpRCxFQUFFLEtBQUssSUFBSSxFQUFFO1FBQ2xFLE1BQU0sT0FBTyxHQUFHLDZCQUE2QixDQUFDO1FBQzlDLE1BQU0sRUFBRSxLQUFLLEVBQUUsZ0JBQWdCLEVBQUUsR0FBRyxNQUFNLG1CQUFtQixDQUFDLE9BQU8sQ0FBQyxDQUFDO1FBQ3ZFLE1BQU0sTUFBTSxHQUFHLGdCQUFnQixDQUFDLGdCQUFnQixDQUFDLElBQUksS0FBSyxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQztRQUMvRSxZQUFZLENBQUMsTUFBTSxDQUFDLENBQUM7UUFDckIsTUFBTSxDQUFDLGVBQWUsQ0FBQyxNQUFNLEVBQUUsTUFBTSxFQUFFLEVBQUUsQ0FBQyxDQUFDO1FBQzNDLE1BQU0sQ0FBQyxlQUFlLENBQUMsaUJBQWlCLENBQUMsTUFBTSxDQUFDLEVBQUUsT0FBTyxDQUFDLE1BQU0sQ0FBQyxDQUFDO1FBQ2xFLFlBQVksQ0FBQyxZQUFZLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxDQUFDO0lBQ3RDLENBQUMsQ0FBQyxDQUFDO0lBRUgsSUFBSSxDQUFDLHFDQUFxQyxFQUFFLEtBQUssSUFBSSxFQUFFO1FBQ3RELE1BQU0sT0FBTyxHQUFHOzs7O0NBSWpCLENBQUM7UUFDQSxNQUFNLEVBQUUsS0FBSyxFQUFFLGdCQUFnQixFQUFFLEdBQUcsTUFBTSxtQkFBbUIsQ0FBQyxPQUFPLENBQUMsQ0FBQztRQUN2RSxNQUFNLE1BQU0sR0FBRyxnQkFBZ0IsQ0FBQyxnQkFBZ0IsQ0FBQyxJQUFJLEtBQUssQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFDL0UsWUFBWSxDQUFDLE1BQU0sQ0FBQyxDQUFDO1FBQ3JCLE1BQU0sQ0FBQyxlQUFlLENBQUMsTUFBTSxFQUFFLE1BQU0sRUFBRSxFQUFFLENBQUMsQ0FBQztRQUMzQyxNQUFNLENBQUMsZUFBZSxDQUFDLGlCQUFpQixDQUFDLE1BQU0sQ0FBQyxFQUFFLE9BQU8sQ0FBQyxNQUFNLENBQUMsQ0FBQztRQUNsRSxZQUFZLENBQUMsWUFBWSxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQztJQUN0QyxDQUFDLENBQUMsQ0FBQztJQUVILElBQUksQ0FBQyw0Q0FBNEMsRUFBRSxLQUFLLElBQUksRUFBRTtRQUM3RCxNQUFNLE9BQU8sR0FBRyx3REFBd0QsQ0FBQztRQUN6RSxNQUFNLEVBQUUsS0FBSyxFQUFFLGdCQUFnQixFQUFFLEdBQUcsTUFBTSxtQkFBbUIsQ0FBQyxPQUFPLENBQUMsQ0FBQztRQUN2RSxNQUFNLE1BQU0sR0FBRyxnQkFBZ0IsQ0FBQyxnQkFBZ0IsQ0FBQyxJQUFJLEtBQUssQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFDL0UsWUFBWSxDQUFDLE1BQU0sQ0FBQyxDQUFDO1FBQ3JCLE1BQU0sQ0FBQyxlQUFlLENBQUMsTUFBTSxFQUFFLE1BQU0sRUFBRSxFQUFFLENBQUMsQ0FBQztRQUMzQyxNQUFNLENBQUMsZUFBZSxDQUFDLGlCQUFpQixDQUFDLE1BQU0sQ0FBQyxFQUFFLE9BQU8sQ0FBQyxNQUFNLENBQUMsQ0FBQztRQUNsRSxZQUFZLENBQUMsWUFBWSxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQztJQUN0QyxDQUFDLENBQUMsQ0FBQztJQUVILElBQUksQ0FBQyxnREFBZ0QsRUFBRSxLQUFLLElBQUksRUFBRTtRQUNqRSxNQUFNLE9BQU8sR0FBRzs7OztDQUlqQixDQUFDO1FBQ0EsTUFBTSxFQUFFLEtBQUssRUFBRSxnQkFBZ0IsRUFBRSxHQUFHLE1BQU0sbUJBQW1CLENBQUMsT0FBTyxDQUFDLENBQUM7UUFDdkUsTUFBTSxNQUFNLEdBQUcsZ0JBQWdCLENBQUMsZ0JBQWdCLENBQUMsSUFBSSxLQUFLLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDO1FBQy9FLFlBQVksQ0FBQyxNQUFNLENBQUMsQ0FBQztRQUNyQixNQUFNLENBQUMsZUFBZSxDQUFDLE1BQU0sRUFBRSxNQUFNLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFDM0MsTUFBTSxDQUFDLGVBQWUsQ0FBQyxpQkFBaUIsQ0FBQyxNQUFNLENBQUMsRUFBRSxPQUFPLENBQUMsTUFBTSxDQUFDLENBQUM7UUFDbEUsWUFBWSxDQUFDLFlBQVksQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUM7SUFDdEMsQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMsdURBQXVELEVBQUUsS0FBSyxJQUFJLEVBQUU7UUFDeEUsTUFBTSxPQUFPLEdBQUcsd0NBQXdDLENBQUM7UUFDekQsTUFBTSxFQUFFLEtBQUssRUFBRSxnQkFBZ0IsRUFBRSxHQUFHLE1BQU0sbUJBQW1CLENBQUMsT0FBTyxDQUFDLENBQUM7UUFDdkUsTUFBTSxNQUFNLEdBQUcsZ0JBQWdCLENBQUMsZ0JBQWdCLENBQUMsSUFBSSxLQUFLLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDO1FBQy9FLFlBQVksQ0FBQyxNQUFNLENBQUMsQ0FBQztRQUNyQixNQUFNLENBQUMsZUFBZSxDQUFDLE1BQU0sRUFBRSxNQUFNLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFDM0MsTUFBTSxDQUFDLGVBQWUsQ0FBQyxpQkFBaUIsQ0FBQyxNQUFNLENBQUMsRUFBRSxPQUFPLENBQUMsTUFBTSxDQUFDLENBQUM7UUFDbEUsWUFBWSxDQUFDLFlBQVksQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUM7SUFDdEMsQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMsdURBQXVELEVBQUUsS0FBSyxJQUFJLEVBQUU7UUFDeEUsTUFBTSxPQUFPLEdBQUc7Ozs7O0NBS2pCLENBQUM7UUFDQSxNQUFNLEVBQUUsS0FBSyxFQUFFLGdCQUFnQixFQUFFLEdBQUcsTUFBTSxtQkFBbUIsQ0FBQyxPQUFPLENBQUMsQ0FBQztRQUN2RSxNQUFNLE1BQU0sR0FBRyxnQkFBZ0IsQ0FBQyxnQkFBZ0IsQ0FBQyxJQUFJLEtBQUssQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFDL0UsWUFBWSxDQUFDLE1BQU0sQ0FBQyxDQUFDO1FBQ3JCLE1BQU0sQ0FBQyxlQUFlLENBQUMsTUFBTSxFQUFFLE1BQU0sRUFBRSxFQUFFLENBQUMsQ0FBQztRQUMzQyxNQUFNLENBQUMsZUFBZSxDQUFDLGlCQUFpQixDQUFDLE1BQU0sQ0FBQyxFQUFFLE9BQU8sQ0FBQyxNQUFNLENBQUMsQ0FBQztRQUNsRSxZQUFZLENBQUMsWUFBWSxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQztJQUN0QyxDQUFDLENBQUMsQ0FBQztJQUVILElBQUksQ0FBQyw4REFBOEQsRUFBRSxLQUFLLElBQUksRUFBRTtRQUMvRSxNQUFNLE9BQU8sR0FBRywrQ0FBK0MsQ0FBQztRQUNoRSxNQUFNLEVBQUUsS0FBSyxFQUFFLGdCQUFnQixFQUFFLEdBQUcsTUFBTSxtQkFBbUIsQ0FBQyxPQUFPLENBQUMsQ0FBQztRQUN2RSxNQUFNLE1BQU0sR0FBRyxnQkFBZ0IsQ0FBQyxnQkFBZ0IsQ0FBQyxJQUFJLEtBQUssQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFDL0UsWUFBWSxDQUFDLE1BQU0sQ0FBQyxDQUFDO1FBQ3JCLE1BQU0sQ0FBQyxlQUFlLENBQUMsTUFBTSxFQUFFLE1BQU0sRUFBRSxFQUFFLENBQUMsQ0FBQztRQUMzQyxNQUFNLENBQUMsZUFBZSxDQUFDLGlCQUFpQixDQUFDLE1BQU0sQ0FBQyxFQUFFLE9BQU8sQ0FBQyxNQUFNLENBQUMsQ0FBQztRQUNsRSxZQUFZLENBQUMsWUFBWSxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQztJQUN0QyxDQUFDLENBQUMsQ0FBQztJQUVILElBQUksQ0FBQyxnQkFBZ0IsRUFBRSxLQUFLLElBQUksRUFBRTtRQUNqQyxNQUFNLE9BQU8sR0FBRzs7Ozs7O0VBTWhCLENBQUM7UUFDRCxNQUFNLEVBQUUsS0FBSyxFQUFFLGdCQUFnQixFQUFFLEdBQUcsTUFBTSxtQkFBbUIsQ0FBQyxPQUFPLENBQUMsQ0FBQztRQUN2RSxNQUFNLE1BQU0sR0FBRyxnQkFBZ0IsQ0FBQyxnQkFBZ0IsQ0FBQyxJQUFJLEtBQUssQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFDL0UsWUFBWSxDQUFDLE1BQU0sQ0FBQyxDQUFDO1FBQ3JCLE1BQU0sQ0FBQyxlQUFlLENBQUMsTUFBTSxFQUFFLE1BQU0sRUFBRSxFQUFFLENBQUMsQ0FBQztRQUMzQyxNQUFNLENBQUMsZUFBZSxDQUFDLGlCQUFpQixDQUFDLE1BQU0sQ0FBQyxFQUFFLE9BQU8sQ0FBQyxNQUFNLENBQUMsQ0FBQztRQUNsRSxZQUFZLENBQUMsWUFBWSxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQztJQUN0QyxDQUFDLENBQUMsQ0FBQztJQUVILElBQUksQ0FBQyx1QkFBdUIsRUFBRSxLQUFLLElBQUksRUFBRTtRQUN4QyxNQUFNLE9BQU8sR0FBRyxxRkFBcUYsQ0FBQztRQUN0RyxNQUFNLEVBQUUsS0FBSyxFQUFFLGdCQUFnQixFQUFFLEdBQUcsTUFBTSxtQkFBbUIsQ0FBQyxPQUFPLENBQUMsQ0FBQztRQUN2RSxNQUFNLE1BQU0sR0FBRyxnQkFBZ0IsQ0FBQyxnQkFBZ0IsQ0FBQyxJQUFJLEtBQUssQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFDL0UsWUFBWSxDQUFDLE1BQU0sQ0FBQyxDQUFDO1FBQ3JCLE1BQU0sQ0FBQyxlQUFlLENBQUMsTUFBTSxFQUFFLE1BQU0sRUFBRSxFQUFFLENBQUMsQ0FBQztRQUMzQyxNQUFNLENBQUMsZUFBZSxDQUFDLGlCQUFpQixDQUFDLE1BQU0sQ0FBQyxFQUFFLE9BQU8sQ0FBQyxNQUFNLENBQUMsQ0FBQztRQUNsRSxZQUFZLENBQUMsWUFBWSxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQztJQUN0QyxDQUFDLENBQUMsQ0FBQztJQUVILElBQUksQ0FBQyxpQkFBaUIsRUFBRSxLQUFLLElBQUksRUFBRTtRQUNsQyxNQUFNLE9BQU8sR0FBRyxVQUFVLENBQUM7UUFDM0IsTUFBTSxFQUFFLEtBQUssRUFBRSxnQkFBZ0IsRUFBRSxHQUFHLE1BQU0sbUJBQW1CLENBQUMsT0FBTyxDQUFDLENBQUM7UUFDdkUsTUFBTSxNQUFNLEdBQUcsZ0JBQWdCLENBQUMsZ0JBQWdCLENBQUMsSUFBSSxLQUFLLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQzlFLFlBQVksQ0FBQyxNQUFNLENBQUMsQ0FBQztRQUNyQixNQUFNLENBQUMsZUFBZSxDQUFDLE1BQU0sRUFBRSxNQUFNLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDMUMsTUFBTSxDQUFDLGVBQWUsQ0FBQyxpQkFBaUIsQ0FBQyxNQUFNLENBQUMsRUFBRSxPQUFPLENBQUMsTUFBTSxDQUFDLENBQUM7UUFDbEUsWUFBWSxDQUFDLFlBQVksQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUM7SUFDdEMsQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMsb0JBQW9CLEVBQUUsS0FBSyxJQUFJLEVBQUU7UUFDckMsTUFBTSxPQUFPLEdBQUc7Ozs7O0tBS2IsQ0FBQztRQUNKLE1BQU0sRUFBRSxLQUFLLEVBQUUsZ0JBQWdCLEVBQUUsR0FBRyxNQUFNLG1CQUFtQixDQUFDLE9BQU8sQ0FBQyxDQUFDO1FBQ3ZFLE1BQU0sTUFBTSxHQUFHLGdCQUFnQixDQUFDLGdCQUFnQixDQUFDLElBQUksS0FBSyxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxHQUFHLENBQUMsQ0FBQztRQUNoRixZQUFZLENBQUMsTUFBTSxDQUFDLENBQUM7UUFDckIsTUFBTSxDQUFDLGVBQWUsQ0FBQyxNQUFNLEVBQUUsTUFBTSxFQUFFLEVBQUUsQ0FBQyxDQUFDO1FBQzNDLE1BQU0sQ0FBQyxlQUFlLENBQUMsaUJBQWlCLENBQUMsTUFBTSxDQUFDLEVBQUUsT0FBTyxDQUFDLE1BQU0sQ0FBQyxDQUFDO1FBQ2xFLFlBQVksQ0FBQyxZQUFZLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxDQUFDO0lBQ3RDLENBQUMsQ0FBQyxDQUFDO0FBRUosQ0FBQyxDQUFDLENBQUMifQ==