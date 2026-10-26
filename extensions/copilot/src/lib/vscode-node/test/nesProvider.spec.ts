/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Load env
import * as dotenv from 'dotenv';
dotenv.config({ path: '../.env' });

import { promises as fs } from 'fs';
import { outdent } from 'outdent';
import * as path from 'path';
import { assert, describe, expect, it } from 'vitest';
import { CopilotToken, createTestExtendedTokenInfo } from '../../../platform/authentication/common/copilotToken';
import { ICopilotTokenManager } from '../../../platform/authentication/common/copilotTokenManager';
import { DocumentId } from '../../../platform/inlineEdits/common/dataTypes/documentId';
import { MutableObservableWorkspace } from '../../../platform/inlineEdits/common/observableWorkspace';
import { ILanguageDiagnosticsService } from '../../../platform/languages/common/languageDiagnosticsService';
import { TestLanguageDiagnosticsService } from '../../../platform/languages/common/testLanguageDiagnosticsService';
import { FetchOptions, IAbortController, IHeaders, PaginationOptions, Response } from '../../../platform/networking/common/fetcherService';
import { IFetcher } from '../../../platform/networking/common/networking';
import { NullTerminalService } from '../../../platform/terminal/common/terminalService';
import { CancellationToken } from '../../../util/vs/base/common/cancellation';
import { Emitter } from '../../../util/vs/base/common/event';
import { URI } from '../../../util/vs/base/common/uri';
import { StringEdit, StringReplacement } from '../../../util/vs/editor/common/core/edits/stringEdit';
import { OffsetRange } from '../../../util/vs/editor/common/core/ranges/offsetRange';
import { ensureDependenciesAreSet } from '../../../util/vs/editor/common/core/text/positionToOffset';
import { DiagnosticSeverity, Range } from '../../../vscodeTypes';
import { createNESProvider, type INESProviderCapabilities, ILogTarget, ITelemetrySender, LogLevel } from '../../node/chatLibMain';


class TestFetcher implements IFetcher {

	requests: { url: string; options: FetchOptions }[] = [];

	constructor(private readonly responses: Record<string, string>) { }

	getUserAgentLibrary(): string {
		return 'test-fetcher';
	}

	async fetch(url: string, options: FetchOptions): Promise<Response> {
		this.requests.push({ url, options });
		const uri = URI.parse(url);
		const responseText = this.responses[uri.path];

		const headers = new class implements IHeaders {
			get(name: string): string | null {
				return null;
			}
			*[Symbol.iterator](): Iterator<[string, string]> {
				// Empty headers for test
			}
		};

		const found = typeof responseText === 'string';
		const text = responseText || '';
		return Response.fromText(
			found ? 200 : 404,
			found ? 'OK' : 'Not Found',
			headers,
			text,
			'node-http'
		);
	}

	fetchWithPagination<T>(baseUrl: string, options: PaginationOptions<T>): Promise<T[]> {
		throw new Error('Method not implemented.');
	}

	async disconnectAll(): Promise<unknown> {
		return Promise.resolve();
	}

	makeAbortController(): IAbortController {
		return new AbortController();
	}

	isAbortError(e: any): boolean {
		return e && e.name === 'AbortError';
	}

	isInternetDisconnectedError(e: any): boolean {
		return false;
	}

	isFetcherError(e: any): boolean {
		return false;
	}

	isNetworkProcessCrashedError(e: any): boolean {
		return false;
	}

	getUserMessageForFetcherError(err: any): string {
		return `Test fetcher error: ${err.message}`;
	}
}

class TestCopilotTokenManager implements ICopilotTokenManager {
	_serviceBrand: undefined;

	onDidCopilotTokenRefresh = new Emitter<void>().event;
	getCopilotTokenCallCount = 0;

	async getCopilotToken(force?: boolean): Promise<CopilotToken> {
		this.getCopilotTokenCallCount++;
		return new CopilotToken(createTestExtendedTokenInfo({ token: 'fixedToken' }));
	}

	resetCopilotToken(httpError?: number): void {
		// nothing
	}
}

