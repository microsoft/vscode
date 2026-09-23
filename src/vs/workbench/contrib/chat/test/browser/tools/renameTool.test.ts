/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { ExtUri, extUriBiasedIgnorePathCase } from '../../../../../../base/common/resources.js';
import { URI } from '../../../../../../base/common/uri.js';
import { Range } from '../../../../../../editor/common/core/range.js';
import { RenameProvider, WorkspaceEdit, Rejection } from '../../../../../../editor/common/languages.js';
import { IMarkdownString } from '../../../../../../base/common/htmlContent.js';
import { LanguageFeaturesService } from '../../../../../../editor/common/services/languageFeaturesService.js';
import { ITextModelService } from '../../../../../../editor/common/services/resolverService.js';
import { createTextModel } from '../../../../../../editor/test/common/testTextModel.js';
import { IWorkspaceContextService, IWorkspaceFolder } from '../../../../../../platform/workspace/common/workspace.js';
import { IUriIdentityService } from '../../../../../../platform/uriIdentity/common/uriIdentity.js';
import { IBulkEditService, IBulkEditResult } from '../../../../../../editor/browser/services/bulkEditService.js';
import { RenameTool } from '../../../browser/tools/renameTool.js';
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
	const uriIdentityService = { extUri: new ExtUri(() => false) } as Partial<IUriIdentityService> as IUriIdentityService;

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
			getWorkspaceFolder: (uri: URI) => extUriBiasedIgnorePathCase.isEqualOrParent(uri, folderUri) ? folder : null,
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

	function createTool(textModelService: ITextModelService, options?: { bulkEditService?: IBulkEditService; chatService?: IChatService }): RenameTool {
		return new RenameTool(
			langFeatures,
			textModelService,
			createMockWorkspaceService(),
			uriIdentityService,
			options?.chatService ?? createMockChatService(),
			options?.bulkEditService ?? createMockBulkEditService(),
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

		test('returns tool data when no providers are registered', () => {
			const tool = disposables.add(createTool(createMockTextModelService(null!)));
			assert.ok(tool.getToolData());
		});

		test('description does not include a per-language list', () => {
			const model = disposables.add(createTextModel('', 'typescript', undefined, testUri));
			const tool = disposables.add(createTool(createMockTextModelService(model)));
			disposables.add(langFeatures.renameProvider.register('typescript', {
				provideRenameEdits: () => ({ edits: [] }),
			}));
			const data = tool.getToolData();
			assert.ok(!data.modelDescription.includes('Currently supported for'),
				`expected modelDescription to not list languages, got: ${data.modelDescription}`);
			assert.ok(!data.modelDescription.includes('typescript'),
				'expected modelDescription to not include any specific language id');
			assert.ok(!data.modelDescription.includes('all languages'),
				'expected modelDescription to not mention "all languages"');
		});

		test('description is identical regardless of which providers are registered', () => {
			const tool1 = disposables.add(createTool(createMockTextModelService(null!)));
			const data1 = tool1.getToolData();

			const model = disposables.add(createTextModel('', 'typescript', undefined, testUri));
			const tool2 = disposables.add(createTool(createMockTextModelService(model)));
			disposables.add(langFeatures.renameProvider.register('typescript', {
				provideRenameEdits: () => ({ edits: [] }),
			}));
			disposables.add(langFeatures.renameProvider.register('python', {
				provideRenameEdits: () => ({ edits: [] }),
			}));
			const data2 = tool2.getToolData();

			assert.strictEqual(data1.modelDescription, data2.modelDescription,
				'expected modelDescription to be byte-stable across provider registrations');
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

		test('rejects filePath that escapes the session working directory', async () => {
			const outsideUri = URI.parse('file:///outside.ts');
			const outsideModel = disposables.add(createTextModel('const OutsideSecretMarker = 1;', 'typescript', undefined, outsideUri));
			const requestedUris: URI[] = [];
			const textModelService = {
				_serviceBrand: undefined,
				createModelReference: async (uri: URI) => {
					requestedUris.push(uri);
					return { object: { textEditorModel: outsideModel }, dispose: () => { } };
				},
				registerTextModelContentProvider: () => ({ dispose: () => { } }),
				canHandleResource: () => false,
			} as unknown as ITextModelService;
			disposables.add(langFeatures.renameProvider.register('typescript', {
				provideRenameEdits: (): WorkspaceEdit & Rejection => ({ edits: [makeEdit(outsideUri, new Range(1, 7, 1, 26), 'RenamedSecretMarker')] }),
			}));

			const bulkEditService = createMockBulkEditService();
			const tool = disposables.add(createTool(textModelService, { bulkEditService }));
			const result = await tool.invoke(
				{
					parameters: { symbol: 'OutsideSecretMarker', newName: 'RenamedSecretMarker', filePath: '../outside.ts', lineContent: 'const OutsideSecretMarker = 1;' },
					context: { workingDirectory: URI.parse('file:///session-dir') },
				} as unknown as IToolInvocation,
				noopCountTokens, noopProgress, CancellationToken.None
			);

			assert.ok(getTextContent(result).includes('Provide either'));
			assert.strictEqual(requestedUris.length, 0);
			assert.strictEqual(bulkEditService.appliedEdits.length, 0);
		});

		test('rejects uri outside the workspace', async () => {
			const outsideUri = URI.parse('file:///outside.ts');
			const outsideModel = disposables.add(createTextModel('const OutsideSymbol = 1;', 'typescript', undefined, outsideUri));
			const requestedUris: URI[] = [];
			const textModelService = {
				_serviceBrand: undefined,
				createModelReference: async (uri: URI) => {
					requestedUris.push(uri);
					return { object: { textEditorModel: outsideModel }, dispose: () => { } };
				},
				registerTextModelContentProvider: () => ({ dispose: () => { } }),
				canHandleResource: () => false,
			} as unknown as ITextModelService;
			const bulkEditService = createMockBulkEditService();
			const tool = disposables.add(createTool(textModelService, { bulkEditService }));

			const result = await tool.invoke(
				createInvocation({ symbol: 'OutsideSymbol', newName: 'RenamedSymbol', uri: outsideUri.toString(), lineContent: 'const OutsideSymbol = 1;' }),
				noopCountTokens, noopProgress, CancellationToken.None
			);

			assert.deepStrictEqual({
				result: getTextContent(result),
				requestedUris: requestedUris.map(uri => uri.toString()),
				appliedEditCount: bulkEditService.appliedEdits.length,
			}, {
				result: 'Provide either "uri" (a full URI) or "filePath" (a workspace-relative path) to identify a file within the current workspace or working directory.',
				requestedUris: [],
				appliedEditCount: 0,
			});
		});

		test('rejects every rename edit kind outside the workspace', async () => {
			const model = disposables.add(createTextModel(testContent, 'typescript', undefined, testUri));
			const outsideUri = URI.parse('file:///outside.ts');
			const bulkEditService = createMockBulkEditService();
			const tool = disposables.add(createTool(createMockTextModelService(model), { bulkEditService }));
			const externalEdits: WorkspaceEdit['edits'] = [
				makeEdit(outsideUri, new Range(1, 1, 1, 8), 'MyNewClass'),
				{ oldResource: testUri, newResource: outsideUri },
				{ resource: outsideUri, undo() { }, redo() { } },
			];

			for (const edit of externalEdits) {
				const provider = langFeatures.renameProvider.register('typescript', {
					provideRenameEdits: (): WorkspaceEdit & Rejection => ({ edits: [edit] }),
				});
				try {
					const result = await tool.invoke(
						createInvocation({ symbol: 'MyClass', newName: 'MyNewClass', uri: testUri.toString(), lineContent: 'import { MyClass }' }),
						noopCountTokens, noopProgress, CancellationToken.None
					);
					assert.strictEqual(getTextContent(result), 'Rename was not applied because it would modify files outside the current workspace or working directory.');
				} finally {
					provider.dispose();
				}
			}

			assert.strictEqual(bulkEditService.appliedEdits.length, 0);
		});

		test('rejects non-text edits in chat context', async () => {
			const model = disposables.add(createTextModel(testContent, 'typescript', undefined, testUri));
			disposables.add(langFeatures.renameProvider.register('typescript', {
				provideRenameEdits: (): WorkspaceEdit & Rejection => ({
					edits: [
						makeEdit(testUri, new Range(1, 10, 1, 17), 'MyNewClass'),
						{ oldResource: testUri, newResource: URI.parse('file:///test/renamed.ts') },
					]
				}),
			}));
			let progressCount = 0;
			const chatService = {
				_serviceBrand: undefined,
				getSession: () => ({
					getRequests: () => [{}],
					acceptResponseProgress: () => progressCount++,
				}),
			} as unknown as IChatService;
			const bulkEditService = createMockBulkEditService();
			const tool = disposables.add(createTool(createMockTextModelService(model), { bulkEditService, chatService }));

			const result = await tool.invoke(
				{
					parameters: { symbol: 'MyClass', newName: 'MyNewClass', uri: testUri.toString(), lineContent: 'import { MyClass }' },
					context: { sessionResource: URI.parse('chat-session:test') },
				} as unknown as IToolInvocation,
				noopCountTokens, noopProgress, CancellationToken.None
			);

			assert.deepStrictEqual({
				result: getTextContent(result),
				progressCount,
				appliedEditCount: bulkEditService.appliedEdits.length,
			}, {
				result: 'Rename was not applied because it produced edits that cannot be reviewed in chat.',
				progressCount: 0,
				appliedEditCount: 0,
			});
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
