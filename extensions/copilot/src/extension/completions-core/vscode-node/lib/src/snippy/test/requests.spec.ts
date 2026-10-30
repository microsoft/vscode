/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { IAuthenticationService } from '../../../../../../../platform/authentication/common/authentication';
import { BaseCAPIClientService, ICAPIClientService } from '../../../../../../../platform/endpoint/common/capiClient';
import { IEnvService } from '../../../../../../../platform/env/common/envService';
import { NullEnvService } from '../../../../../../../platform/env/common/nullEnvService';
import { IVSCodeExtensionContext } from '../../../../../../../platform/extContext/common/extensionContext';
import { ILogService, LogLevel, LogServiceImpl } from '../../../../../../../platform/log/common/logService';
import { TestLogTarget } from '../../../../../../../platform/log/test/common/loggerHelpers';
import { FetchOptions, IFetcherService } from '../../../../../../../platform/networking/common/fetcherService';
import { INotificationService, NullNotificationService } from '../../../../../../../platform/notification/common/notificationService';
import { SnippyService } from '../../../../../../../platform/snippy/common/snippyServiceImpl';
import { MockExtensionContext } from '../../../../../../../platform/test/node/extensionContext';
import { createFakeResponse } from '../../../../../../../platform/test/node/fetcher';
import { mock } from '../../../../../../../util/common/test/simpleMock';
import { DisposableStore } from '../../../../../../../util/vs/base/common/lifecycle';
import { URI } from '../../../../../../../util/vs/base/common/uri';
import { StringReplacement } from '../../../../../../../util/vs/editor/common/core/edits/stringEdit';
import { OffsetRange } from '../../../../../../../util/vs/editor/common/core/ranges/offsetRange';
import { StringText } from '../../../../../../../util/vs/editor/common/core/text/abstractText';
import { InstantiationService } from '../../../../../../../util/vs/platform/instantiation/common/instantiationService';
import { ServiceCollection } from '../../../../../../../util/vs/platform/instantiation/common/serviceCollection';
import { ICompletionsCopilotTokenManager } from '../../auth/copilotTokenManager';
import { ICompletionsCitationManager, IPDocumentCitation, NoOpCitationManager } from '../../citationManager';
import { DefaultsOnlyConfigProvider, ICompletionsConfigProvider, ICompletionsEditorAndPluginInfo } from '../../config';
import { ICompletionsLogTargetService, LogLevel as CompletionsLogLevel } from '../../logger';
import { ICompletionsFetcherService } from '../../networking';
import { FakeCopilotTokenManager } from '../../test/copilotTokenManager';
import { FakeFetcher } from '../../test/fetcher';
import { TestLogTarget as CompletionsTestLogTarget } from '../../test/loggerHelpers';
import { createTextDocument } from '../../test/textDocument';
import { ITextDocument } from '../../textDocument';
import { ICompletionsTextDocumentManagerService } from '../../textDocumentManager';
import { ConnectionState } from '../connectionState';
import { fetchCitations } from '../handlePostInsertion';

class RecordingFetcher extends mock<IFetcherService>() {
	readonly sources: string[] = [];
	returnMatch = false;
	matchStatus = 200;
	filesStatus = 200;
	matchPayload: object | undefined;
	filesPayload: object = { file_matches: [], page_info: { has_next_page: false, cursor: '' }, license_stats: { count: { MIT: '1' } } };

	override async fetch(_url: string, options: FetchOptions) {
		const body: unknown = options.body === undefined ? options.json : JSON.parse(options.body);
		assert.ok(typeof body === 'object' && body !== null);
		if ('source' in body) {
			assert.ok(typeof body.source === 'string');
			this.sources.push(body.source);
			return createFakeResponse(this.matchStatus, this.matchPayload ?? {
				snippets: this.returnMatch ? [{ matched_source: body.source, occurrences: '1', capped: false, cursor: 'test-cursor', github_url: 'https://example.com/reference' }] : [],
			});
		}
		assert.ok('cursor' in body && body.cursor === 'test-cursor');
		return createFakeResponse(this.filesStatus, this.filesPayload);
	}

	override makeAbortController() {
		return new AbortController();
	}

	override isAbortError() {
		return false;
	}
}

class RecordingCompletionsFetcher extends FakeFetcher {
	constructor(private readonly fetcher: RecordingFetcher) {
		super();
	}

	override fetch(url: string, options: Parameters<FakeFetcher['fetch']>[1]) {
		return this.fetcher.fetch(url, { ...options, callSite: 'snippy-test' });
	}
}

class TestCAPIClient extends BaseCAPIClientService {
	constructor(fetcher: IFetcherService) {
		super(undefined, undefined, fetcher, new NullEnvService());
	}
}

