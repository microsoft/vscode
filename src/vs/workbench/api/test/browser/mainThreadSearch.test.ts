/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../base/common/network.js';
import { URI, UriComponents } from '../../../../base/common/uri.js';
import { mock } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../platform/configuration/test/common/testConfigurationService.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { TestInstantiationService } from '../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { MockContextKeyService } from '../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { NullTelemetryService } from '../../../../platform/telemetry/common/telemetryUtils.js';
import { IFileMatch, ISearchCompleteStats, ISearchResultProvider, ISearchService, isFileMatch, QueryType, SearchProviderType } from '../../../services/search/common/search.js';
import { MainThreadSearch } from '../../browser/mainThreadSearch.js';
import { ExtHostSearchShape } from '../../common/extHost.protocol.js';
import { SingleProxyRPCProtocol } from '../common/testRPCProtocol.js';

suite('MainThreadSearch', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	const folder = URI.from({ scheme: Schemas.vscodeRemote, authority: 'ssh-remote+host', path: '/workspace' });

	function createSearch(type: SearchProviderType, provide: (session: number) => Promise<ISearchCompleteStats>) {
		const instantiationService = disposables.add(new TestInstantiationService());
		let provider: ISearchResultProvider | undefined;
		instantiationService.stub(ISearchService, {
			registerSearchResultProvider(_scheme, _type, value) {
				provider = value;
				return Disposable.None;
			}
		});
		instantiationService.stub(ITelemetryService, NullTelemetryService);
		instantiationService.stub(IConfigurationService, new TestConfigurationService());
		instantiationService.stub(IContextKeyService, new MockContextKeyService());

		const proxy = new class extends mock<ExtHostSearchShape>() {
			override $enableExtensionHostSearch(): void { }
			override $provideFileSearchResults(_handle: number, session: number): Promise<ISearchCompleteStats> {
				return provide(session);
			}
			override $provideTextSearchResults(_handle: number, session: number): Promise<ISearchCompleteStats> {
				return provide(session);
			}
		};
		const customer = disposables.add(instantiationService.createInstance(MainThreadSearch, SingleProxyRPCProtocol(proxy)));
		if (type === SearchProviderType.file) {
			customer.$registerFileSearchProvider(0, folder.scheme);
		} else {
			customer.$registerTextSearchProvider(0, folder.scheme);
		}
		assert.ok(provider);
		return { customer, provider };
	}

	function components({ scheme, authority, path, query, fragment }: URI): UriComponents {
		return { scheme, authority, path, query, fragment };
	}

	test('file search preserves components, ordering, and duplicates across batches', async () => {
		const resources = [
			folder.with({ path: '/workspace/a #?%é.txt', query: 'q=#?', fragment: 'part #1' }),
			URI.from({ scheme: Schemas.file, path: '/C:/workspace/Mixed.txt' }),
			URI.from({ scheme: Schemas.https, authority: 'user:pass@EXAMPLE.COM:8080', path: '/D:/Case.txt' }),
			folder.with({ authority: 'SSH-REMOTE+HOST', path: '/workspace/case.txt' }),
			folder.with({ path: '/workspace/a//b.txt' }),
			folder.with({ path: '/workspace/a/b.txt' })
		];
		const { customer, provider } = createSearch(SearchProviderType.file, async session => {
			customer.$handleFileMatch(0, session, resources.slice(0, 3).map(uri => uri.toJSON()));
			await Promise.resolve();
			customer.$handleFileMatch(0, session, [
				...resources.slice(3).map(uri => uri.toJSON()),
				resources[3].with({ authority: 'ssh-remote+host' }).toJSON(),
				resources[0].toJSON()
			]);
			return { messages: [], limitHit: false };
		});

		const result = await provider.fileSearch({ type: QueryType.File, folderQueries: [{ folder }] });
		assert.deepStrictEqual({
			resources: result.results.map(match => components(match.resource)),
			limitHit: result.limitHit
		}, { resources: resources.map(components), limitHit: false });
	});

	test('file search returns all results across large batches', async () => {
		const count = 25005;
		const { customer, provider } = createSearch(SearchProviderType.file, async session => {
			for (let start = 0; start < count; start += 512) {
				customer.$handleFileMatch(0, session, Array.from({ length: Math.min(512, count - start) }, (_, index) =>
					folder.with({ path: `/workspace/file-${start + index}.txt` }).toJSON()));
			}
			return { messages: [] };
		});

		const result = await provider.fileSearch({ type: QueryType.File, folderQueries: [{ folder }] });
		assert.deepStrictEqual(result.results.map(match => match.resource.path),
			Array.from({ length: count }, (_, index) => `/workspace/file-${index}.txt`));
	});

	test('file search does not retain URI objects for ordinary or mixed-case remote authorities', async () => {
		const resources = [
			folder.with({ path: '/workspace/ordinary.txt' }),
			folder.with({ authority: 'wsl+Ubuntu', path: '/workspace/first.txt' }),
			folder.with({ authority: 'wsl+UBUNTU', path: '/workspace/second.txt' }),
			folder.with({ authority: 'wsl+Ubuntu', path: '/workspace/third.txt' })
		];
		let retainedTypes: string[] = [];
		const { customer, provider } = createSearch(SearchProviderType.file, async session => {
			customer.$handleFileMatch(0, session, resources.map(uri => uri.toJSON()));
			const searches: Map<number, { matches: Map<string, IFileMatch | string | undefined> }> = Reflect.get(provider, '_searches');
			retainedTypes = [...searches.get(session)!.matches.values()].map(value => typeof value);
			return { messages: [] };
		});

		const result = await provider.fileSearch({ type: QueryType.File, folderQueries: [{ folder }] });
		assert.deepStrictEqual({
			retainedTypes,
			resources: result.results.map(match => components(match.resource))
		}, {
			retainedTypes: ['undefined', 'string', 'string', 'string'],
			resources: resources.map(components)
		});
	});

	test('text search still merges matches and reports progress', async () => {
		const resource = folder.with({ path: '/workspace/file.txt' });
		const progress: IFileMatch[] = [];
		const { customer, provider } = createSearch(SearchProviderType.text, async session => {
			customer.$handleTextMatch(0, session, [{ resource: resource.toJSON(), results: [{ text: 'first', lineNumber: 1 }] }]);
			customer.$handleTextMatch(0, session, [{ resource: resource.toJSON(), results: [{ text: 'second', lineNumber: 2 }] }]);
			return { messages: [] };
		});

		const result = await provider.textSearch({
			type: QueryType.Text,
			folderQueries: [{ folder }],
			contentPattern: { pattern: 'text' }
		}, item => {
			if (isFileMatch(item)) {
				progress.push(item);
			}
		}, CancellationToken.None);
		assert.deepStrictEqual({
			results: result.results.map(match => ({ resource: components(match.resource), results: match.results })),
			progressCount: progress.length
		}, {
			results: [{ resource: components(resource), results: [{ text: 'first', lineNumber: 1 }, { text: 'second', lineNumber: 2 }] }],
			progressCount: 2
		});
	});
});
