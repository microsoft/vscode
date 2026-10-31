/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ExtensionIdentifier, IExtensionDescription } from '../../../../../platform/extensions/common/extensions.js';
import { MockContextKeyService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { NullExtensionService, nullExtensionDescription } from '../../../../services/extensions/common/extensions.js';
import { EXTENSION_ENABLED_CONTEXT_KEY_PREFIX, ExtensionEnablementContextKeysContribution } from '../../browser/extensionEnablementContext.js';

type ExtensionsChangeEvent = { readonly added: readonly IExtensionDescription[]; readonly removed: readonly IExtensionDescription[] };

function aExtension(id: string): IExtensionDescription {
	return { ...nullExtensionDescription, identifier: new ExtensionIdentifier(id) };
}

class TestExtensionService extends NullExtensionService {
	private readonly _onDidChangeExtensions = new Emitter<ExtensionsChangeEvent>();
	override readonly onDidChangeExtensions: Event<ExtensionsChangeEvent> = this._onDidChangeExtensions.event;

	constructor(initial: IExtensionDescription[]) {
		super();
		(this.extensions as IExtensionDescription[]).push(...initial);
	}

	/** Applies a delta to the registry and fires the matching change event. */
	fireChange(added: IExtensionDescription[], removed: IExtensionDescription[]): void {
		const extensions = this.extensions as IExtensionDescription[];
		for (const toRemove of removed) {
			const index = extensions.findIndex(e => ExtensionIdentifier.equals(e.identifier, toRemove.identifier));
			if (index !== -1) {
				extensions.splice(index, 1);
			}
		}
		extensions.push(...added);
		this._onDidChangeExtensions.fire({ added, removed });
	}

	/**
	 * Overwrites the final registry and fires an event carrying an arbitrary
	 * (possibly misleading) delta. Used to simulate the case where registry
	 * validation rejects an `added` extension without reporting it in `removed`.
	 */
	setExtensionsAndFire(finalExtensions: IExtensionDescription[], event: ExtensionsChangeEvent): void {
		const extensions = this.extensions as IExtensionDescription[];
		extensions.length = 0;
		extensions.push(...finalExtensions);
		this._onDidChangeExtensions.fire(event);
	}

	dispose(): void {
		this._onDidChangeExtensions.dispose();
	}
}

suite('ExtensionEnablementContextKeysContribution', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function snapshot(contextKeyService: MockContextKeyService, ids: string[]): Record<string, boolean | undefined> {
		const result: Record<string, boolean | undefined> = {};
		for (const id of ids) {
			result[id] = contextKeyService.getContextKeyValue(EXTENSION_ENABLED_CONTEXT_KEY_PREFIX + id);
		}
		return result;
	}

	function createContribution(initial: IExtensionDescription[]): { contextKeyService: MockContextKeyService; extensionService: TestExtensionService } {
		const extensionService = new TestExtensionService(initial);
		disposables.add({ dispose: () => extensionService.dispose() });
		const contextKeyService = disposables.add(new MockContextKeyService());
		disposables.add(new ExtensionEnablementContextKeysContribution(contextKeyService, extensionService));
		return { contextKeyService, extensionService };
	}

	test('reflects installed-and-enabled extensions and reacts to changes', () => {
		const { contextKeyService, extensionService } = createContribution([aExtension('pub.a'), aExtension('pub.b')]);

		assert.deepStrictEqual(snapshot(contextKeyService, ['pub.a', 'pub.b', 'pub.c']), {
			'pub.a': true, // seeded from already-registered extensions
			'pub.b': true,
			'pub.c': undefined, // never present -> key was never set
		});

		extensionService.fireChange([aExtension('pub.c')], []); // newly enabled
		extensionService.fireChange([], [aExtension('pub.b')]); // disabled or uninstalled
		extensionService.fireChange([aExtension('pub.a')], [aExtension('pub.a')]); // update -> removed then re-added

		assert.deepStrictEqual(snapshot(contextKeyService, ['pub.a', 'pub.b', 'pub.c']), {
			'pub.a': true,
			'pub.b': false,
			'pub.c': true,
		});
	});

	test('normalizes extension id to lower case', () => {
		const { contextKeyService } = createContribution([aExtension('Pub.MixedCase')]);

		assert.strictEqual(contextKeyService.getContextKeyValue(EXTENSION_ENABLED_CONTEXT_KEY_PREFIX + 'pub.mixedcase'), true);
	});

	test('reconciles against the final registry, not the change delta', () => {
		const { contextKeyService, extensionService } = createContribution([aExtension('pub.a')]);

		// Registry validation drops pub.a from the final set (e.g. a dependency
		// loop) but reports it as `added` and omits it from `removed`. The key
		// must follow the final registry and become false, not trust the delta.
		extensionService.setExtensionsAndFire([], { added: [aExtension('pub.a')], removed: [] });

		assert.strictEqual(contextKeyService.getContextKeyValue(EXTENSION_ENABLED_CONTEXT_KEY_PREFIX + 'pub.a'), false);
	});
});