class TestTelemetrySender implements ITelemetrySender {
	events: { eventName: string; properties?: Record<string, string | undefined>; measurements?: Record<string, number | undefined> }[] = [];
	sendTelemetryEvent(eventName: string, properties?: Record<string, string | undefined>, measurements?: Record<string, number | undefined>): void {
		this.events.push({ eventName, properties, measurements });
	}
}

class TestLogTarget implements ILogTarget {
	logs: { level: LogLevel; message: string; metadata?: any }[] = [];
	logIt(level: LogLevel, metadataStr: string, ...extra: any[]): void {
		this.logs.push({ level, message: metadataStr, metadata: extra });
		console.log(`[${LogLevel[level]}]${metadataStr}`, ...extra);
	}
}

describe('NESProvider Facade', () => {
	it('reports when the selected model supports unified completions', async () => {
		const fetcher = new TestFetcher({
			'/models': JSON.stringify({
				models: [{
					serviceType: 'NESChat',
					name: 'unified-model',
					provider: 'test',
					capabilities: { promptStrategy: 'patchBased02Unified' },
				}]
			}),
		});
		const copilotTokenManager = new TestCopilotTokenManager();
		const nextEditProvider = createNESProvider({
			workspace: new MutableObservableWorkspace(),
			fetcher,
			copilotTokenManager,
			telemetrySender: new TestTelemetrySender(),
			terminalService: new NullTerminalService(),
			logTarget: new TestLogTarget(),
			editorInfo: { name: 'my-editor', version: '1.2.3' },
			editorPluginInfo: { name: 'my-plugin', version: '4.5.6' },
		});
		const requestsBeforeQuery = fetcher.requests.length;
		const tokenRequestsBeforeQuery = copilotTokenManager.getCopilotTokenCallCount;
		const capabilityChanges: INESProviderCapabilities[] = [];
		const listener = nextEditProvider.onDidChangeCapabilities(capabilities => capabilityChanges.push(capabilities));

		try {
			const capabilities = await nextEditProvider.getCapabilities();

			assert.deepStrictEqual({
				requestsBeforeQuery,
				tokenRequestsBeforeQuery,
				tokenRequestsAfterQuery: copilotTokenManager.getCopilotTokenCallCount,
				modelRequests: fetcher.requests.filter(request => request.url.endsWith('/models')).length,
				capabilities,
				capabilityChanges,
			}, {
				requestsBeforeQuery: 0,
				tokenRequestsBeforeQuery: 0,
				tokenRequestsAfterQuery: 1,
				modelRequests: 1,
				capabilities: { inlineCompletions: true },
				capabilityChanges: [{ inlineCompletions: true }],
			});
		} finally {
			listener.dispose();
			nextEditProvider.dispose();
		}
	});

	it('reports no inline completion support for a non-unified model', async () => {
		const fetcher = new TestFetcher({
			'/models': JSON.stringify({
				models: [{
					serviceType: 'NESChat',
					name: 'nes-model',
					provider: 'test',
					capabilities: { promptStrategy: 'xtab275' },
				}]
			}),
		});
		const nextEditProvider = createNESProvider({
			workspace: new MutableObservableWorkspace(),
			fetcher,
			copilotTokenManager: new TestCopilotTokenManager(),
			telemetrySender: new TestTelemetrySender(),
			terminalService: new NullTerminalService(),
			logTarget: new TestLogTarget(),
			editorInfo: { name: 'my-editor', version: '1.2.3' },
			editorPluginInfo: { name: 'my-plugin', version: '4.5.6' },
		});
		nextEditProvider.updateTreatmentVariables({
			'config.github.copilot.chat.advanced.inlineEdits.xtabProvider.defaultModelConfigurationString': JSON.stringify({
				modelName: 'default-unified-model',
				promptingStrategy: 'patchBased02Unified',
				includeTagsInCurrentFile: false,
			}),
		});
		const capabilityChanges: INESProviderCapabilities[] = [];
		const listener = nextEditProvider.onDidChangeCapabilities(capabilities => capabilityChanges.push(capabilities));

		try {
			const capabilities = await nextEditProvider.getCapabilities();
			assert.deepStrictEqual({
				modelRequests: fetcher.requests.filter(request => request.url.endsWith('/models')).length,
				capabilities,
				capabilityChanges,
			}, {
				modelRequests: 1,
				capabilities: { inlineCompletions: false },
				capabilityChanges: [{ inlineCompletions: false }],
			});
		} finally {
			listener.dispose();
			nextEditProvider.dispose();
		}
	});

	it('applies the unification treatment to reported capabilities', async () => {
		const fetcher = new TestFetcher({
			'/models': JSON.stringify({
				models: [{
					serviceType: 'NESChat',
					name: 'nes-model',
					provider: 'test',
					capabilities: { promptStrategy: 'xtab275' },
				}]
			}),
		});
		const nextEditProvider = createNESProvider({
			workspace: new MutableObservableWorkspace(),
			fetcher,
			copilotTokenManager: new TestCopilotTokenManager(),
			telemetrySender: new TestTelemetrySender(),
			terminalService: new NullTerminalService(),
			logTarget: new TestLogTarget(),
			editorInfo: { name: 'my-editor', version: '1.2.3' },
			editorPluginInfo: { name: 'my-plugin', version: '4.5.6' },
		});
		nextEditProvider.updateTreatmentVariables({
			'config.github.copilot.chat.advanced.inlineEdits.unification': true,
		});

		try {
			assert.deepStrictEqual(await nextEditProvider.getCapabilities(), { inlineCompletions: true });
		} finally {
			nextEditProvider.dispose();
		}
	});

	it('does not discover server models for a locally configured model', async () => {
		const copilotTokenManager = new TestCopilotTokenManager();
		const fetcher = new TestFetcher({});
		const nextEditProvider = createNESProvider({
			workspace: new MutableObservableWorkspace(),
			fetcher,
			copilotTokenManager,
			telemetrySender: new TestTelemetrySender(),
			terminalService: new NullTerminalService(),
			logTarget: new TestLogTarget(),
			editorInfo: { name: 'my-editor', version: '1.2.3' },
			editorPluginInfo: { name: 'my-plugin', version: '4.5.6' },
		});
		await nextEditProvider.setConfigs(new Map([[
			'chat.inlineEdits.xtabProvider.modelConfiguration',
			{
				modelName: 'local-unified-model',
				promptingStrategy: 'patchBased02Unified',
				includeTagsInCurrentFile: false,
			}
		]]));

		try {
			assert.deepStrictEqual({
				capabilities: await nextEditProvider.getCapabilities(),
				tokenRequests: copilotTokenManager.getCopilotTokenCallCount,
				modelRequests: fetcher.requests.filter(request => request.url.endsWith('/models')).length,
			}, {
				capabilities: { inlineCompletions: true },
				tokenRequests: 0,
				modelRequests: 0,
			});
		} finally {
			nextEditProvider.dispose();
		}
	});

	it('rejects capability discovery when the model list cannot be loaded', async () => {
		const nextEditProvider = createNESProvider({
			workspace: new MutableObservableWorkspace(),
			fetcher: new TestFetcher({}),
			copilotTokenManager: new TestCopilotTokenManager(),
			telemetrySender: new TestTelemetrySender(),
			terminalService: new NullTerminalService(),
			logTarget: new TestLogTarget(),
			editorInfo: { name: 'my-editor', version: '1.2.3' },
			editorPluginInfo: { name: 'my-plugin', version: '4.5.6' },
		});

		try {
			await expect(nextEditProvider.getCapabilities()).rejects.toThrow('Failed to fetch model list: 404 Not Found');
		} finally {
			nextEditProvider.dispose();
		}
	});

	it('cancels capability discovery when the provider is disposed', async () => {
		const nextEditProvider = createNESProvider({
			workspace: new MutableObservableWorkspace(),
			fetcher: new TestFetcher({}),
			copilotTokenManager: new TestCopilotTokenManager(),
			telemetrySender: new TestTelemetrySender(),
			terminalService: new NullTerminalService(),
			logTarget: new TestLogTarget(),
			editorInfo: { name: 'my-editor', version: '1.2.3' },
			editorPluginInfo: { name: 'my-plugin', version: '4.5.6' },
			waitForTreatmentVariables: true,
		});

		const capabilities = nextEditProvider.getCapabilities();
		nextEditProvider.dispose();

		await expect(capabilities).rejects.toThrow('Canceled');
	});

	it('should handle getNextEdit call with a document URI', async () => {
		const workspace = new MutableObservableWorkspace();
		const doc = workspace.addDocument({
			id: DocumentId.create(URI.file('/test/test.ts').toString()),
			initialValue: outdent`
			class Point {
				constructor(
					private readonly x: number,
					private readonly y: number,
				) { }
				getDistance() {
					return Math.sqrt(this.x ** 2 + this.y ** 2);
				}
			}

			const myPoint = new Point(0, 1);`.trimStart()
		});
		doc.setSelection([new OffsetRange(1, 1)], undefined);
		const telemetrySender = new TestTelemetrySender();
		const terminalService = new NullTerminalService();
		const logTarget = new TestLogTarget();
		const fetcher = new TestFetcher({
			'/models': JSON.stringify({ models: [] }),
			'/chat/completions': await fs.readFile(path.join(__dirname, 'nesProvider.reply.txt'), 'utf8'),
		});
		const nextEditProvider = createNESProvider({
			workspace,
			fetcher,
			copilotTokenManager: new TestCopilotTokenManager(),
			telemetrySender,
			terminalService,
			logTarget,
			editorInfo: { name: 'my-editor', version: '1.2.3' },
			editorPluginInfo: { name: 'my-plugin', version: '4.5.6' },
		});
		nextEditProvider.updateTreatmentVariables({
			'config.github.copilot.chat.advanced.inlineEdits.xtabProvider.defaultModelConfigurationString': '{ "modelName": "xtab-test", "promptingStrategy": "copilotNesXtab", "includeTagsInCurrentFile": false }',
		});

		doc.applyEdit(StringEdit.insert(11, '3D'));

		const result = await nextEditProvider.getNextEdit(doc.id.toUri(), CancellationToken.None);

		assert.strictEqual(fetcher.requests.length, 2, `Unexpected requests: ${JSON.stringify(fetcher.requests, null, 2)}`);
		assert.ok(fetcher.requests[0].url.endsWith('/models'), `Unexpected URL: ${fetcher.requests[0].url}`);
		assert.ok(fetcher.requests[1].url.endsWith('/chat/completions'), `Unexpected URL: ${fetcher.requests[1].url}`);

		// The model list request must carry the editor headers derived from the provided editor info.
		assert.deepStrictEqual({
			'Editor-Version': fetcher.requests[0].options.headers?.['Editor-Version'],
			'Editor-Plugin-Version': fetcher.requests[0].options.headers?.['Editor-Plugin-Version'],
		}, {
			'Editor-Version': 'my-editor/1.2.3',
			'Editor-Plugin-Version': 'my-plugin/4.5.6',
		});

		assert(fetcher.requests[1].options.json);
		assert(typeof fetcher.requests[1].options.json === 'object');
		assert('model' in fetcher.requests[1].options.json);
		assert(fetcher.requests[1].options.json.model === 'xtab-test');

		assert(result.result);

		const { range, newText, targetDocumentUri } = result.result;
		assert.strictEqual(targetDocumentUri, doc.id.toString(), 'targetDocumentUri should reference the requested document');
		const offsetRange = OffsetRange.fromTo(range.start, range.endExclusive);
		const replace = StringReplacement.replace(offsetRange, newText);
		doc.applyEdit(replace.toEdit());

		expect(doc.value.get().value).toMatchInlineSnapshot(`
			"class Point3D {
				constructor(
					private readonly x: number,
					private readonly y: number,
					private readonly z: number,
				) { }
				getDistance() {
					return Math.sqrt(this.x ** 2 + this.y ** 2);
				}
			}

			const myPoint = new Point(0, 1);"
		`);

		nextEditProvider.handleAcceptance(result);
		await new Promise(resolve => setTimeout(resolve, 100)); // wait for async telemetry sending
		const event = telemetrySender.events.find(e => e.eventName === 'copilot-nes/provideInlineEdit');
		expect(event).toBeDefined();
		expect(event!.properties?.acceptance).toBe('accepted');

		nextEditProvider.dispose();

		expect(logTarget.logs.length).toBeGreaterThan(0);
		const errorLogs = logTarget.logs.filter(l => l.level === LogLevel.Error);
		assert.strictEqual(errorLogs.length, 0, `Unexpected error logs: ${JSON.stringify(errorLogs, null, 2)}`);
	});

	describe('languageDiagnosticsService injection', () => {

		const sentinelMessage = 'INJECTED_DIAG_SENTINEL_DO_NOT_MATCH_ANYWHERE_ELSE';

		async function runNESRequest(diagnosticsService: ILanguageDiagnosticsService | undefined): Promise<{ payload: string }> {
			const docUri = URI.file('/test/test.ts');
			const workspace = new MutableObservableWorkspace();
			const doc = workspace.addDocument({
				id: DocumentId.create(docUri.toString()),
				initialValue: outdent`
				class Point {
					constructor(
						private readonly x: number,
						private readonly y: number,
					) { }
					getDistance() {
						return Math.sqrt(this.x ** 2 + this.y ** 2);
					}
				}

				const myPoint = new Point(0, 1);`.trimStart()
			});
			doc.setSelection([new OffsetRange(1, 1)], undefined);

			const fetcher = new TestFetcher({
				'/models': JSON.stringify({ models: [] }),
				'/chat/completions': await fs.readFile(path.join(__dirname, 'nesProvider.reply.txt'), 'utf8'),
			});

			const nextEditProvider = createNESProvider({
				workspace,
				fetcher,
				copilotTokenManager: new TestCopilotTokenManager(),
				telemetrySender: new TestTelemetrySender(),
				terminalService: new NullTerminalService(),
				logTarget: new TestLogTarget(),
				languageDiagnosticsService: diagnosticsService,
				editorInfo: { name: 'my-editor', version: '1.2.3' },
				editorPluginInfo: { name: 'my-plugin', version: '4.5.6' },
			});

			nextEditProvider.updateTreatmentVariables({
				'config.github.copilot.chat.advanced.inlineEdits.xtabProvider.defaultModelConfigurationString': JSON.stringify({
					modelName: 'xtab-test',
					promptingStrategy: 'copilotNesXtab',
					includeTagsInCurrentFile: false,
					lintOptions: {
						tagName: 'linter diagnostics',
						warnings: 'yes',
						showCode: 'no',
						maxLints: 5,
						maxLineDistance: 1000,
						nRecentFiles: 0,
					},
				}),
			});

			doc.applyEdit(StringEdit.insert(11, '3D'));

			await nextEditProvider.getNextEdit(doc.id.toUri(), CancellationToken.None);

			const chatRequest = fetcher.requests.find(r => r.url.endsWith('/chat/completions'));
			assert.ok(chatRequest, `Expected a /chat/completions request, got: ${fetcher.requests.map(r => r.url).join(', ')}`);

			nextEditProvider.dispose();

			return { payload: JSON.stringify(chatRequest.options.json) };
		}

		it('forwards the provided ILanguageDiagnosticsService into NES request construction', async () => {
			ensureDependenciesAreSet();

			const diagnosticsService = new TestLanguageDiagnosticsService();
			diagnosticsService.setDiagnostics(URI.file('/test/test.ts'), [{
				message: sentinelMessage,
				range: new Range(0, 0, 0, 5),
				severity: DiagnosticSeverity.Error,
			}]);

			const { payload } = await runNESRequest(diagnosticsService);

			expect(payload).toContain(sentinelMessage);
		});

		it('falls back to an empty diagnostics source when none is provided', async () => {
			ensureDependenciesAreSet();

			const { payload } = await runNESRequest(undefined);

			expect(payload).not.toContain(sentinelMessage);
		});
	});
});
