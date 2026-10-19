/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Disposable, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ExternalUriOpenerPriority } from '../../../../../editor/common/languages.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ViewColumn } from '../../../../../platform/editor/common/editor.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IOpenerService, OpenOptions } from '../../../../../platform/opener/common/opener.js';
import { IPickOptions, IQuickInputService, IQuickPickItem, QuickPickInput } from '../../../../../platform/quickinput/common/quickInput.js';
import { ExternalUriOpenerService, IExternalOpenerProvider, IExternalUriOpener } from '../../common/externalUriOpenerService.js';


class MockQuickInputService implements Partial<IQuickInputService> {

	constructor(
		private readonly pickIndex: number
	) { }

	public pick<T extends IQuickPickItem>(picks: Promise<QuickPickInput<T>[]> | QuickPickInput<T>[], options?: IPickOptions<T> & { canPickMany: true }, token?: CancellationToken): Promise<T[]>;
	public pick<T extends IQuickPickItem>(picks: Promise<QuickPickInput<T>[]> | QuickPickInput<T>[], options?: IPickOptions<T> & { canPickMany: false }, token?: CancellationToken): Promise<T>;
	public async pick<T extends IQuickPickItem>(picks: Promise<QuickPickInput<T>[]> | QuickPickInput<T>[], options?: Omit<IPickOptions<T>, 'canPickMany'>, token?: CancellationToken): Promise<T | undefined> {
		const resolvedPicks = await picks;
		const item = resolvedPicks[this.pickIndex];
		if (item.type === 'separator') {
			return undefined;
		}
		return item;
	}

}

