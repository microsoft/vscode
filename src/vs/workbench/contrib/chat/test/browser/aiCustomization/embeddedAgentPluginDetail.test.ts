/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { VSBuffer, bufferToStream } from '../../../../../../base/common/buffer.js';
import { Event } from '../../../../../../base/common/event.js';
import { URI } from '../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IRequestContext } from '../../../../../../base/parts/request/common/request.js';
import { FileOperationError, FileOperationResult, IFileService } from '../../../../../../platform/files/common/files.js';
import { IRequestService } from '../../../../../../platform/request/common/request.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { AgentPluginItemKind, IAgentPluginItem, IMarketplacePluginItem } from '../../../browser/agentPluginEditor/agentPluginItems.js';
import { getPluginVersion, loadPluginReadme, PluginReadmeRenderGuard } from '../../../browser/aiCustomization/embeddedAgentPluginDetail.js';
import { MarketplaceType, PluginSourceKind } from '../../../common/plugins/pluginMarketplaceService.js';
import { parseMarketplaceReference } from '../../../common/plugins/marketplaceReference.js';
import { IAgentPlugin } from '../../../common/plugins/agentPluginService.js';

class StatusRequestService extends mock<IRequestService>() {
	override readonly onDidCompleteRequest = Event.None;
	readonly requests: string[] = [];

	constructor(
		private readonly statusCode: number,
		private readonly body: string,
	) {
		super();
	}

	override async request(options: { readonly url?: string }): Promise<IRequestContext> {
		this.requests.push(options.url ?? '');
		return {
			res: { statusCode: this.statusCode, headers: {} },
			stream: bufferToStream(VSBuffer.fromString(this.body)),
		};
	}
}

function createMarketplaceItem(readmeUri: URI): IMarketplacePluginItem {
	return {
		kind: AgentPluginItemKind.Marketplace,
		name: 'example',
		description: 'Example plugin',
		version: '1.2.3',
		source: 'plugins/example',
		sourceDescriptor: { kind: PluginSourceKind.RelativePath, path: 'plugins/example' },
		marketplace: 'owner/repo',
		marketplaceReference: parseMarketplaceReference('owner/repo')!,
		marketplaceType: MarketplaceType.Copilot,
		readmeUri,
	};
}

suite('embeddedAgentPluginDetail', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const fileService = new class extends mock<IFileService>() { }();

	test('invalidates overlapping renders for the same plugin', () => {
		const guard = new PluginReadmeRenderGuard();
		const first = guard.begin();
		const second = guard.begin();

		assert.deepStrictEqual({
			firstCurrent: guard.isCurrent(first),
			secondCurrent: guard.isCurrent(second),
		}, {
			firstCurrent: false,
			secondCurrent: true,
		});
	});

	test('reads marketplace plugin versions', () => {
		assert.strictEqual(
			getPluginVersion(createMarketplaceItem(URI.parse('https://example.test/README.md'))),
			'1.2.3',
		);
	});

	test('uses the fetched README URI as the Markdown base URI', async () => {
		const requestService = new StatusRequestService(200, '[Guide](./docs/guide.md)');
		const readme = await loadPluginReadme(
			createMarketplaceItem(URI.parse('https://github.com/owner/repo/blob/main/plugins/example/README.md')),
			fileService,
			requestService,
		);

		assert.deepStrictEqual({
			content: readme?.content,
			baseUri: readme?.baseUri.toString(),
			requests: requestService.requests,
		}, {
			content: '[Guide](./docs/guide.md)',
			baseUri: 'https://raw.githubusercontent.com/owner/repo/main/plugins/example/README.md',
			requests: ['https://raw.githubusercontent.com/owner/repo/main/plugins/example/README.md'],
		});
	});

	test('treats a missing installed README as expected absence', async () => {
		const item = {
			kind: AgentPluginItemKind.Installed,
			name: 'example',
			description: 'Example plugin',
			plugin: new class extends mock<IAgentPlugin>() {
				override readonly uri = URI.file('/plugins/example');
			}(),
		} satisfies IAgentPluginItem;
		const readme = await loadPluginReadme(
			item,
			{
				readFile: async () => {
					throw new FileOperationError('Not found', FileOperationResult.FILE_NOT_FOUND);
				},
			},
			new StatusRequestService(200, ''),
		);

		assert.strictEqual(readme, undefined);
	});

	test('rejects HTTP error response bodies', async () => {
		const results: string[] = [];
		for (const statusCode of [404, 500]) {
			try {
				await loadPluginReadme(
					createMarketplaceItem(URI.parse('https://example.test/README.md')),
					fileService,
					new StatusRequestService(statusCode, `${statusCode}: Not Found`),
				);
				results.push('resolved');
			} catch (error) {
				results.push(error instanceof Error ? error.message : String(error));
			}
		}

		assert.deepStrictEqual(results, ['Server returned 404', 'Server returned 500']);
	});
});
