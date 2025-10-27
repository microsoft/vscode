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
import { ITelemetryData, ITelemetryService, TelemetryLevel } from '../../../platform/telemetry/common/telemetry.js';
import { ClassifiedEvent, OmitMetadata, IGDPRProperty, StrictPropertyCheck } from '../../../platform/telemetry/common/gdprTypings.js';
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
import { DisposableStore, IDisposable } from '../../../base/common/lifecycle.js';
import { ProbeScope, TokenStyle } from '../../../platform/theme/common/tokenClassificationRegistry.js';
import { TextMateThemingRuleDefinitions } from '../../services/themes/common/colorThemeData.js';
import { Color } from '../../../base/common/color.js';
import { Range } from '../../../editor/common/core/range.js';
import { TokenUpdate } from '../../../editor/common/model/tokens/treeSitter/tokenStore.js';
import { ITreeSitterLibraryService } from '../../../editor/common/services/treeSitter/treeSitterLibraryService.js';
import { TreeSitterLibraryService } from '../../services/treeSitter/browser/treeSitterLibraryService.js';
import { TokenizationTextModelPart } from '../../../editor/common/model/tokens/tokenizationTextModelPart.js';
import { TreeSitterSyntaxTokenBackend } from '../../../editor/common/model/tokens/treeSitter/treeSitterSyntaxTokenBackend.js';
import { TreeParseUpdateEvent, TreeSitterTree } from '../../../editor/common/model/tokens/treeSitter/treeSitterTree.js';
import { ITextModel } from '../../../editor/common/model.js';
import { TreeSitterTokenizationImpl } from '../../../editor/common/model/tokens/treeSitter/treeSitterTokenizationImpl.js';
import { autorunHandleChanges, recordChanges, waitForState } from '../../../base/common/observable.js';
import { ITreeSitterThemeService } from '../../../editor/common/services/treeSitter/treeSitterThemeService.js';
import { TreeSitterThemeService } from '../../services/treeSitter/browser/treeSitterThemeService.js';

class MockTelemetryService implements ITelemetryService {
	_serviceBrand: undefined;
	telemetryLevel: TelemetryLevel = TelemetryLevel.NONE;
	sessionId: string = '';
	machineId: string = '';
	sqmId: string = '';
	devDeviceId: string = '';
	firstSessionDate: string = '';
	sendErrorTelemetry: boolean = false;
	publicLog(eventName: string, data?: ITelemetryData): void {
	}
	publicLog2<E extends ClassifiedEvent<OmitMetadata<T>> = never, T extends IGDPRProperty = never>(eventName: string, data?: StrictPropertyCheck<T, E>): void {
	}
	publicLogError(errorEventName: string, data?: ITelemetryData): void {
	}
	publicLogError2<E extends ClassifiedEvent<OmitMetadata<T>> = never, T extends IGDPRProperty = never>(eventName: string, data?: StrictPropertyCheck<T, E>): void {
	}
	setExperimentProperty(name: string, value: string): void {
	}
}


class TestTreeSitterColorTheme extends TestColorTheme {
	public resolveScopes(scopes: ProbeScope[], definitions?: TextMateThemingRuleDefinitions): TokenStyle | undefined {
		return new TokenStyle(Color.red, undefined, undefined, undefined, undefined);
	}
	public getTokenColorIndex(): { get: () => number } {
		return { get: () => 10 };
	}
}

suite('Tree Sitter TokenizationFeature', function () {

	let instantiationService: TestInstantiationService;
	let modelService: IModelService;
	let fileService: IFileService;
	let textResourcePropertiesService: ITextResourcePropertiesService;
	let languageConfigurationService: ILanguageConfigurationService;
	let telemetryService: ITelemetryService;
	let logService: ILogService;
	let configurationService: IConfigurationService;
	let themeService: IThemeService;
	let languageService: ILanguageService;
	let environmentService: IEnvironmentService;

	let disposables: DisposableStore;

	setup(async () => {
		disposables = new DisposableStore();
		instantiationService = disposables.add(new TestInstantiationService());

		telemetryService = new MockTelemetryService();
		logService = new NullLogService();
		configurationService = new TestConfigurationService({ 'editor.experimental.preferTreeSitter.typescript': true });
		themeService = new TestThemeService(new TestTreeSitterColorTheme());
		environmentService = {} as IEnvironmentService;

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
		modelService = new ModelService(
			configurationService,
			textResourcePropertiesService,
			undoRedoService,
			instantiationService
		);
		instantiationService.set(IModelService, modelService);
	});

	teardown(() => {
		disposables.dispose();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	function tokensContentSize(tokens: TokenUpdate[]) {
		return tokens[tokens.length - 1].startOffsetInclusive + tokens[tokens.length - 1].length;
	}

	let nameNumber = 1;
	async function getModelAndPrepTree(content: string): Promise<{ model: ITextModel; treeSitterTree: TreeSitterTree; tokenizationImpl: TreeSitterTokenizationImpl }> {
		const model = disposables.add(modelService.createModel(content, { languageId: 'typescript', onDidChange: Event.None }, URI.file(`file${nameNumber++}.ts`)));
		const treeSitterTreeObs = disposables.add((model.tokenization as TokenizationTextModelPart).tokens.get() as TreeSitterSyntaxTokenBackend).tree;
		const tokenizationImplObs = disposables.add((model.tokenization as TokenizationTextModelPart).tokens.get() as TreeSitterSyntaxTokenBackend).tokenizationImpl;
		const treeSitterTree = treeSitterTreeObs.get() ?? await waitForState(treeSitterTreeObs);
		if (!treeSitterTree.tree.get()) {
			await waitForState(treeSitterTree.tree);
		}
		const tokenizationImpl = tokenizationImplObs.get() ?? await waitForState(tokenizationImplObs);

		assert.ok(treeSitterTree);
		return { model, treeSitterTree, tokenizationImpl };
	}

	function verifyTokens(tokens: TokenUpdate[] | undefined) {
		assert.ok(tokens);
		for (let i = 1; i < tokens.length; i++) {
			const previousToken: TokenUpdate = tokens[i - 1];
			const token: TokenUpdate = tokens[i];
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

		let updateListener: IDisposable | undefined;
		const changePromise = new Promise<TreeParseUpdateEvent | undefined>(resolve => {
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

		const edit1 = new Promise<void>(resolve => {
			model.applyEdits([{ range: new Range(7, 1, 8, 1), text: '' }]);
			resolve();
		});
		const edit2 = new Promise<void>(resolve => {
			model.applyEdits([{ range: new Range(6, 1, 7, 1), text: '' }]);
			resolve();
		});
		const edit3 = new Promise<void>(resolve => {
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
