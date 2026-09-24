/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as DOM from '../../../../../../base/browser/dom.js';
import { Event } from '../../../../../../base/common/event.js';
import { URI } from '../../../../../../base/common/uri.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { CustomizationMarketplaceMediaType, ICustomizationMarketplaceResource } from '../../../../../../platform/customizationMarketplace/common/customizationMarketplaceService.js';
import { INotificationService } from '../../../../../../platform/notification/common/notification.js';
import { workbenchInstantiationService } from '../../../../../test/browser/workbenchTestServices.js';
import { EmbeddedMarketplaceDetail } from '../../../browser/aiCustomization/embeddedMarketplaceDetail.js';
import { ICustomizationMarketplaceInstallService } from '../../../common/customizationMarketplaceInstallService.js';

suite('EmbeddedMarketplaceDetail', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function render(resource: ICustomizationMarketplaceResource) {
		const parent = DOM.append(document.body, DOM.$('.embedded-marketplace-detail-test'));
		store.add({ dispose: () => parent.remove() });
		const instantiationService = workbenchInstantiationService(undefined, store);
		instantiationService.stub(INotificationService, new class extends mock<INotificationService>() { }());
		instantiationService.stub(ICustomizationMarketplaceInstallService, new class extends mock<ICustomizationMarketplaceInstallService>() {
			override readonly onDidChange = Event.None;
			override getInstallState() { return { kind: 'available' as const }; }
		}());
		const detail = store.add(instantiationService.createInstance(EmbeddedMarketplaceDetail, parent, {
			getSourceLabel: () => 'Marketplace',
			install: async () => { },
			openExternal: async () => { },
		}));
		detail.setInput(resource);
		return { detail, parent };
	}

	test('renders skill metadata and semantic lists', () => {
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
		});
		assert.deepStrictEqual({
			heading: parent.querySelector('h2')?.textContent,
			facts: [...parent.querySelectorAll('dt, dd')].map(element => element.textContent),
			sections: [...parent.querySelectorAll('section')].map(section => section.textContent),
			actions: [...parent.querySelectorAll('.embedded-detail-title-actions .monaco-button')].map(element => element.textContent),
			accessible: detail.getAccessibilityContent(),
		}, {
			heading: 'Repository review',
			facts: ['Type', 'Skill', 'Source', 'Marketplace', 'Publisher', 'Example', 'Version', '1.2.0', 'Stars', '42'],
			sections: ['Tagsreview', 'CapabilitiesFind risks', 'Representative queriesReview this change'],
			actions: ['Install', 'Open Resource', 'Open Repository'],
			accessible: 'Repository review\n\nSkill · Marketplace\n\nReviews pull requests.\n\nPublisher: Example\n\nVersion: 1.2.0\n\nStars: 42\n\nAvailable to install\n\nTags: review\n\nCapabilities: Find risks\n\nRepresentative queries: Review this change',
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
			sections: parent.querySelectorAll('section').length,
			actions: [...parent.querySelectorAll('.embedded-detail-title-actions .monaco-button')].map(element => element.textContent),
			accessible: detail.getAccessibilityContent(),
		}, {
			facts: ['Type', 'Skill', 'Source', 'Marketplace'],
			sections: 0,
			actions: ['Install'],
			accessible: 'Project notes\n\nSkill · Marketplace\n\nAvailable to install',
		});
	});
});
