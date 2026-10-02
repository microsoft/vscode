/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as DOM from '../../../../../../base/browser/dom.js';
import { timeout } from '../../../../../../base/common/async.js';
import { bufferToStream, VSBuffer } from '../../../../../../base/common/buffer.js';
import { Emitter } from '../../../../../../base/common/event.js';
import { URI } from '../../../../../../base/common/uri.js';
import { IRequestContext } from '../../../../../../base/parts/request/common/request.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { CustomizationMarketplaceMediaType, ICustomizationMarketplaceResource } from '../../../../../../platform/customizationMarketplace/common/customizationMarketplaceService.js';
import { INotificationService, NotificationMessage } from '../../../../../../platform/notification/common/notification.js';
import { IRequestService } from '../../../../../../platform/request/common/request.js';
import { workbenchInstantiationService } from '../../../../../test/browser/workbenchTestServices.js';
import { EmbeddedMarketplaceDetail } from '../../../browser/aiCustomization/embeddedMarketplaceDetail.js';
import { CustomizationMarketplaceInstallState, ICustomizationMarketplaceInstallService } from '../../../common/customizationMarketplaceInstallService.js';

suite('EmbeddedMarketplaceDetail', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function render(
		resource: ICustomizationMarketplaceResource,
		readmeContent?: string,
		actions: {
			readonly install?: (resource: ICustomizationMarketplaceResource) => Promise<void>;
			readonly repair?: (resource: ICustomizationMarketplaceResource) => Promise<void>;
			readonly runPrompt?: (prompt: string) => Promise<void>;
			readonly installState?: CustomizationMarketplaceInstallState;
		} = {},
	) {
		const parent = DOM.append(document.body, DOM.$('.embedded-marketplace-detail-test'));
		store.add({ dispose: () => parent.remove() });
		const instantiationService = workbenchInstantiationService(undefined, store);
		const installChangeEmitter = store.add(new Emitter<void>());
		let installState = actions.installState ?? { kind: 'available' };
		const errors: string[] = [];
		let requestCount = 0;
		let installCount = 0;
		let repairCount = 0;
		let uninstallCount = 0;
		const openedExternal: Array<URI | string> = [];
		instantiationService.stub(INotificationService, new class extends mock<INotificationService>() {
			override error(message: NotificationMessage | NotificationMessage[]): void {
				errors.push(String(message));
			}
		}());
		instantiationService.stub(ICustomizationMarketplaceInstallService, new class extends mock<ICustomizationMarketplaceInstallService>() {
			override readonly onDidChange = installChangeEmitter.event;
			override getInstallState() { return installState; }
			override async repair(resource: ICustomizationMarketplaceResource): Promise<void> {
				repairCount++;
				await actions.repair?.(resource);
				installState = { kind: 'installed', target: { kind: 'skill', uri: URI.file('/installed') } };
			}
			override async uninstall() { uninstallCount++; }
		}());
		instantiationService.stub(IRequestService, new class extends mock<IRequestService>() {
			override async request(): Promise<IRequestContext> {
				requestCount++;
				return {
					res: { statusCode: 200, headers: {} },
					stream: bufferToStream(VSBuffer.fromString(readmeContent ?? '')),
				};
			}
		}());
		const detail = store.add(instantiationService.createInstance(EmbeddedMarketplaceDetail, parent, {
			getSourceLabel: () => 'Marketplace',
			install: async resource => {
				installCount++;
				await actions.install?.(resource);
				installState = { kind: 'installed', target: { kind: 'skill', uri: URI.file('/installed') } };
			},
			runPrompt: actions.runPrompt ?? (async () => { }),
			openExternal: async resource => { openedExternal.push(resource); },
		}));
		detail.setInput(resource);
		return {
			detail,
			parent,
			fireInstallChange: () => installChangeEmitter.fire(),
			getRequestCount: () => requestCount,
			getActionCounts: () => ({ installCount, repairCount, uninstallCount }),
			getOpenedExternal: () => openedExternal.map(resource => typeof resource === 'string' ? resource : resource.toString()),
			getErrors: () => errors,
		};
	}

	test('renders ordered metadata and representative queries', async () => {
		const { detail, parent, getOpenedExternal } = render({
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
		parent.querySelector<HTMLElement>('.embedded-detail-publisher')?.click();
		await timeout(0);
		assert.deepStrictEqual({
			heading: parent.querySelector('h2')?.textContent,
			publisher: parent.querySelector<HTMLElement>('.embedded-detail-publisher')?.textContent,
			publisherHref: parent.querySelector<HTMLAnchorElement>('.embedded-detail-publisher')?.getAttribute('href'),
			icon: parent.querySelector<HTMLImageElement>('.marketplace-detail-icon img')?.getAttribute('src'),
			facts: [...parent.querySelectorAll('dt, dd')].map(element => element.textContent),
			queries: [...parent.querySelectorAll('.marketplace-detail-query-text')].map(element => element.textContent),
			queryActionIcons: [...parent.querySelectorAll('.marketplace-detail-query-action .codicon')].map(element => element.className),
			links: [...parent.querySelectorAll('.embedded-detail-fact-link')].map(element => element.textContent),
			actions: [...parent.querySelectorAll('.embedded-detail-title-actions .monaco-button')].map(element => element.textContent),
			openedExternal: getOpenedExternal(),
			accessible: detail.getAccessibilityContent(),
		}, {
			heading: 'Repository review',
			publisher: 'Example',
			publisherHref: 'https://github.com/example',
			icon: 'https://example.com/review.svg',
			facts: ['Type', 'Skill', 'Publisher', 'Example', 'Version', '1.2.0', 'Source', 'Marketplace', 'Tags', 'review', 'Repository', 'example/review'],
			queries: ['Review this change'],
			queryActionIcons: ['codicon codicon-arrow-up-compact'],
			links: ['Example', 'Marketplace', 'example/review'],
			actions: ['Install'],
			openedExternal: ['https://github.com/example'],
			accessible: 'Repository review\n\nExample\n\nReviews pull requests.\n\nTry this: Review this change\n\nType: Skill\n\nPublisher: Example\n\nVersion: 1.2.0\n\nSource: Marketplace\n\nTags: review\n\nRepository: example/review',
		});
	});

	test('installs the item before running a representative query', async () => {
		const calls: string[] = [];
		const resource: ICustomizationMarketplaceResource = {
			sourceId: 'test',
			identifier: 'review',
			displayName: 'Repository review',
			description: 'Reviews pull requests.',
			mediaType: CustomizationMarketplaceMediaType.Skill,
			tags: [],
			capabilities: [],
			representativeQueries: ['Review this change'],
		};
		const { parent } = render(resource, undefined, {
			install: async installedResource => { calls.push(`install:${installedResource.identifier}`); },
			runPrompt: async prompt => { calls.push(`prompt:${prompt}`); },
		});

		parent.querySelector<HTMLElement>('.marketplace-detail-query-button')?.click();
		await timeout(0);

		assert.deepStrictEqual({
			calls,
			label: parent.querySelector('.marketplace-detail-query-text')?.textContent,
			ariaLabel: parent.querySelector('.marketplace-detail-query-button')?.getAttribute('aria-label'),
			ariaBusy: parent.querySelector('.marketplace-detail-query-button')?.getAttribute('aria-busy'),
		}, {
			calls: ['install:review', 'prompt:Review this change'],
			label: 'Review this change',
			ariaLabel: 'Install Repository review and run prompt: Review this change',
			ariaBusy: null,
		});
	});

	test('repairs a missing item before running a representative query', async () => {
		const calls: string[] = [];
		const resource: ICustomizationMarketplaceResource = {
			sourceId: 'test',
			identifier: 'review',
			displayName: 'Repository review',
			description: 'Reviews pull requests.',
			mediaType: CustomizationMarketplaceMediaType.Skill,
			tags: [],
			capabilities: [],
			representativeQueries: ['Review this change'],
		};
		const { parent } = render(resource, undefined, {
			installState: { kind: 'missing', target: { kind: 'skill', uri: URI.file('/missing') } },
			repair: async repairedResource => { calls.push(`repair:${repairedResource.identifier}`); },
			runPrompt: async prompt => { calls.push(`prompt:${prompt}`); },
		});

		parent.querySelector<HTMLElement>('.marketplace-detail-query-button')?.click();
		await timeout(0);

		assert.deepStrictEqual(calls, ['repair:review', 'prompt:Review this change']);
	});

	test('does not run a representative query from a non-runnable install state', async () => {
		const calls: string[] = [];
		const resource: ICustomizationMarketplaceResource = {
			sourceId: 'test',
			identifier: 'review',
			displayName: 'Repository review',
			description: 'Reviews pull requests.',
			mediaType: CustomizationMarketplaceMediaType.Skill,
			tags: [],
			capabilities: [],
			representativeQueries: ['Review this change'],
		};
		const { parent, getErrors } = render(resource, undefined, {
			installState: { kind: 'error', target: { kind: 'skill', uri: URI.file('/broken') }, message: 'Broken' },
			runPrompt: async prompt => { calls.push(prompt); },
		});

		parent.querySelector<HTMLElement>('.marketplace-detail-query-button')?.click();
		await timeout(0);

		assert.deepStrictEqual({
			calls,
			errors: getErrors(),
		}, {
			calls: [],
			errors: ['Could not run the prompt with Repository review. The customization cannot run while its state is: Installation error: Broken.'],
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
			publisherDisplay: parent.querySelector<HTMLElement>('.embedded-detail-publisher')?.style.display,
			actions: [...parent.querySelectorAll('.embedded-detail-title-actions .monaco-button')].map(element => element.textContent),
			accessible: detail.getAccessibilityContent(),
		}, {
			facts: ['Type', 'Skill', 'Source', 'Marketplace'],
			queries: 0,
			publisherDisplay: 'none',
			actions: ['Install'],
			accessible: 'Project notes\n\nType: Skill\n\nSource: Marketplace',
		});
	});

	test('uses connection actions for Copilot connectors', async () => {
		const resource: ICustomizationMarketplaceResource = {
			sourceId: 'connectors',
			identifier: 'mail',
			displayName: 'Mail',
			description: 'Search mail.',
			mediaType: CustomizationMarketplaceMediaType.McpServer,
			publisher: 'GitHub Copilot',
			tags: [],
			capabilities: [],
			representativeQueries: [],
			installation: { kind: 'copilotConnector', name: 'mail' },
		};
		const available = render(resource);
		const installed = render(resource, undefined, { installState: { kind: 'installed', target: { kind: 'copilotConnector', name: 'mail' } } });

		available.parent.querySelector<HTMLElement>('.embedded-detail-title-actions .monaco-button')?.click();
		installed.parent.querySelector<HTMLElement>('.embedded-detail-title-actions .monaco-button')?.click();
		await timeout(0);

		assert.deepStrictEqual({
			availableAction: available.parent.querySelector('.embedded-detail-title-actions .monaco-button')?.textContent,
			installedAction: installed.parent.querySelector('.embedded-detail-title-actions .monaco-button')?.textContent,
			availableCounts: available.getActionCounts(),
			installedCounts: installed.getActionCounts(),
		}, {
			availableAction: 'Connect',
			installedAction: 'Disconnect',
			availableCounts: { installCount: 1, repairCount: 0, uninstallCount: 0 },
			installedCounts: { installCount: 0, repairCount: 0, uninstallCount: 1 },
		});
	});

	test('renders failure states and repairs missing customizations', async () => {
		const resource: ICustomizationMarketplaceResource = {
			sourceId: 'test',
			identifier: 'review',
			displayName: 'Repository review',
			description: 'Reviews pull requests.',
			mediaType: CustomizationMarketplaceMediaType.Skill,
			tags: [],
			capabilities: [],
			representativeQueries: [],
		};
		const target = { kind: 'skill' as const, uri: URI.file('C:\\skills\\review') };
		const missing = render(resource, undefined, { installState: { kind: 'missing', target } });
		const blockedMissing = render(resource, undefined, { installState: { kind: 'missing', target, repairUnavailableMessage: 'The source is no longer available.' } });
		const error = render(resource, undefined, { installState: { kind: 'error', target, message: 'Installation failed.' } });
		const unavailable = render(resource, undefined, { installState: { kind: 'unavailable', message: 'This item requires a newer version.' } });

		missing.parent.querySelector<HTMLElement>('.embedded-detail-title-actions .monaco-button')?.click();
		await timeout(0);

		const state = (result: ReturnType<typeof render>) => ({
			banner: result.parent.querySelector('.mcp-detail-diagnostic-card')?.textContent,
			bannerClass: result.parent.querySelector('.mcp-detail-diagnostic-card')?.className,
			action: result.parent.querySelector<HTMLElement>('.embedded-detail-title-actions .monaco-button')?.textContent,
			actionDisabled: result.parent.querySelector<HTMLElement>('.embedded-detail-title-actions .monaco-button')?.classList.contains('disabled'),
			accessible: result.detail.getAccessibilityContent(),
		});
		assert.deepStrictEqual({
			missing: state(missing),
			missingCounts: missing.getActionCounts(),
			blockedMissing: state(blockedMissing),
			error: state(error),
			unavailable: state(unavailable),
		}, {
			missing: {
				banner: 'This customization needs repair',
				bannerClass: 'mcp-detail-diagnostic-card warning',
				action: 'Repair',
				actionDisabled: false,
				accessible: 'Repository review\n\nReviews pull requests.\n\nThis customization needs repair\n\nType: Skill\n\nSource: Marketplace\n\nLocation: c:\\skills\\review',
			},
			missingCounts: { installCount: 0, repairCount: 1, uninstallCount: 0 },
			blockedMissing: {
				banner: 'This customization needs repairThe source is no longer available.',
				bannerClass: 'mcp-detail-diagnostic-card warning',
				action: 'Repair',
				actionDisabled: true,
				accessible: 'Repository review\n\nReviews pull requests.\n\nThis customization needs repair\nThe source is no longer available.\n\nType: Skill\n\nSource: Marketplace\n\nLocation: c:\\skills\\review',
			},
			error: {
				banner: 'This customization has an errorInstallation failed.',
				bannerClass: 'mcp-detail-diagnostic-card error',
				action: 'Install',
				actionDisabled: true,
				accessible: 'Repository review\n\nReviews pull requests.\n\nThis customization has an error\nInstallation failed.\n\nType: Skill\n\nSource: Marketplace\n\nLocation: c:\\skills\\review',
			},
			unavailable: {
				banner: 'This customization is unavailableThis item requires a newer version.',
				bannerClass: 'mcp-detail-diagnostic-card warning',
				action: 'Unavailable',
				actionDisabled: true,
				accessible: 'Repository review\n\nReviews pull requests.\n\nThis customization is unavailable\nThis item requires a newer version.\n\nType: Skill\n\nSource: Marketplace',
			},
		});
	});

	test('fetches and renders the plugin README inline without a Contains section', async () => {
		const { detail, parent, fireInstallChange, getRequestCount } = render({
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
		fireInstallChange();
		await timeout(0);

		assert.deepStrictEqual({
			contains: parent.querySelector('.plugin-detail-contributions')?.textContent,
			readme: parent.querySelector('.plugin-detail-readme-content')?.textContent,
			accessible: detail.getAccessibilityContent(),
			requestCount: getRequestCount(),
		}, {
			contains: undefined,
			readme: 'Frontend Design\nUse the design system.',
			accessible: 'Frontend Design\n\nDesign UI.\n\nType: Plugin\n\nSource: Marketplace\n\nPlugin README:\n# Frontend Design\n\nUse the design system.',
			requestCount: 1,
		});
	});
});
