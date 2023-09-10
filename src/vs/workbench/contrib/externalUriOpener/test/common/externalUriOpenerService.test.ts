/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { CancellationToken } from 'vs/base/common/cancellation';
import { Disposable } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import { ExternalUriOpenerPriority } from 'vs/editor/common/languages';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { TestConfigurationService } from 'vs/platform/configuration/test/common/testConfigurationService';
import { TestInstantiationService } from 'vs/platform/instantiation/test/common/instantiationServiceMock';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import { IPickOptions, IQuickInputService, IQuickPickItem, QuickPickInput } from 'vs/platform/quickinput/common/quickInput';
import { ExternalUriOpenerService, IExternalOpenerProvider, IExternalUriOpener } from 'vs/workbench/contrib/externalUriOpener/common/externalUriOpenerService';


class MockQuickInputService implements Partial<IQuickInputService>{

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

	let instantiationService: TestInstantiationService;

	setup(() => {
		instantiationService = new TestInstantiationService();

		instantiationService.stub(IConfigurationService, new TestConfigurationService());
		instantiationService.stub(IOpenerService, {
			registerExternalOpener: () => { return Disposable.None; }
		});
	});

	teardown(() => {
		instantiationService.dispose();
	});

	test('Should not open if there are no openers', async () => {
		const externalUriOpenerService: ExternalUriOpenerService = instantiationService.createInstance(ExternalUriOpenerService);

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

		const externalUriOpenerService: ExternalUriOpenerService = instantiationService.createInstance(ExternalUriOpenerService);

		let openedWithEnabled = false;
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
					openExternalUri: async () => {
						openedWithEnabled = true;
						return true;
					}
				};
			}
		});

		const uri = URI.parse('http://contoso.com');
		const didOpen = await externalUriOpenerService.openExternal(uri.toString(), { sourceUri: uri }, CancellationToken.None);
		assert.strictEqual(didOpen, true);
		assert.strictEqual(openedWithEnabled, true);
	});

	test('Should automatically pick single preferred opener without prompt', async () => {
		const externalUriOpenerService: ExternalUriOpenerService = instantiationService.createInstance(ExternalUriOpenerService);

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
});
