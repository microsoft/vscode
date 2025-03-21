/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { TestInstantiationService } from '../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../base/test/common/utils.js';
import { TreeSitterTextModelService } from '../../../editor/common/services/treeSitter/treeSitterParserService.js';
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
// eslint-disable-next-line local/code-layering, local/code-import-patterns
import { TreeSitterTokenizationFeature } from '../../services/treeSitter/browser/treeSitterTokenizationFeature.js';
import { ITreeSitterImporter, ITreeSitterParserService, TreeSitterImporter, TreeUpdateEvent } from '../../../editor/common/services/treeSitterParserService.js';
import { ITreeSitterTokenizationSupport, TreeSitterTokenizationRegistry } from '../../../editor/common/languages.js';
import { FileService } from '../../../platform/files/common/fileService.js';
import { Schemas } from '../../../base/common/network.js';
import { DiskFileSystemProvider } from '../../../platform/files/node/diskFileSystemProvider.js';
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
import { ITreeSitterTokenizationStoreService } from '../../../editor/common/model/treeSitterTokenStoreService.js';
import { Range } from '../../../editor/common/core/range.js';
import { ITextModel } from '../../../editor/common/model.js';
import { TokenQuality, TokenUpdate } from '../../../editor/common/model/tokenStore.js';
// eslint-disable-next-line local/code-layering, local/code-import-patterns
import { ICodeEditorService } from '../../../editor/browser/services/codeEditorService.js';
// eslint-disable-next-line local/code-layering, local/code-import-patterns
import { TestCodeEditorService } from '../../../editor/test/browser/editorTestServices.js';
import { IModelContentChangedEvent } from '../../../editor/common/textModelEvents.js';

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

class MockTokenStoreService implements ITreeSitterTokenizationStoreService {
	delete(model: ITextModel): void {
		throw new Error('Method not implemented.');
	}
	handleContentChanged(model: ITextModel, e: IModelContentChangedEvent): void {
	}
	rangeHasTokens(model: ITextModel, range: Range, minimumTokenQuality: TokenQuality): boolean {
		return true;
	}
	rangHasAnyTokens(model: ITextModel): boolean {
		return true;
	}
	getNeedsRefresh(model: ITextModel): { range: Range; startOffset: number; endOffset: number }[] {
		return [];
	}