class TestAuthentication extends mock<IAuthenticationService>() {
	override getCopilotToken() {
		return new FakeCopilotTokenManager().getToken();
	}
}

class TestExtensionContext extends mock<IVSCodeExtensionContext>() {
	override readonly globalState = Object.assign(new MockExtensionContext().globalState, { setKeysForSync: () => { } });
}

class TestDocumentManager extends mock<ICompletionsTextDocumentManagerService>() {
	document: ITextDocument | undefined;

	override async getTextDocument() {
		return this.document;
	}
}

class TestEditorInfo implements ICompletionsEditorAndPluginInfo {
	declare readonly _serviceBrand: undefined;
	getEditorInfo() { return { name: 'test-editor', version: '1' }; }
	getEditorPluginInfo() { return { name: 'test-extension', version: '1' }; }
	getRelatedPluginInfo() { return []; }
}

class RecordingCitationManager extends NoOpCitationManager {
	readonly citations: IPDocumentCitation[] = [];

	override async handleIPCodeCitation(citation: IPDocumentCitation) {
		this.citations.push(citation);
	}
}

for (const path of ['completions', 'next-edit'] as const) {
	describe(`Snippy request construction (${path})`, () => {
		const disposables = new DisposableStore();
		let fetcher: RecordingFetcher;
		let documentManager: TestDocumentManager;
		let instantiationService: InstantiationService;
		let logTarget: TestLogTarget;
		let completionsLogTarget: CompletionsTestLogTarget;
		let citationManager: RecordingCitationManager;

		beforeEach(() => {
			fetcher = new RecordingFetcher();
			documentManager = new TestDocumentManager();
			logTarget = new TestLogTarget();
			completionsLogTarget = new CompletionsTestLogTarget();
			citationManager = new RecordingCitationManager();
			const services = new ServiceCollection(
				[IAuthenticationService, new TestAuthentication()],
				[ICAPIClientService, new TestCAPIClient(fetcher)],
				[IEnvService, new NullEnvService()],
				[IVSCodeExtensionContext, new TestExtensionContext()],
				[ILogService, disposables.add(new LogServiceImpl([logTarget]))],
				[IFetcherService, fetcher],
				[INotificationService, new NullNotificationService()],
				[ICompletionsTextDocumentManagerService, documentManager],
				[ICompletionsLogTargetService, completionsLogTarget],
				[ICompletionsCitationManager, citationManager],
				[ICompletionsConfigProvider, new DefaultsOnlyConfigProvider()],
				[ICompletionsEditorAndPluginInfo, new TestEditorInfo()],
				[ICompletionsCopilotTokenManager, new FakeCopilotTokenManager()],
				[ICompletionsFetcherService, new RecordingCompletionsFetcher(fetcher)],
			);
			instantiationService = disposables.add(new InstantiationService(services, true));
			ConnectionState.setConnected();
		});

		afterEach(() => disposables.clear());

		async function insert(completion: string, prefix = '', suffix = '', replaced = '') {
			const uri = URI.file('/snippy-test.ts');
			if (path === 'completions') {
				documentManager.document = createTextDocument(uri.toString(), 'typescript', 1, prefix + completion + suffix);
				await instantiationService.invokeFunction(fetchCitations, uri.toString(), completion, prefix.length);
			} else {
				const service = instantiationService.createInstance(SnippyService);
				await service.handlePostInsertion(uri, new StringText(prefix + replaced + suffix), StringReplacement.replace(new OffsetRange(prefix.length, prefix.length + replaced.length), completion));
			}
			return fetcher.sources;
		}

		test.each([0, 64, 65, 109, 110, 111, 220, 3000])('checks an insertion with %i lexemes', async count => {
			const completion = 'token '.repeat(count);
			expect(await insert(completion)).toEqual(count >= 110 ? [completion] : []);
		});

		test('skips all 65-109-token sources without genuine preceding context', async () => {
			for (let count = 65; count < 110; count++) {
				await insert('token '.repeat(count), '', 'suffix '.repeat(500));
			}
			expect(fetcher.sources).toEqual([]);
		});

		test('takes genuine preceding context, preserving tabs, CRLF and completion content', async () => {
			const tail = 'prefix \t\r\n'.repeat(110);
			expect(await insert('return value;', 'ignored '.repeat(45) + tail, 'suffix '.repeat(500), 'old text')).toEqual([tail + 'return value;']);
		});

		test.each([65, 90, 109])('extends a %i-token insertion rather than skipping it', async count => {
			const completion = 'token '.repeat(count);
			expect(await insert(completion, 'prefix '.repeat(150))).toEqual(['prefix '.repeat(110) + completion]);
		});

		test('accepts exactly 110 lexemes after joining an identifier', async () => {
			const prefix = 'token '.repeat(109) + 'begin';
			expect(await insert('End', prefix)).toEqual([prefix + 'End']);
		});

		test('does not count the two halves of an identifier twice', async () => {
			expect(await insert('End', 'token '.repeat(108) + 'begin', 'suffix '.repeat(500))).toEqual([]);
		});

		test.each(['=', '-', '#', '/', '*'])('retains sufficient genuine context when %s runs merge', async separator => {
			const prefix = 'token '.repeat(109) + separator.repeat(3);
			expect(await insert(separator, prefix)).toEqual([prefix + separator]);
		});

		test('does not split supplementary-plane symbols at the context boundary', async () => {
			expect(await insert('tail', 'ignored ' + '\u{1f600}'.repeat(111))).toEqual(['\u{1f600}'.repeat(110) + 'tail']);
		});

		test('bounds preceding supplementary-plane context instead of exceeding 3000 tokens', async () => {
			expect(await insert('tail', '\u{10400} '.repeat(3001) + 'token '.repeat(70))).toEqual(['\u{10400} '.repeat(40) + 'token '.repeat(70) + 'tail']);
		});

		test('does not submit 105 server lexemes miscounted as 110 by a newer Unicode runtime', async () => {
			expect(await insert('token '.repeat(105) + '\u1c89 '.repeat(5))).toEqual([]);
		});

		test('skips an oversized insertion with a diagnostic rather than truncating it', async () => {
			const requests = await insert('token '.repeat(3001), 'prefix '.repeat(150));
			const logged = path === 'completions'
				? completionsLogTarget.hasMessageMatching(CompletionsLogLevel.DEBUG, /Skipping Snippy.*tooLong/)
				: logTarget.hasMessageMatching(LogLevel.Debug, /Skipping Snippy.*tooLong/);
			expect({ requests, logged }).toEqual({ requests: [], logged: true });
		});

		test('skips an ill-formed insertion with a diagnostic without rewriting its content', async () => {
			const requests = await insert('token '.repeat(110) + '\ud800');
			const logged = path === 'completions'
				? completionsLogTarget.hasMessageMatching(CompletionsLogLevel.DEBUG, /Skipping Snippy.*invalidUnicode/)
				: logTarget.hasMessageMatching(LogLevel.Debug, /Skipping Snippy.*invalidUnicode/);
			expect({ requests, logged }).toEqual({ requests: [], logged: true });
		});

		test('preserves insertion offsets for an unexpanded match after CRLF and supplementary characters', async () => {
			fetcher.returnMatch = true;
			const prefix = '\u{1f600}\r\n';
			const completion = 'token '.repeat(110);
			await insert(completion, prefix);
			if (path === 'completions') {
				expect(citationManager.citations.map(citation => ({
					start: citation.offsetStart,
					end: citation.offsetEnd,
					location: citation.location,
				}))).toEqual([{
					start: prefix.length,
					end: prefix.length + completion.length,
					location: { start: { line: 1, character: 0 }, end: { line: 1, character: completion.length } },
				}]);
			} else {
				expect(logTarget.hasMessageMatching(LogLevel.Info, /\[Ln 2, Col 1\]/)).toBe(true);
			}
		});

		if (path === 'next-edit') {
			test('logs the selected preceding-context start rather than a reversed-text offset', async () => {
				fetcher.returnMatch = true;
				await insert('tail', 'ignored '.repeat(45) + '\r\n' + '\u{10400} '.repeat(110));
				expect(logTarget.hasMessageMatching(LogLevel.Info, /\[Ln 2, Col 1\]/)).toBe(true);
			});

			test.each(['matchHttp', 'matchMalformed', 'matchFailure', 'filesHttp', 'filesMalformed', 'filesFailure'] as const)('propagates %s so the acceptance boundary can log it', async failure => {
				fetcher.returnMatch = true;
				const errorPayload = { kind: 'failure', reason: 'test', code: 400, msg: 'test failure' };
				switch (failure) {
					case 'matchHttp': fetcher.matchStatus = 400; break;
					case 'matchMalformed': fetcher.matchPayload = {}; break;
					case 'matchFailure': fetcher.matchPayload = errorPayload; break;
					case 'filesHttp': fetcher.filesStatus = 400; break;
					case 'filesMalformed': fetcher.filesPayload = {}; break;
					case 'filesFailure': fetcher.filesPayload = errorPayload; break;
				}
				await expect(insert('token '.repeat(110))).rejects.toThrow(/Failed/);
			});
		}
	});
}
