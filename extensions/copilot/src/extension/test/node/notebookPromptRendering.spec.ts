/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { beforeAll, beforeEach, describe, expect, test } from 'vitest';
import type * as vscode from 'vscode';
import { getTextPart } from '../../../platform/chat/common/globalStringUtils';
import { CHAT_MODEL } from '../../../platform/configuration/common/configurationService';
import { DiffServiceImpl } from '../../../platform/diff/node/diffServiceImpl';
import { TextDocumentSnapshot } from '../../../platform/editing/common/textDocumentSnapshot';
import { MockEndpoint } from '../../../platform/endpoint/test/node/mockEndpoint';
import { ILogger, ILogService } from '../../../platform/log/common/logService';
import { IChatEndpoint } from '../../../platform/networking/common/networking';
import { IAlternativeNotebookContentService } from '../../../platform/notebook/common/alternativeContent';
import { AlternativeNotebookContentEditGenerator, IAlternativeNotebookContentEditGenerator } from '../../../platform/notebook/common/alternativeContentEditGenerator';
import { INotebookService, PipPackage, VariablesResult } from '../../../platform/notebook/common/notebookService';
import { ITabsAndEditorsService } from '../../../platform/tabs/common/tabsAndEditorsService';
import { IExperimentationService, NullExperimentationService } from '../../../platform/telemetry/common/nullExperimentationService';
import { NullTelemetryService } from '../../../platform/telemetry/common/nullTelemetryService';
import { ITestingServicesAccessor } from '../../../platform/test/node/services';
import { SimulationAlternativeNotebookContentService, TestingTabsAndEditorsService } from '../../../platform/test/node/simulationWorkspaceServices';
import { ITokenizerProvider } from '../../../platform/tokenizer/node/tokenizer';
import { AbstractWorkspaceService, IWorkspaceService } from '../../../platform/workspace/common/workspaceService';
import { ExtHostNotebookDocumentData } from '../../../util/common/test/shims/notebookDocument';
import { TokenizerType } from '../../../util/common/tokenizer';
import { CancellationToken } from '../../../util/vs/base/common/cancellation';
import { Event } from '../../../util/vs/base/common/event';
import { URI } from '../../../util/vs/base/common/uri';
import { IInstantiationService } from '../../../util/vs/platform/instantiation/common/instantiation';
import { NotebookCellData, NotebookCellKind, NotebookData, Range, Selection, Uri } from '../../../vscodeTypes';
import { ChatVariablesCollection } from '../../prompt/common/chatVariablesCollection';
import { IDocumentContext } from '../../prompt/node/documentContext';
import { PromptRenderer } from '../../prompts/node/base/promptRenderer';
import { InlineChatNotebookGeneratePrompt } from '../../prompts/node/inline/inlineChatNotebookGeneratePrompt';
import { createExtensionUnitTestingServices } from './services';

function getFakeDocumentContext(notebook: vscode.NotebookDocument, index: number = 0) {
	const cell = notebook.getCells()[index];
	const docSnapshot = TextDocumentSnapshot.create(cell.document);

	const context: IDocumentContext = {
		document: docSnapshot,
		language: { languageId: docSnapshot.languageId, lineComment: { start: '//' } },
		fileIndentInfo: undefined,
		wholeRange: new Range(0, 0, 1, 0),
		selection: new Selection(0, 0, 0, 0),
	};

	return context;
}

function getFakeNotebookEditor(): vscode.NotebookEditor {
	const cells = [
		new NotebookCellData(NotebookCellKind.Code, 'print("hello")', 'python'),
		new NotebookCellData(NotebookCellKind.Code, 'print("world")', 'python'),
	];
	const uri = URI.from({ scheme: 'file', path: '/path/file.ipynb' });
	const notebook = ExtHostNotebookDocumentData.fromNotebookData(uri, new NotebookData(cells), 'jupyter-notebook').document;
	const selection = {
		start: 1,
		end: 2,
		isEmpty: false,
		with() {
			return selection;
		}
	};

	return {
		notebook,
		revealRange() { },
		selections: [selection],
		selection: selection,
		visibleRanges: [],
		viewColumn: 1
	};
}

