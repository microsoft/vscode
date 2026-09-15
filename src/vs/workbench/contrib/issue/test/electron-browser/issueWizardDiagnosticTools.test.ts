/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { VSBuffer } from '../../../../../base/common/buffer.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { isCancellationError } from '../../../../../base/common/errors.js';
import { IReference } from '../../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../../base/common/network.js';
import { URI } from '../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { Range } from '../../../../../editor/common/core/range.js';
import { IResolvedTextEditorModel, ITextModelService } from '../../../../../editor/common/services/resolverService.js';
import { createTextModel } from '../../../../../editor/test/common/testTextModel.js';
import { InMemoryFileSystemProvider } from '../../../../../platform/files/common/inMemoryFilesystemProvider.js';
import { FileService } from '../../../../../platform/files/common/fileService.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { IDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { IProcessService } from '../../../../../platform/process/common/process.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { IChatToolRiskAssessmentService } from '../../../chat/browser/tools/chatToolRiskAssessmentService.js';
import { ToolConfirmKind } from '../../../chat/common/chatService/chatService.js';
import { IToolInvocation, IToolInvocationPreparationContext } from '../../../chat/common/tools/languageModelToolsService.js';
import { ILanguageModelToolsConfirmationService } from '../../../chat/common/tools/languageModelToolsConfirmationService.js';
import { IToolResultCompressor } from '../../../chat/common/tools/toolResultCompressor.js';
import { LanguageModelToolsService } from '../../../chat/browser/tools/languageModelToolsService.js';
import { MockLanguageModelToolsConfirmationService } from '../../../chat/test/common/tools/mockLanguageModelToolsConfirmationService.js';
import { workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';
import { IWorkbenchEnvironmentService } from '../../../../services/environment/common/environmentService.js';
import { IOutputChannel, IOutputChannelDescriptor, IOutputService } from '../../../../services/output/common/output.js';
import {
	GET_VSCODE_INFO_TOOL_ID,
	GetVSCodeInfoTool,
	IssueWizardDiagnosticToolsContribution,
	SEARCH_VSCODE_LOGS_TOOL_ID,
	SearchVSCodeLogsTool,
} from '../../electron-browser/issueWizardDiagnosticTools.js';
import { IIssueDiagnosticsService, IIssueLogSearchResult, IssueDiagnosticsService } from '../../electron-browser/issueDiagnosticsService.js';

suite('Issue Wizard Diagnostic Tools', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const logsHome = URI.file('/logs/current');
	const countTokens = async () => 0;

	function createToolsService(dialogService?: IDialogService): LanguageModelToolsService {
		const instantiationService = workbenchInstantiationService({}, store);
		instantiationService.stub(ILanguageModelToolsConfirmationService, new MockLanguageModelToolsConfirmationService());
		instantiationService.stub(IToolResultCompressor, upcastPartial<IToolResultCompressor>({ maybeCompress: () => undefined }));
		instantiationService.stub(IChatToolRiskAssessmentService, upcastPartial<IChatToolRiskAssessmentService>({
			isEnabled: () => false,
			getCached: () => undefined,
			assess: async () => undefined,
		}));
		if (dialogService) {
			instantiationService.stub(IDialogService, dialogService);
		}
		return store.add(instantiationService.createInstance(LanguageModelToolsService));
	}

	function createFileService(): IFileService {
		const fileService = store.add(new FileService(new NullLogService()));
		store.add(fileService.registerProvider(Schemas.file, store.add(new InMemoryFileSystemProvider())));
		return fileService;
	}

	function createOutputServices(channels: ReadonlyMap<string, { readonly label: string; readonly value: string; readonly updatedValue?: string; readonly unreadable?: boolean }>): { outputService: IOutputService; textModelService: ITextModelService } {
		const models = new Map<string, ReturnType<typeof createTextModel>>();
		const unreadableModels = new Set<string>();
		const outputChannels = new Map<string, IOutputChannel>();
		const descriptors: IOutputChannelDescriptor[] = [];
		for (const [id, channel] of channels) {
			const uri = URI.from({ scheme: Schemas.outputChannel, path: id });
			const model = store.add(createTextModel(channel.value, undefined, undefined, uri));
			models.set(uri.toString(), model);
			if (channel.unreadable) {
				unreadableModels.add(uri.toString());
			}
			descriptors.push({ id, label: channel.label, log: true });
			outputChannels.set(id, upcastPartial<IOutputChannel>({
				id,
				label: channel.label,
				uri,
				getLogEntries: () => [{
					range: new Range(1, 1, model.getLineCount(), model.getLineMaxColumn(model.getLineCount())),
					timestamp: Date.UTC(2026, 8, 15, 8, 30),
					timestampRange: new Range(1, 1, 1, 1),
					logLevel: 3,
					logLevelRange: new Range(1, 1, 1, 1),
					category: undefined,
				}],
				update: () => {
					if (channel.updatedValue !== undefined) {
						setTimeout(() => model.setValue(channel.updatedValue!), 0);
					}
				},
			}));
		}

		return {
			outputService: upcastPartial<IOutputService>({
				getChannelDescriptors: () => descriptors,
				getChannelDescriptor: id => descriptors.find(descriptor => descriptor.id === id),
				getChannel: id => outputChannels.get(id),
				getActiveChannel: () => outputChannels.values().next().value,
			}),
			textModelService: upcastPartial<ITextModelService>({
				createModelReference: async resource => {
					if (unreadableModels.has(resource.toString())) {
						throw new Error('Output channel disappeared');
					}
					const model = models.get(resource.toString());
					if (!model) {
						throw new Error(`Unknown output model: ${resource.toString()}`);
					}
					return upcastPartial<IReference<IResolvedTextEditorModel>>({
						object: upcastPartial<IResolvedTextEditorModel>({ textEditorModel: model }),
						dispose: () => { },
					});
				},
			}),
		};
	}

	function createDiagnosticsService(options?: { readonly channels?: ReadonlyMap<string, { readonly label: string; readonly value: string; readonly updatedValue?: string; readonly unreadable?: boolean }>; readonly fileService?: IFileService }): IssueDiagnosticsService {
		const { outputService, textModelService } = createOutputServices(options?.channels ?? new Map());
		return new IssueDiagnosticsService(
			upcastPartial<IProductService>({
				nameShort: 'Code - Exploration',
				version: '1.139.0-exploration',
				quality: 'exploration',
				commit: '65a9338',
				date: '2026-09-15T06:00:00.000Z',
			}),
			upcastPartial<IProcessService>({
				getSystemInfo: async () => upcastPartial({ os: 'Darwin arm64 25.6.0', memory: '16 GB', vmHint: '0%', processArgs: '', gpuStatus: {}, screenReader: 'no', remoteData: [] }),
			}),
			upcastPartial<IWorkbenchEnvironmentService>({ logsHome }),
			options?.fileService ?? createFileService(),
			outputService,
			textModelService,
		);
	}

	test('registers an approval-gated tool that returns only trusted build metadata', async () => {
		const toolsService = createToolsService();
		const diagnosticsService = upcastPartial<IIssueDiagnosticsService>({
			getProductInfo: () => ({ version: '1.139.0-exploration', quality: 'exploration', commit: '65a9338' }),
		});
		store.add(new IssueWizardDiagnosticToolsContribution(toolsService, diagnosticsService));
		const toolData = toolsService.getTool(GET_VSCODE_INFO_TOOL_ID);
		const prepared = await new GetVSCodeInfoTool(diagnosticsService).prepareToolInvocation(upcastPartial<IToolInvocationPreparationContext>({ parameters: {} }), CancellationToken.None);

		const result = await toolsService.invokeTool(upcastPartial<IToolInvocation>({
			callId: 'product-info',
			toolId: GET_VSCODE_INFO_TOOL_ID,
			parameters: {},
			preApproved: { type: ToolConfirmKind.UserAction },
		}), countTokens, CancellationToken.None);

		assert.deepStrictEqual({
			tool: toolData && {
				name: toolData.toolReferenceName,
				canRequestPreApproval: toolData.canRequestPreApproval,
				runsInWorkspace: toolData.runsInWorkspace,
			},
			confirmation: prepared?.confirmationMessages && {
				hasTitle: !!prepared.confirmationMessages.title,
				hasMessage: !!prepared.confirmationMessages.message,
				allowAutoConfirm: prepared.confirmationMessages.allowAutoConfirm,
			},
			result: result.content[0].kind === 'text' ? JSON.parse(result.content[0].value) : undefined,
		}, {
			tool: { name: 'getVSCodeInfo', canRequestPreApproval: true, runsInWorkspace: false },
			confirmation: { hasTitle: true, hasMessage: true, allowAutoConfirm: false },
			result: { version: '1.139.0-exploration', quality: 'exploration', commit: '65a9338' },
		});
	});

	test('denied approval invokes neither diagnostic collector', async () => {
		const calls = { productInfo: 0, logSearch: 0 };
		const toolsService = createToolsService(upcastPartial<IDialogService>({
			confirm: async () => ({ confirmed: false }),
		}));
		const diagnosticsService = upcastPartial<IIssueDiagnosticsService>({
			getProductInfo: () => {
				calls.productInfo++;
				return { version: 'unreachable', quality: 'unreachable', commit: 'unreachable' };
			},
			searchLogs: async options => {
				calls.logSearch++;
				return {
					query: options.query,
					matches: [],
					searchedSourceCount: 0,
					matchLimitReached: false,
					sourceLimitReached: false,
					truncatedSources: [],
					failedSources: [],
				};
			},
		});
		store.add(new IssueWizardDiagnosticToolsContribution(toolsService, diagnosticsService));

		for (const [callId, toolId, parameters] of [
			['product-info-denied', GET_VSCODE_INFO_TOOL_ID, {}],
			['log-search-denied', SEARCH_VSCODE_LOGS_TOOL_ID, { query: 'error', sources: ['output:rendererLog'] }],
		] as const) {
			await assert.rejects(toolsService.invokeTool(upcastPartial<IToolInvocation>({
				callId,
				toolId,
				parameters,
			}), countTokens, CancellationToken.None), error => isCancellationError(error));
		}

		assert.deepStrictEqual(calls, { productInfo: 0, logSearch: 0 });
	});

	test('shares VS Code-owned system information with the Issue Reporter collector', async () => {
		const diagnosticsService = createDiagnosticsService();

		assert.deepStrictEqual(await diagnosticsService.getIssueReporterSystemInfo(), {
			vscodeVersion: 'Code - Exploration 1.139.0-exploration (65a9338, 2026-09-15T06:00:00.000Z)',
			systemInfo: {
				os: 'Darwin arm64 25.6.0',
				memory: '16 GB',
				vmHint: '0%',
				processArgs: '',
				gpuStatus: {},
				screenReader: 'no',
				remoteData: [],
			},
		});
	});

	test('discovers current-run files and registered output channels without exposing other log roots', async () => {
		const fileService = createFileService();
		await fileService.createFolder(URI.joinPath(logsHome, 'window1'));
		await fileService.writeFile(URI.joinPath(logsHome, 'window1/renderer.log'), VSBuffer.fromString('current run'));
		await fileService.createFolder(URI.file('/logs/previous'));
		await fileService.writeFile(URI.file('/logs/previous/secret.log'), VSBuffer.fromString('previous run'));
		const diagnosticsService = createDiagnosticsService({
			fileService,
			channels: new Map([['github.copilot', { label: 'GitHub Copilot Chat', value: 'current output' }]]),
		});

		assert.deepStrictEqual(await diagnosticsService.getLogSources(CancellationToken.None), [
			{ id: 'output:github.copilot', label: 'GitHub Copilot Chat', kind: 'output' },
			{ id: 'log:window1/renderer.log', label: 'window1/renderer.log', kind: 'logFile' },
		]);
		await assert.rejects(
			diagnosticsService.searchLogs({ query: 'previous run', sources: ['log:../previous/secret.log'] }, CancellationToken.None),
			/list sources again/i,
		);
	});

	test('returns bounded, case-insensitive matches from output channels and current-run log files', async () => {
		const fileService = createFileService();
		await fileService.createFolder(URI.joinPath(logsHome, 'window1'));
		await fileService.writeFile(URI.joinPath(logsHome, 'window1/renderer.log'), VSBuffer.fromString([
			'old line',
			'ERROR first provider registration failure',
			'error newest provider registration failure',
		].join('\n')));
		const diagnosticsService = createDiagnosticsService({
			fileService,
			channels: new Map([['github.copilot', {
				label: 'GitHub Copilot Chat',
				value: ['normal', 'ERROR output registration failure'].join('\n'),
			}]]),
		});

		assert.deepStrictEqual(await diagnosticsService.searchLogs({
			query: 'error',
			sources: ['output:github.copilot', 'log:window1/renderer.log'],
			maxResults: 2,
		}, CancellationToken.None), {
			query: 'error',
			matches: [{
				source: 'output:github.copilot',
				label: 'GitHub Copilot Chat',
				lineNumber: 2,
				timestamp: '2026-09-15T08:30:00.000Z',
				text: 'ERROR output registration failure',
			}, {
				source: 'log:window1/renderer.log',
				label: 'window1/renderer.log',
				lineNumber: 3,
				text: 'error newest provider registration failure',
			}],
			searchedSourceCount: 2,
			matchLimitReached: true,
			sourceLimitReached: false,
			truncatedSources: [],
			failedSources: [],
		});
	});

	test('waits for an output channel refresh before searching', async () => {
		const diagnosticsService = createDiagnosticsService({
			channels: new Map([['rendererLog', {
				label: 'Window',
				value: 'older output',
				updatedValue: 'older output\nERROR appended asynchronously',
			}]]),
		});

		const result = await diagnosticsService.searchLogs({ query: 'appended asynchronously', sources: ['output:rendererLog'] }, CancellationToken.None);

		assert.deepStrictEqual(result.matches.map(match => match.text), ['ERROR appended asynchronously']);
	});

	test('reports an unreadable source with a recovery action', async () => {
		const toolsService = createToolsService();
		const diagnosticsService = createDiagnosticsService({
			channels: new Map([['rendererLog', { label: 'Window', value: '', unreadable: true }]]),
		});
		store.add(new IssueWizardDiagnosticToolsContribution(toolsService, diagnosticsService));

		const toolResult = await toolsService.invokeTool(upcastPartial<IToolInvocation>({
			callId: 'missing-log-search',
			toolId: SEARCH_VSCODE_LOGS_TOOL_ID,
			parameters: { query: 'error', sources: ['output:rendererLog'] },
			preApproved: { type: ToolConfirmKind.UserAction },
		}), countTokens, CancellationToken.None);
		const result = toolResult.content[0].kind === 'text' ? JSON.parse(toolResult.content[0].value) as IIssueLogSearchResult : undefined;

		assert.deepStrictEqual(result && {
			matches: result.matches,
			failedSources: result.failedSources,
		}, {
			matches: [],
			failedSources: [{
				source: 'output:rendererLog',
				label: 'Window',
				message: 'This source could not be read. List sources again and retry if it is still available.',
			}],
		});
	});

	test('reports the match limit only when another matching line exists', async () => {
		const diagnosticsService = createDiagnosticsService({
			channels: new Map([['rendererLog', {
				label: 'Window',
				value: ['ERROR older', 'ERROR newer'].join('\n'),
			}]]),
		});

		const result = await diagnosticsService.searchLogs({ query: 'error', maxResults: 2 }, CancellationToken.None);

		assert.deepStrictEqual({
			matches: result.matches.map(match => match.text),
			matchLimitReached: result.matchLimitReached,
		}, {
			matches: ['ERROR newer', 'ERROR older'],
			matchLimitReached: false,
		});
	});

	test('registers an approval-gated log tool that can discover sources before searching', async () => {
		const toolsService = createToolsService();
		const diagnosticsService = upcastPartial<IIssueDiagnosticsService>({
			getLogSources: async () => [{ id: 'output:rendererLog', label: 'Window', kind: 'output' }],
		});
		store.add(new IssueWizardDiagnosticToolsContribution(toolsService, diagnosticsService));
		const toolData = toolsService.getTool(SEARCH_VSCODE_LOGS_TOOL_ID);
		const prepared = await new SearchVSCodeLogsTool(diagnosticsService).prepareToolInvocation(upcastPartial<IToolInvocationPreparationContext>({ parameters: {} }), CancellationToken.None);

		const result = await toolsService.invokeTool(upcastPartial<IToolInvocation>({
			callId: 'log-discovery',
			toolId: SEARCH_VSCODE_LOGS_TOOL_ID,
			parameters: {},
			preApproved: { type: ToolConfirmKind.UserAction },
		}), countTokens, CancellationToken.None);

		assert.deepStrictEqual({
			tool: toolData && {
				name: toolData.toolReferenceName,
				canRequestPreApproval: toolData.canRequestPreApproval,
				runsInWorkspace: toolData.runsInWorkspace,
			},
			confirmation: prepared?.confirmationMessages && {
				hasTitle: !!prepared.confirmationMessages.title,
				hasMessage: !!prepared.confirmationMessages.message,
				allowAutoConfirm: prepared.confirmationMessages.allowAutoConfirm,
			},
			result: result.content[0].kind === 'text' ? JSON.parse(result.content[0].value) : undefined,
		}, {
			tool: { name: 'searchVSCodeLogs', canRequestPreApproval: true, runsInWorkspace: false },
			confirmation: { hasTitle: true, hasMessage: true, allowAutoConfirm: true },
			result: { sources: [{ id: 'output:rendererLog', label: 'Window', kind: 'output' }] },
		});
	});

	test('runs an approved scoped log search through the language model tool service', async () => {
		const toolsService = createToolsService();
		const calls: { query: string; sources?: readonly string[]; maxResults?: number }[] = [];
		const diagnosticsService = upcastPartial<IIssueDiagnosticsService>({
			searchLogs: async options => {
				calls.push(options);
				return {
					query: options.query,
					matches: [{ source: 'output:rendererLog', label: 'Window', lineNumber: 7, text: 'ERROR provider failed' }],
					searchedSourceCount: 1,
					matchLimitReached: false,
					sourceLimitReached: false,
					truncatedSources: [],
					failedSources: [],
				};
			},
		});
		store.add(new IssueWizardDiagnosticToolsContribution(toolsService, diagnosticsService));

		const result = await toolsService.invokeTool(upcastPartial<IToolInvocation>({
			callId: 'log-search',
			toolId: SEARCH_VSCODE_LOGS_TOOL_ID,
			parameters: { query: 'provider failed', sources: ['output:rendererLog'], maxResults: 5 },
			preApproved: { type: ToolConfirmKind.UserAction },
		}), countTokens, CancellationToken.None);

		assert.deepStrictEqual({
			calls,
			result: result.content[0].kind === 'text' ? JSON.parse(result.content[0].value) : undefined,
		}, {
			calls: [{ query: 'provider failed', sources: ['output:rendererLog'], maxResults: 5 }],
			result: {
				query: 'provider failed',
				matches: [{ source: 'output:rendererLog', label: 'Window', lineNumber: 7, text: 'ERROR provider failed' }],
				searchedSourceCount: 1,
				matchLimitReached: false,
				sourceLimitReached: false,
				truncatedSources: [],
				failedSources: [],
			},
		});
	});

	test('rejects an invalid log target with a recovery action through the language model tool service', async () => {
		const toolsService = createToolsService();
		store.add(new IssueWizardDiagnosticToolsContribution(toolsService, createDiagnosticsService()));

		await assert.rejects(toolsService.invokeTool(upcastPartial<IToolInvocation>({
			callId: 'invalid-log-search',
			toolId: SEARCH_VSCODE_LOGS_TOOL_ID,
			parameters: { query: 'secret', sources: ['log:../previous/secret.log'] },
			preApproved: { type: ToolConfirmKind.UserAction },
		}), countTokens, CancellationToken.None), /list sources again/i);
	});
});