	_serviceBrand: undefined;
	setTokens(model: ITextModel, tokens: TokenUpdate[]): void {
	}
	getTokens(model: ITextModel, line: number): Uint32Array | undefined {
		return undefined;
	}
	updateTokens(model: ITextModel, version: number, updates: { oldRangeLength: number; newTokens: TokenUpdate[] }[]): void {
	}
	markForRefresh(model: ITextModel, range: Range): void {
	}
	hasTokens(model: ITextModel, accurateForRange?: Range): boolean {
		return true;
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
	let tokenStoreService: ITreeSitterTokenizationStoreService;
	let treeSitterParserService: TreeSitterTextModelService;
	let treeSitterTokenizationSupport: ITreeSitterTokenizationSupport;

	let disposables: DisposableStore;

	setup(async () => {
		disposables = new DisposableStore();
		instantiationService = disposables.add(new TestInstantiationService());

		telemetryService = new MockTelemetryService();
		logService = new NullLogService();
		configurationService = new TestConfigurationService({ 'editor.experimental.preferTreeSitter.typescript': true });
		themeService = new TestThemeService(new TestTreeSitterColorTheme());
		environmentService = {} as IEnvironmentService;
		tokenStoreService = new MockTokenStoreService();

		instantiationService.set(IEnvironmentService, environmentService);
		instantiationService.set(IConfigurationService, configurationService);
		instantiationService.set(ILogService, logService);
		instantiationService.set(ITelemetryService, telemetryService);
		instantiationService.set(ITreeSitterTokenizationStoreService, tokenStoreService);
		languageService = disposables.add(instantiationService.createInstance(LanguageService));
		instantiationService.set(ILanguageService, languageService);
		instantiationService.set(IThemeService, themeService);
		textResourcePropertiesService = instantiationService.createInstance(TestTextResourcePropertiesService);
		instantiationService.set(ITextResourcePropertiesService, textResourcePropertiesService);
		languageConfigurationService = disposables.add(instantiationService.createInstance(TestLanguageConfigurationService));
		instantiationService.set(ILanguageConfigurationService, languageConfigurationService);
		instantiationService.set(ITreeSitterImporter, instantiationService.createInstance(TreeSitterImporter));
		instantiationService.set(ICodeEditorService, instantiationService.createInstance(TestCodeEditorService));

		fileService = disposables.add(instantiationService.createInstance(FileService));
		const diskFileSystemProvider = disposables.add(new DiskFileSystemProvider(logService));
		disposables.add(fileService.registerProvider(Schemas.file, diskFileSystemProvider));

		instantiationService.set(IFileService, fileService);

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
		treeSitterParserService = disposables.add(instantiationService.createInstance(TreeSitterTextModelService));
		treeSitterParserService.isTest = true;
		instantiationService.set(ITreeSitterParserService, treeSitterParserService);
		disposables.add(instantiationService.createInstance(TreeSitterTokenizationFeature));
		treeSitterTokenizationSupport = disposables.add(await TreeSitterTokenizationRegistry.getOrCreate('typescript') as (ITreeSitterTokenizationSupport & IDisposable));
	});

	teardown(() => {
		disposables.dispose();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	function tokensContentSize(tokens: TokenUpdate[]) {
		return tokens[tokens.length - 1].startOffsetInclusive + tokens[tokens.length - 1].length;
	}

	let nameNumber = 1;
	async function getModelAndPrepTree(content: string) {
		const model = disposables.add(modelService.createModel(content, { languageId: 'typescript', onDidChange: Event.None }, URI.file(`file${nameNumber++}.ts`)));
		const tree = disposables.add(await treeSitterParserService.getTextModelTreeSitter(model));
		const treeParseResult = new Promise<void>(resolve => {
			const disposable = treeSitterParserService.onDidUpdateTree(e => {
				if (e.textModel === model) {
					disposable.dispose();
					resolve();
				}
			});
		});
		await tree.parse();
		await treeParseResult;

		assert.ok(tree);
		return model;
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
		const model = await getModelAndPrepTree(content);

		let updateListener: IDisposable | undefined;
		let change: TreeUpdateEvent | undefined;

		const updatePromise = new Promise<void>(resolve => {
			updateListener = treeSitterParserService.onDidUpdateTree(async e => {
				if (e.textModel === model) {
					change = e;
					resolve();
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
		await updatePromise;
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
		const model = await getModelAndPrepTree(content);
		const tokens = treeSitterTokenizationSupport.getTokensInRange(model, new Range(1, 1, 1, 18), 0, 17);
		verifyTokens(tokens);
		assert.deepStrictEqual(tokens?.length, 9);
		assert.deepStrictEqual(tokensContentSize(tokens), content.length);
		modelService.destroyModel(model.uri);
	});

	test('File with new lines at beginning and end', async () => {
		const content = `
console.log('x');
`;
		const model = await getModelAndPrepTree(content);
		const tokens = treeSitterTokenizationSupport.getTokensInRange(model, new Range(1, 1, 3, 1), 0, 19);
		verifyTokens(tokens);
		assert.deepStrictEqual(tokens?.length, 11);
		assert.deepStrictEqual(tokensContentSize(tokens), content.length);
		modelService.destroyModel(model.uri);
	});

	test('File with new lines at beginning and end \\r\\n', async () => {
		const content = '\r\nconsole.log(\'x\');\r\n';
		const model = await getModelAndPrepTree(content);
		const tokens = treeSitterTokenizationSupport.getTokensInRange(model, new Range(1, 1, 3, 1), 0, 21);
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
		const model = await getModelAndPrepTree(content);
		const tokens = treeSitterTokenizationSupport.getTokensInRange(model, new Range(1, 1, 5, 1), 0, 38);
		verifyTokens(tokens);
		assert.deepStrictEqual(tokens?.length, 21);
		assert.deepStrictEqual(tokensContentSize(tokens), content.length);
		modelService.destroyModel(model.uri);
	});

	test('File with empty lines in the middle \\r\\n', async () => {
		const content = '\r\nconsole.log(\'x\');\r\n\r\nconsole.log(\'7\');\r\n';
		const model = await getModelAndPrepTree(content);
		const tokens = treeSitterTokenizationSupport.getTokensInRange(model, new Range(1, 1, 5, 1), 0, 42);
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
		const model = await getModelAndPrepTree(content);
		const tokens = treeSitterTokenizationSupport.getTokensInRange(model, new Range(1, 1, 5, 1), 0, 24);
		verifyTokens(tokens);
		assert.deepStrictEqual(tokens?.length, 16);
		assert.deepStrictEqual(tokensContentSize(tokens), content.length);
		modelService.destroyModel(model.uri);
	});

	test('File with non-empty lines that match no scopes \\r\\n', async () => {
		const content = 'console.log(\'x\');\r\n;\r\n{\r\n}\r\n';
		const model = await getModelAndPrepTree(content);
		const tokens = treeSitterTokenizationSupport.getTokensInRange(model, new Range(1, 1, 5, 1), 0, 28);
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
		const model = await getModelAndPrepTree(content);
		const tokens = treeSitterTokenizationSupport.getTokensInRange(model, new Range(1, 1, 6, 1), 0, 28);
		verifyTokens(tokens);
		assert.deepStrictEqual(tokens?.length, 12);
		assert.deepStrictEqual(tokensContentSize(tokens), content.length);
		modelService.destroyModel(model.uri);
	});

	test('File with tree-sitter token that spans multiple lines \\r\\n', async () => {
		const content = '/**\r\n**/\r\n\r\nconsole.log(\'x\');\r\n\r\n';
		const model = await getModelAndPrepTree(content);
		const tokens = treeSitterTokenizationSupport.getTokensInRange(model, new Range(1, 1, 6, 1), 0, 33);
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
		const model = await getModelAndPrepTree(content);
		const tokens = treeSitterTokenizationSupport.getTokensInRange(model, new Range(1, 1, 7, 1), 0, 63);
		verifyTokens(tokens);
		assert.deepStrictEqual(tokens?.length, 30);
		assert.deepStrictEqual(tokensContentSize(tokens), content.length);
		modelService.destroyModel(model.uri);
	});

	test('File with tabs \\r\\n', async () => {
		const content = 'function x() {\r\n\treturn true;\r\n}\r\n\r\nclass Y {\r\n\tprivate z = false;\r\n}';
		const model = await getModelAndPrepTree(content);
		const tokens = treeSitterTokenizationSupport.getTokensInRange(model, new Range(1, 1, 7, 1), 0, 69);
		verifyTokens(tokens);
		assert.deepStrictEqual(tokens?.length, 30);
		assert.deepStrictEqual(tokensContentSize(tokens), content.length);
		modelService.destroyModel(model.uri);
	});

	test('Template string', async () => {
		const content = '`t ${6}`';
		const model = await getModelAndPrepTree(content);
		const tokens = treeSitterTokenizationSupport.getTokensInRange(model, new Range(1, 1, 1, 8), 0, 8);
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
		const model = await getModelAndPrepTree(content);
		const tokens = treeSitterTokenizationSupport.getTokensInRange(model, new Range(1, 1, 6, 5), 0, 238);
		verifyTokens(tokens);
		assert.deepStrictEqual(tokens?.length, 65);
		assert.deepStrictEqual(tokensContentSize(tokens), content.length);
		modelService.destroyModel(model.uri);
	});

});
