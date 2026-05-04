/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../../base/common/uri.js';
import { Range } from '../../../../../../editor/common/core/range.js';
import { RenameProvider, WorkspaceEdit, Rejection } from '../../../../../../editor/common/languages.js';
import { IMarkdownString } from '../../../../../../base/common/htmlContent.js';
import { LanguageFeaturesService } from '../../../../../../editor/common/services/languageFeaturesService.js';
import { ITextModelService } from '../../../../../../editor/common/services/resolverService.js';
import { ILanguageService } from '../../../../../../editor/common/languages/language.js';
import { createTextModel } from '../../../../../../editor/test/common/testTextModel.js';
import { IWorkspaceContextService, IWorkspaceFolder } from '../../../../../../platform/workspace/common/workspace.js';
import { IBulkEditService, IBulkEditResult } from '../../../../../../editor/browser/services/bulkEditService.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { RenameTool } from '../../../browser/tools/renameTool.js';
import { ChatConfiguration } from '../../../common/constants.js';
import { IChatService } from '../../../common/chatService/chatService.js';
import { IToolInvocation, IToolResult, IToolResultTextPart, ToolProgress } from '../../../common/tools/languageModelToolsService.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';

function getTextContent(result: IToolResult): string {
	const part = result.content.find((p): p is IToolResultTextPart => p.kind === 'text');
	return part?.value ?? '';
}