suite('ExternalUriOpenerService', () => {
	let disposables: DisposableStore;
	let instantiationService: TestInstantiationService;

	setup(() => {
		disposables = new DisposableStore();
		instantiationService = disposables.add(new TestInstantiationService());

		instantiationService.stub(IConfigurationService, new TestConfigurationService());
		instantiationService.stub(IOpenerService, {
			registerExternalOpener: () => { return Disposable.None; }
		});
	});

	teardown(() => {
		disposables.dispose();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	test('Should not open if there are no openers', async () => {
		const externalUriOpenerService = disposables.add(instantiationService.createInstance(ExternalUriOpenerService));

		externalUriOpenerService.registerExternalOpenerProvider(new class implements IExternalOpenerProvider {
			async *getOpeners(_targetUri: URI): AsyncGenerator<IExternalUriOpener> {
				// noop
			}
		});

		const uri = URI.parse('http://contoso.com');
		const didOpen = await externalUriOpenerService.openExternal(uri.toString(), { sourceUri: uri }, CancellationToken.None);
		assert.strictEqual(didOpen, false);
	});

	test('Should prompt if there is at least one enabled opener', async () => {
		instantiationService.stub(IQuickInputService, new MockQuickInputService(0));

		const externalUriOpenerService = disposables.add(instantiationService.createInstance(ExternalUriOpenerService));

		let openedWithEnabled = false;
		let viewColumn: ViewColumn | undefined;
		externalUriOpenerService.registerExternalOpenerProvider(new class implements IExternalOpenerProvider {
			async *getOpeners(_targetUri: URI): AsyncGenerator<IExternalUriOpener> {
				yield {
					id: 'disabled-id',
					label: 'disabled',
					canOpen: async () => ExternalUriOpenerPriority.None,
					openExternalUri: async () => true,
				};
				yield {
					id: 'enabled-id',
					label: 'enabled',
					canOpen: async () => ExternalUriOpenerPriority.Default,
					openExternalUri: async (_uri, context) => {
						openedWithEnabled = true;
						viewColumn = context.viewColumn;
						return true;
					}
				};
			}
		});

		const uri = URI.parse('http://contoso.com');
		const didOpen = await externalUriOpenerService.openExternal(uri.toString(), { sourceUri: uri, viewColumn: ViewColumn.Beside }, CancellationToken.None);
		assert.deepStrictEqual({ didOpen, openedWithEnabled, viewColumn }, { didOpen: true, openedWithEnabled: true, viewColumn: ViewColumn.Beside });
	});

	test('Should automatically pick single preferred opener without prompt', async () => {
		const externalUriOpenerService = disposables.add(instantiationService.createInstance(ExternalUriOpenerService));

		let openedWithPreferred = false;
		externalUriOpenerService.registerExternalOpenerProvider(new class implements IExternalOpenerProvider {
			async *getOpeners(_targetUri: URI): AsyncGenerator<IExternalUriOpener> {
				yield {
					id: 'other-id',
					label: 'other',
					canOpen: async () => ExternalUriOpenerPriority.Default,
					openExternalUri: async () => {
						return true;
					}
				};
				yield {
					id: 'preferred-id',
					label: 'preferred',
					canOpen: async () => ExternalUriOpenerPriority.Preferred,
					openExternalUri: async () => {
						openedWithPreferred = true;
						return true;
					}
				};
			}
		});

		const uri = URI.parse('http://contoso.com');
		const didOpen = await externalUriOpenerService.openExternal(uri.toString(), { sourceUri: uri }, CancellationToken.None);
		assert.strictEqual(didOpen, true);
		assert.strictEqual(openedWithPreferred, true);
	});

	function registerOpeners(externalUriOpenerService: ExternalUriOpenerService, priorities: Record<string, ExternalUriOpenerPriority>): void {
		externalUriOpenerService.registerExternalOpenerProvider(new class implements IExternalOpenerProvider {
			async *getOpeners(_targetUri: URI): AsyncGenerator<IExternalUriOpener> {
				for (const [id, priority] of Object.entries(priorities)) {
					yield { id, label: `Label ${id}`, canOpen: async () => priority, openExternalUri: async () => true };
				}
			}
		});
	}

	async function getLinkHandlers(externalUriOpenerService: ExternalUriOpenerService, uri: URI) {
		const handlers = await externalUriOpenerService.provideLinkHandlers(uri, CancellationToken.None);
		return handlers.map(({ id, label, isDefault }) => ({ id, label, isDefault }));
	}

	test('Should provide link handlers by priority and open them as the preferred opener', async () => {
		const opened: unknown[] = [];
		instantiationService.stub(IOpenerService, {
			registerExternalOpener: () => Disposable.None,
			open: async (target: URI | string, options?: OpenOptions) => {
				opened.push({ target: target.toString(), options });
				return true;
			}
		});
		const externalUriOpenerService = disposables.add(instantiationService.createInstance(ExternalUriOpenerService));
		registerOpeners(externalUriOpenerService, {
			'none-id': ExternalUriOpenerPriority.None,
			'option-id': ExternalUriOpenerPriority.Option,
			'preferred-id': ExternalUriOpenerPriority.Preferred,
			'default-id': ExternalUriOpenerPriority.Default,
		});

		const uri = URI.parse('http://contoso.com/a');
		const handlers = await externalUriOpenerService.provideLinkHandlers(uri, CancellationToken.None);
		const didOpen = await handlers[1].open({ openToSide: true });

		assert.deepStrictEqual({ handlers: await getLinkHandlers(externalUriOpenerService, uri), didOpen, opened }, {
			handlers: [
				{ id: 'preferred-id', label: 'Label preferred-id', isDefault: true },
				{ id: 'default-id', label: 'Label default-id', isDefault: false },
				{ id: 'option-id', label: 'Label option-id', isDefault: false },
			],
			didOpen: true,
			opened: [{ target: 'http://contoso.com/a', options: { openToSide: true, allowContributedOpeners: 'default-id' } }],
		});
	});

	test('Should mark the configured opener as the default link handler, and none when the user would be prompted', async () => {
		const configurationService = new TestConfigurationService();
		instantiationService.stub(IConfigurationService, configurationService);
		const externalUriOpenerService = disposables.add(instantiationService.createInstance(ExternalUriOpenerService));
		registerOpeners(externalUriOpenerService, {
			'default-a': ExternalUriOpenerPriority.Default,
			'default-b': ExternalUriOpenerPriority.Default,
			'unavailable': ExternalUriOpenerPriority.None,
		});

		const uri = URI.parse('https://contoso.com');
		const prompted = await getLinkHandlers(externalUriOpenerService, uri);
		await configurationService.setUserConfiguration('workbench.externalUriOpeners', { 'contoso.com': 'unavailable' });
		const configured = await getLinkHandlers(externalUriOpenerService, uri);

		assert.deepStrictEqual({ prompted, configured }, {
			prompted: [
				{ id: 'default-a', label: 'Label default-a', isDefault: false },
				{ id: 'default-b', label: 'Label default-b', isDefault: false },
			],
			configured: [
				{ id: 'unavailable', label: 'Label unavailable', isDefault: true },
				{ id: 'default-a', label: 'Label default-a', isDefault: false },
				{ id: 'default-b', label: 'Label default-b', isDefault: false },
			],
		});
	});
});
