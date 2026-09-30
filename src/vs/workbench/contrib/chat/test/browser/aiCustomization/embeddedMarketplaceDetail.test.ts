/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as DOM from '../../../../../../base/browser/dom.js';
import { timeout } from '../../../../../../base/common/async.js';
import { bufferToStream, VSBuffer } from '../../../../../../base/common/buffer.js';
import { Event } from '../../../../../../base/common/event.js';
import { URI } from '../../../../../../base/common/uri.js';
import { IRequestContext } from '../../../../../../base/parts/request/common/request.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { CustomizationMarketplaceMediaType, ICustomizationMarketplaceResource } from '../../../../../../platform/customizationMarketplace/common/customizationMarketplaceService.js';
import { INotificationService } from '../../../../../../platform/notification/common/notification.js';
import { IRequestService } from '../../../../../../platform/request/common/request.js';
import { workbenchInstantiationService } from '../../../../../test/browser/workbenchTestServices.js';
import { EmbeddedMarketplaceDetail } from '../../../browser/aiCustomization/embeddedMarketplaceDetail.js';
import { ICustomizationMarketplaceInstallService } from '../../../common/customizationMarketplaceInstallService.js';

suite('EmbeddedMarketplaceDetail', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function render(resource: ICustomizationMarketplaceResource, readmeContent?: string) {
		const parent = DOM.append(document.body, DOM.$('.embedded-marketplace-detail-test'));
		store.add({ dispose: () => parent.remove() });
		const instantiationService = workbenchInstantiationService(undefined, store);
		instantiationService.stub(INotificationService, new class extends mock<INotificationService>() { }());
		instantiationService.stub(ICustomizationMarketplaceInstallService, new class extends mock<ICustomizationMarketplaceInstallService>() {
			override readonly onDidChange = Event.None;
			override getInstallState() { return { kind: 'available' as const }; }
		}());
		instantiationService.stub(IRequestService, new class extends mock<IRequestService>() {
			override async request(): Promise<IRequestContext> {
				return {
					res: { statusCode: 200, headers: {} },
					stream: bufferToStream(VSBuffer.fromString(readmeContent ?? '')),
				};
			}
		}());
		const detail = store.add(instantiationService.createInstance(EmbeddedMarketplaceDetail, parent, {
			getSourceLabel: () => 'Marketplace',
			install: async () => { },
			openExternal: async () => { },
		}));
		detail.setInput(resource);
		return { detail, parent };
	}

	test('renders ordered metadata and representative queries', () => {
		const { detail, parent } = render({
			sourceId: 'test',
			identifier: 'review',
			displayName: 'Repository review',
			description: 'Reviews pull requests.',
			mediaType: CustomizationMarketplaceMediaType.Skill,
			publisher: 'Example',
			version: '1.2.0',
			stars: 42,
			tags: ['review'],
			capabilities: ['Find risks'],
			representativeQueries: ['Review this change'],
			url: URI.parse('https://example.com/review'),
			repository: URI.parse('https://github.com/example/review'),
			icon: URI.parse('https://example.com/review.svg'),
		});
		assert.deepStrictEqual({
			heading: parent.querySelector('h2')?.textContent,
			icon: parent.querySelector<HTMLImageElement>('.marketplace-detail-icon img')?.getAttribute('src'),
			facts: [...parent.querySelectorAll('dt, dd')].map(element => element.textContent),
			queries: [...parent.querySelectorAll('.marketplace-detail-query-list li')].map(element => element.textContent),
			links: [...parent.querySelectorAll('.embedded-detail-fact-link')].map(element => element.textContent),
			actions: [...parent.querySelectorAll('.embedded-detail-title-actions .monaco-button')].map(element => element.textContent),
			accessible: detail.getAccessibilityContent(),
		}, {
			heading: 'Repository review',
			icon: 'https://example.com/review.svg',
			facts: ['Type', 'Skill', 'Publisher', 'Example', 'Version', '1.2.0', 'Source', 'Marketplace', 'Tags', 'review', 'Repository', 'example/review'],
			queries: ['Review this change'],
			links: ['Marketplace', 'example/review'],
			actions: ['Install'],
			accessible: 'Repository review\n\nAvailable to install\n\nReviews pull requests.\n\nTry this: Review this change\n\nType: Skill\n\nPublisher: Example\n\nVersion: 1.2.0\n\nSource: Marketplace\n\nTags: review\n\nRepository: example/review',
		});
	});

	test('omits absent optional metadata', () => {
		const { detail, parent } = render({
			sourceId: 'test',
			identifier: 'notes',
			displayName: 'Project notes',
			description: '',
			mediaType: CustomizationMarketplaceMediaType.Skill,
			tags: [],
			capabilities: [],
			representativeQueries: [],
		});
		assert.deepStrictEqual({
			facts: [...parent.querySelectorAll('dt, dd')].map(element => element.textContent),
			queries: parent.querySelectorAll('.marketplace-detail-query-list li').length,
			actions: [...parent.querySelectorAll('.embedded-detail-title-actions .monaco-button')].map(element => element.textContent),
			accessible: detail.getAccessibilityContent(),
		}, {
			facts: ['Type', 'Skill', 'Source', 'Marketplace'],
			queries: 0,
			actions: ['Install'],
			accessible: 'Project notes\n\nAvailable to install\n\nType: Skill\n\nSource: Marketplace',
		});
	});

	test('fetches and renders the plugin README inline without a Contains section', async () => {
		const { parent } = render({
			sourceId: 'test',
			identifier: 'frontend-design',
			displayName: 'Frontend Design',
			description: 'Design UI.',
			mediaType: CustomizationMarketplaceMediaType.CopilotPlugin,
			tags: [],
			capabilities: [],
			representativeQueries: [],
			installation: { kind: 'plugin', repository: 'example/frontend-design', ref: 'main', path: '' },
			readmeUri: URI.parse('https://raw.githubusercontent.com/example/frontend-design/main/README.md'),
		}, '# Frontend Design\n\nUse the design system.');

		await timeout(0);

		assert.deepStrictEqual({
			contains: parent.querySelector('.plugin-detail-contributions')?.textContent,
			readme: parent.querySelector('.plugin-detail-readme-content')?.textContent,
		}, {
			contains: undefined,
			readme: 'Frontend Design\nUse the design system.',
		});
	});
});