suite('RenameTool', () => {

	const disposables = new DisposableStore();
	let langFeatures: LanguageFeaturesService;

	const testUri = URI.parse('file:///test/file.ts');
	const testContent = [
		'import { MyClass } from "./myClass";',
		'',
		'function doSomething() {',
		'\tconst instance = new MyClass();',
		'\tinstance.run();',
		'}',
	].join('\n');

	function makeEdit(resource: URI, range: Range, text: string) {
		return { resource, versionId: undefined, textEdit: { range, text } };
	}

	function createMockTextModelService(model: unknown): ITextModelService {
		return {
			_serviceBrand: undefined,
			createModelReference: async () => ({
				object: { textEditorModel: model },
				dispose: () => { },
			}),
			registerTextModelContentProvider: () => ({ dispose: () => { } }),
			canHandleResource: () => false,
		} as unknown as ITextModelService;
	}

	function createMockWorkspaceService(): IWorkspaceContextService {
		const folderUri = URI.parse('file:///test');
		const folder = {
			uri: folderUri,
			toResource: (relativePath: string) => URI.parse(`file:///test/${relativePath}`),
		} as unknown as IWorkspaceFolder;
		return {
			_serviceBrand: undefined,
			getWorkspace: () => ({ folders: [folder] }),
			getWorkspaceFolder: (uri: URI) => {
				if (uri.toString().startsWith(folderUri.toString())) {
					return folder;
				}
				return null;
			},
		} as unknown as IWorkspaceContextService;
	}

	function createMockChatService(): IChatService {
		return {
			_serviceBrand: undefined,
			getSession: () => undefined,
		} as unknown as IChatService;
	}

	function createMockBulkEditService(): IBulkEditService & { appliedEdits: WorkspaceEdit[] } {
		const appliedEdits: WorkspaceEdit[] = [];
		return {
			_serviceBrand: undefined,
			apply: async (edit: WorkspaceEdit): Promise<IBulkEditResult> => {
				appliedEdits.push(edit);
				return { ariaSummary: '', isApplied: true };
			},
			appliedEdits,
		} as unknown as IBulkEditService & { appliedEdits: WorkspaceEdit[] };
	}

	function createInvocation(parameters: Record<string, unknown>): IToolInvocation {
		return { parameters } as unknown as IToolInvocation;
	}

	const noopCountTokens = async () => 0;
	const noopProgress: ToolProgress = { report() { } };

	function createMockLanguageService(): ILanguageService {
		return { getLanguageName: (id: string) => id } as unknown as ILanguageService;
	}

	function createTool(textModelService: ITextModelService, options?: { bulkEditService?: IBulkEditService; configurationService?: TestConfigurationService }): RenameTool {
		return new RenameTool(
			langFeatures,
			createMockLanguageService(),
			textModelService,
			createMockWorkspaceService(),
			createMockChatService(),
			options?.bulkEditService ?? createMockBulkEditService(),
			options?.configurationService ?? new TestConfigurationService(),
		);
	}

	setup(() => {
		langFeatures = new LanguageFeaturesService();
	});

	teardown(() => {
		disposables.clear();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	suite('getToolData', () => {

		test('reports no providers when none registered', () => {
			const tool = disposables.add(createTool(createMockTextModelService(null!)));
			assert.strictEqual(tool.getToolData(), undefined);
		});

		test('lists registered language ids', () => {
			const model = disposables.add(createTextModel('', 'typescript', undefined, testUri));
			const tool = disposables.add(createTool(createMockTextModelService(model)));
			disposables.add(langFeatures.renameProvider.register('typescript', {
				provideRenameEdits: () => ({ edits: [] }),
			}));
			const data = tool.getToolData();
			assert.ok(data?.modelDescription.includes('typescript'));
		});

		test('reports all languages for wildcard', () => {
			const tool = disposables.add(createTool(createMockTextModelService(null!)));
			disposables.add(langFeatures.renameProvider.register('*', {
				provideRenameEdits: () => ({ edits: [] }),
			}));
			const data = tool.getToolData();
			assert.ok(data?.modelDescription.includes('all languages'));
		});

		suite('cache-stable mode', () => {
			function createCacheStableTool(textModelService: ITextModelService) {
				const configurationService = new TestConfigurationService();
				configurationService.setUserConfiguration(ChatConfiguration.SymbolToolsCacheStable, true);
				return disposables.add(createTool(textModelService, { configurationService }));
			}

			test('returns tool data even when no providers are registered', () => {
				const tool = createCacheStableTool(createMockTextModelService(null!));
				const data = tool.getToolData();
				assert.ok(data, 'expected getToolData() to return data with no providers registered');
			});

			test('description does not include a per-language list', () => {
				const model = disposables.add(createTextModel('', 'typescript', undefined, testUri));
				const tool = createCacheStableTool(createMockTextModelService(model));
				disposables.add(langFeatures.renameProvider.register('typescript', {
					provideRenameEdits: () => ({ edits: [] }),
				}));
				const data = tool.getToolData();
				assert.ok(data, 'expected getToolData() to return data');
				assert.ok(!data!.modelDescription.includes('Currently supported for'),
					`expected modelDescription to not list languages, got: ${data!.modelDescription}`);
				assert.ok(!data!.modelDescription.includes('typescript'),
					'expected modelDescription to not include any specific language id');
				assert.ok(!data!.modelDescription.includes('all languages'),
					'expected modelDescription to not mention "all languages"');
			});

			test('description is identical regardless of which providers are registered', () => {
				const tool1 = createCacheStableTool(createMockTextModelService(null!));
				const data1 = tool1.getToolData();

				const model = disposables.add(createTextModel('', 'typescript', undefined, testUri));
				const tool2 = createCacheStableTool(createMockTextModelService(model));
				disposables.add(langFeatures.renameProvider.register('typescript', {
					provideRenameEdits: () => ({ edits: [] }),
				}));
				disposables.add(langFeatures.renameProvider.register('python', {
					provideRenameEdits: () => ({ edits: [] }),
				}));
				const data2 = tool2.getToolData();

				assert.ok(data1 && data2);
				assert.strictEqual(data1!.modelDescription, data2!.modelDescription,
					'expected modelDescription to be byte-stable across provider registrations');
			});
		});
	});

	suite('invoke', () => {

		test('returns error when no uri or filePath provided', async () => {
			const tool = disposables.add(createTool(createMockTextModelService(null!)));
			const result = await tool.invoke(
				createInvocation({ symbol: 'MyClass', newName: 'MyNewClass', lineContent: 'MyClass' }),
				noopCountTokens, noopProgress, CancellationToken.None
			);
			assert.ok(getTextContent(result).includes('Provide either'));
		});

		test('returns error when no rename provider available', async () => {
			const model = disposables.add(createTextModel(testContent, 'typescript', undefined, testUri));
			const tool = disposables.add(createTool(createMockTextModelService(model)));
			// No rename provider registered
			const result = await tool.invoke(
				createInvocation({ symbol: 'MyClass', newName: 'MyNewClass', uri: testUri.toString(), lineContent: 'import { MyClass }' }),
				noopCountTokens, noopProgress, CancellationToken.None
			);
			assert.ok(getTextContent(result).includes('No rename provider'));
		});

		test('returns error when line content not found', async () => {
			const model = disposables.add(createTextModel(testContent, 'typescript', undefined, testUri));
			disposables.add(langFeatures.renameProvider.register('typescript', {
				provideRenameEdits: () => ({ edits: [] }),
			}));
			const tool = disposables.add(createTool(createMockTextModelService(model)));
			const result = await tool.invoke(
				createInvocation({ symbol: 'MyClass', newName: 'MyNewClass', uri: testUri.toString(), lineContent: 'nonexistent line' }),
				noopCountTokens, noopProgress, CancellationToken.None
			);
			assert.ok(getTextContent(result).includes('Could not find line content'));
		});

		test('returns error when symbol not found in line', async () => {
			const model = disposables.add(createTextModel(testContent, 'typescript', undefined, testUri));
			disposables.add(langFeatures.renameProvider.register('typescript', {
				provideRenameEdits: () => ({ edits: [] }),
			}));
			const tool = disposables.add(createTool(createMockTextModelService(model)));
			const result = await tool.invoke(
				createInvocation({ symbol: 'NotHere', newName: 'Something', uri: testUri.toString(), lineContent: 'function doSomething' }),
				noopCountTokens, noopProgress, CancellationToken.None
			);
			assert.ok(getTextContent(result).includes('Could not find symbol'));
		});

		test('returns error when rename is rejected', async () => {
			const model = disposables.add(createTextModel(testContent, 'typescript', undefined, testUri));
			const provider: RenameProvider = {
				provideRenameEdits: (): WorkspaceEdit & Rejection => ({
					edits: [],
					rejectReason: 'Cannot rename this symbol',
				}),
			};
			disposables.add(langFeatures.renameProvider.register('typescript', provider));
			const tool = disposables.add(createTool(createMockTextModelService(model)));
			const result = await tool.invoke(
				createInvocation({ symbol: 'MyClass', newName: 'MyNewClass', uri: testUri.toString(), lineContent: 'import { MyClass }' }),
				noopCountTokens, noopProgress, CancellationToken.None
			);
			assert.ok(getTextContent(result).includes('Rename rejected'));
			assert.ok(getTextContent(result).includes('Cannot rename this symbol'));
		});

		test('returns error when rename produces no edits', async () => {
			const model = disposables.add(createTextModel(testContent, 'typescript', undefined, testUri));
			const provider: RenameProvider = {
				provideRenameEdits: (): WorkspaceEdit & Rejection => ({
					edits: [],
				}),
			};
			disposables.add(langFeatures.renameProvider.register('typescript', provider));
			const tool = disposables.add(createTool(createMockTextModelService(model)));
			const result = await tool.invoke(
				createInvocation({ symbol: 'MyClass', newName: 'MyNewClass', uri: testUri.toString(), lineContent: 'import { MyClass }' }),
				noopCountTokens, noopProgress, CancellationToken.None
			);
			assert.ok(getTextContent(result).includes('no edits'));
		});

		test('successful rename applies edits via bulk edit and reports result', async () => {
			const model = disposables.add(createTextModel(testContent, 'typescript', undefined, testUri));
			const otherUri = URI.parse('file:///test/other.ts');
			const edits = [
				makeEdit(testUri, new Range(1, 10, 1, 17), 'MyNewClass'),
				makeEdit(testUri, new Range(4, 23, 4, 30), 'MyNewClass'),
				makeEdit(otherUri, new Range(5, 14, 5, 21), 'MyNewClass'),
			];
			const provider: RenameProvider = {
				provideRenameEdits: (): WorkspaceEdit & Rejection => ({ edits }),
			};
			disposables.add(langFeatures.renameProvider.register('typescript', provider));

			const bulkEditService = createMockBulkEditService();
			const tool = disposables.add(createTool(createMockTextModelService(model), { bulkEditService }));

			const result = await tool.invoke(
				createInvocation({ symbol: 'MyClass', newName: 'MyNewClass', uri: testUri.toString(), lineContent: 'import { MyClass }' }),
				noopCountTokens, noopProgress, CancellationToken.None
			);

			const text = getTextContent(result);
			assert.ok(text.includes('Renamed'));
			assert.ok(text.includes('MyClass'));
			assert.ok(text.includes('MyNewClass'));
			assert.ok(text.includes('3 edits'));
			assert.ok(text.includes('2 files'));
			assert.strictEqual(bulkEditService.appliedEdits.length, 1);
			assert.strictEqual(bulkEditService.appliedEdits[0].edits.length, 3);
		});

		test('successful rename with single edit reports singular message', async () => {
			const model = disposables.add(createTextModel(testContent, 'typescript', undefined, testUri));
			const edits = [
				makeEdit(testUri, new Range(1, 10, 1, 17), 'MyNewClass'),
			];
			const provider: RenameProvider = {
				provideRenameEdits: (): WorkspaceEdit & Rejection => ({ edits }),
			};
			disposables.add(langFeatures.renameProvider.register('typescript', provider));

			const tool = disposables.add(createTool(createMockTextModelService(model)));
			const result = await tool.invoke(
				createInvocation({ symbol: 'MyClass', newName: 'MyNewClass', uri: testUri.toString(), lineContent: 'import { MyClass }' }),
				noopCountTokens, noopProgress, CancellationToken.None
			);

			const text = getTextContent(result);
			assert.ok(text.includes('1 edit'));
			assert.ok(text.includes('1 file'));
		});

		test('resolves filePath via workspace folders', async () => {
			const fileUri = URI.parse('file:///test/src/file.ts');
			const model = disposables.add(createTextModel(testContent, 'typescript', undefined, fileUri));
			const edits = [
				makeEdit(fileUri, new Range(1, 10, 1, 17), 'MyNewClass'),
			];
			const provider: RenameProvider = {
				provideRenameEdits: (): WorkspaceEdit & Rejection => ({ edits }),
			};
			disposables.add(langFeatures.renameProvider.register('typescript', provider));

			const tool = disposables.add(createTool(createMockTextModelService(model)));
			const result = await tool.invoke(
				createInvocation({ symbol: 'MyClass', newName: 'MyNewClass', filePath: 'src/file.ts', lineContent: 'import { MyClass }' }),
				noopCountTokens, noopProgress, CancellationToken.None
			);

			assert.ok(getTextContent(result).includes('Renamed'));
		});

		test('result includes toolResultMessage', async () => {
			const model = disposables.add(createTextModel(testContent, 'typescript', undefined, testUri));
			const edits = [
				makeEdit(testUri, new Range(1, 10, 1, 17), 'MyNewClass'),
			];
			const provider: RenameProvider = {
				provideRenameEdits: (): WorkspaceEdit & Rejection => ({ edits }),
			};
			disposables.add(langFeatures.renameProvider.register('typescript', provider));

			const tool = disposables.add(createTool(createMockTextModelService(model)));
			const result = await tool.invoke(
				createInvocation({ symbol: 'MyClass', newName: 'MyNewClass', uri: testUri.toString(), lineContent: 'import { MyClass }' }),
				noopCountTokens, noopProgress, CancellationToken.None
			);

			assert.ok(result.toolResultMessage);
			const msg = result.toolResultMessage as IMarkdownString;
			assert.ok(msg.value.includes('Renamed'));
		});
	});
});
