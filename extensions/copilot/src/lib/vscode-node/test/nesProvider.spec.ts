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
import { FetchOptions, IAbortController, IHeaders, PaginationOptions, Response } from '../../../platform/networking/common/fetcherService';
import { IFetcher } from '../../../platform/networking/common/networking';
import { NullTerminalService } from '../../../platform/terminal/common/terminalService';
import { CancellationToken } from '../../../util/vs/base/common/cancellation';
import { Emitter } from '../../../util/vs/base/common/event';
import { URI } from '../../../util/vs/base/common/uri';
import { StringEdit, StringReplacement } from '../../../util/vs/editor/common/core/edits/stringEdit';
import { OffsetRange } from '../../../util/vs/editor/common/core/ranges/offsetRange';
import { createNESProvider, ILogTarget, ITelemetrySender, LogLevel } from '../../node/chatLibMain';


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

	async getCopilotToken(force?: boolean): Promise<CopilotToken> {
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
		});
		nextEditProvider.updateTreatmentVariables({
			'config.github.copilot.chat.advanced.inlineEdits.xtabProvider.defaultModelConfigurationString': '{ "modelName": "xtab-test", "promptingStrategy": "copilotNesXtab", "includeTagsInCurrentFile": false }',
		});

		doc.applyEdit(StringEdit.insert(11, '3D'));

		const result = await nextEditProvider.getNextEdit(doc.id.toUri(), CancellationToken.None);

		assert.strictEqual(fetcher.requests.length, 2, `Unexpected requests: ${JSON.stringify(fetcher.requests, null, 2)}`);
		assert.ok(fetcher.requests[0].url.endsWith('/models'), `Unexpected URL: ${fetcher.requests[0].url}`);
		assert.ok(fetcher.requests[1].url.endsWith('/chat/completions'), `Unexpected URL: ${fetcher.requests[1].url}`);

		assert(fetcher.requests[1].options.json);
		assert(typeof fetcher.requests[1].options.json === 'object');
		assert('model' in fetcher.requests[1].options.json);
		assert(fetcher.requests[1].options.json.model === 'xtab-test');

		assert(result.result);

		const { range, newText } = result.result;
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
});