describe('Notebook Prompt Rendering', function () {
	let accessor: ITestingServicesAccessor;
	const contexts: IDocumentContext[] = [];
	const treatmeants = {
		'copilotchat.notebookPackages': false,
		'copilotchat.notebookPriorities': false
	};

	beforeAll(() => {
		const notebookEditor = getFakeNotebookEditor();
		contexts.length = 0;
		contexts.push(getFakeDocumentContext(notebookEditor.notebook, 0));
		contexts.push(getFakeDocumentContext(notebookEditor.notebook, 1));

		const testingServiceCollection = createExtensionUnitTestingServices();
		testingServiceCollection.define(ITabsAndEditorsService, new TestingTabsAndEditorsService({
			getActiveTextEditor: () => undefined,
			getVisibleTextEditors: () => [],
			getActiveNotebookEditor: () => notebookEditor
		}));
		testingServiceCollection.define(IWorkspaceService, new class extends AbstractWorkspaceService {
			override fs!: vscode.FileSystem;
			override textDocuments: readonly vscode.TextDocument[] = [];
			override notebookDocuments: readonly vscode.NotebookDocument[] = [notebookEditor.notebook];
			override onDidOpenTextDocument = Event.None;
			override onDidCloseTextDocument = Event.None;
			override onDidOpenNotebookDocument = Event.None;
			override onDidCloseNotebookDocument = Event.None;
			override onDidChangeTextDocument = Event.None;
			override onDidChangeWorkspaceFolders = Event.None;
			override onDidChangeNotebookDocument = Event.None;
			override onDidChangeTextEditorSelection = Event.None;
			override openTextDocument(uri: vscode.Uri): Promise<vscode.TextDocument> {
				throw new Error('Method not implemented.');
			}
			override showTextDocument(document: vscode.TextDocument): Promise<void> {
				throw new Error('Method not implemented.');
			}
			override async openNotebookDocument(uri: Uri): Promise<vscode.NotebookDocument>;
			override async openNotebookDocument(notebookType: string, content?: vscode.NotebookData): Promise<vscode.NotebookDocument>;
			override async openNotebookDocument(arg1: Uri | string, arg2?: vscode.NotebookData): Promise<vscode.NotebookDocument> {
				throw new Error('Method not implemented.');
			}

			override getWorkspaceFolders(): URI[] {
				return [];
			}
			override getWorkspaceFolderName(workspaceFolderUri: URI): string {
				return '';
			}
			override ensureWorkspaceIsFullyLoaded(): Promise<void> {
				throw new Error('Method not implemented.');
			}
			override async showWorkspaceFolderPicker(): Promise<vscode.WorkspaceFolder | undefined> {
				return;
			}
			override applyEdit(edit: vscode.WorkspaceEdit): Thenable<boolean> {
				throw new Error('Method not implemented.');
			}
			override requestResourceTrust(_options: vscode.ResourceTrustRequestOptions): Thenable<boolean | undefined> {
				return Promise.resolve(true);
			}
			override requestWorkspaceTrust(_options?: vscode.WorkspaceTrustRequestOptions): Thenable<boolean | undefined> {
				return Promise.resolve(true);
			}

		});
		testingServiceCollection.define(IExperimentationService, new class extends NullExperimentationService {
			override getTreatmentVariable<T extends string | number | boolean>(_name: string): T | undefined {
				if (_name === 'copilotchat.notebookPackages' || _name === 'copilotchat.notebookPriorities') {
					return treatmeants[_name] as T;
				}

				return undefined;
			}
		});
		testingServiceCollection.define(INotebookService, new class implements INotebookService {
			_serviceBrand: undefined;
			async getVariables(notebook: Uri): Promise<VariablesResult[]> {
				return [
					{
						variable: {
							name: 'x',
							value: '1',
							type: 'int',
							summary: 'int'
						},
						hasNamedChildren: false,
						indexedChildrenCount: 0
					}
				];
			}
			async getPipPackages(notebook: Uri): Promise<PipPackage[]> {
				return [
					{ name: 'numpy', version: '1.0.0' }
				];
			}
			setVariables(notebook: Uri, variables: VariablesResult[]): void {
			}
			getCellExecutions(notebook: vscode.Uri): vscode.NotebookCell[] {
				return [];
			}
			runCells(notebook: Uri, range: { start: number; end: number }, autoreveal: boolean): Promise<void> {
				return Promise.resolve();
			}
			ensureKernelSelected(notebook: Uri): Promise<void> {
				return Promise.resolve();
			}
			populateNotebookProviders(): void {
				return;
			}
			hasSupportedNotebooks(uri: Uri): boolean {
				return false;
			}
			trackAgentUsage() { }
			setFollowState(state: boolean): void { }
			getFollowState(): boolean {
				return false;
			}
		});
		const mockLogger: ILogger = {
			error: () => { /* no-op */ },
			warn: () => { /* no-op */ },
			info: () => { /* no-op */ },
			debug: () => { /* no-op */ },
			trace: () => { /* no-op */ },
			show: () => { /* no-op */ },
			createSubLogger(): ILogger { return mockLogger; },
			withExtraTarget(): ILogger { return mockLogger; }
		};
		testingServiceCollection.define(IAlternativeNotebookContentService, new SimulationAlternativeNotebookContentService('json'));
		testingServiceCollection.define(IAlternativeNotebookContentEditGenerator, new AlternativeNotebookContentEditGenerator(new SimulationAlternativeNotebookContentService('json'), new DiffServiceImpl(), new class implements ILogService {
			_serviceBrand: undefined;
			internal = mockLogger;
			logger = mockLogger;
			trace = mockLogger.trace;
			debug = mockLogger.debug;
			info = mockLogger.info;
			warn = mockLogger.warn;
			error = mockLogger.error;
			show(preserveFocus?: boolean): void {
				//
			}
			createSubLogger(): ILogger {
				return this;
			}
			withExtraTarget(): ILogger {
				return this;
			}
		}(), new NullTelemetryService()));
		accessor = testingServiceCollection.createTestingAccessor();
	});

	beforeEach(() => {
		treatmeants['copilotchat.notebookPackages'] = false;
		treatmeants['copilotchat.notebookPriorities'] = false;
	});

	test('Notebook prompt structure is rendered correctly', async function () {
		const endpoint = accessor.get(IInstantiationService).createInstance(MockEndpoint, undefined);
		const progressReporter = { report() { } };
		const renderer = PromptRenderer.create(accessor.get(IInstantiationService), endpoint, InlineChatNotebookGeneratePrompt, {
			documentContext: contexts[1],
			promptContext: {
				query: 'print hello world',
				chatVariables: new ChatVariablesCollection([]),
				history: [],
			}
		});
		const promptResult = await renderer.render(progressReporter, CancellationToken.None);
		expect(promptResult.messages.length).toBe(5);
		expect(getTextPart(promptResult.messages[0].content)).contains('AI programming'); // System message
		expect(getTextPart(promptResult.messages[1].content)).contains('I am working on a Jupyter notebook'); // Notebook Document Context
		expect(getTextPart(promptResult.messages[2].content)).contains('Now I edit a cell'); // Current Cell
		expect(getTextPart(promptResult.messages[3].content)).contains('The following variables'); // Variables
		expect(getTextPart(promptResult.messages[4].content)).contains('print hello world'); // User Query
	});

	test('Disable package should not render packages', async function () {
		treatmeants['copilotchat.notebookPackages'] = true;
		const endpoint = accessor.get(IInstantiationService).createInstance(MockEndpoint, undefined);
		const progressReporter = { report() { } };
		const renderer = PromptRenderer.create(accessor.get(IInstantiationService), endpoint, InlineChatNotebookGeneratePrompt, {
			documentContext: contexts[1],
			promptContext: {
				query: 'print hello world',
				chatVariables: new ChatVariablesCollection([]),
				history: [],
			}
		});
		const promptResult = await renderer.render(progressReporter, CancellationToken.None);
		/**
		 * System+Instructions
		 * Notebook Document Context
		 * Current Cell
		 * Variables
		 * User Query
		 */
		expect(promptResult.messages.length).toBe(5);
	});

	test('Priorities: Package should be dropped first', async function () {
		treatmeants['copilotchat.notebookPriorities'] = true;
		const endpoint: IChatEndpoint = {
			modelMaxPromptTokens: 880,
			supportsToolCalls: false,
			supportsVision: false,
			supportsPrediction: false,
			isPremium: false,
			multiplier: 0,
			maxOutputTokens: 4096,
			tokenizer: TokenizerType.O200K,
			modelProvider: 'Test',
			name: 'Test',
			family: 'Test',
			version: 'Test',
			showInModelPicker: false,
			isFallback: false,
			urlOrRequestMetadata: '',
			model: CHAT_MODEL.GPT41,
			acquireTokenizer() {
				return accessor.get(ITokenizerProvider).acquireTokenizer({ tokenizer: TokenizerType.O200K });
			},
			processResponseFromChatEndpoint: async () => { throw new Error('Method not implemented.'); },
			cloneWithTokenOverride: () => endpoint,
			createRequestBody: () => { return {}; },
			makeChatRequest2: () => { throw new Error('Method not implemented.'); },
			makeChatRequest: async () => { throw new Error('Method not implemented.'); },
		};
		const progressReporter = { report() { } };
		const renderer = PromptRenderer.create(accessor.get(IInstantiationService), endpoint, InlineChatNotebookGeneratePrompt, {
			documentContext: contexts[1],
			promptContext: {
				query: 'print hello world',
				chatVariables: new ChatVariablesCollection([]),
				history: [],
			}
		});
		const promptResult = await renderer.render(progressReporter, CancellationToken.None);
		expect(promptResult.messages.length).toBe(5);
		expect(getTextPart(promptResult.messages[3].content)).contains('The following variables'); // Variables
		expect(getTextPart(promptResult.messages[4].content)).contains('print hello world'); // User Query
	});
});
