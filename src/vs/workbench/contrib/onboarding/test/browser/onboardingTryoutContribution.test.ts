/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import sinon from 'sinon';
import { Event } from '../../../../../base/common/event.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../../base/common/network.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ITextModelContentProvider, ITextModelService } from '../../../../../editor/common/services/resolverService.js';
import { CommandsRegistry, ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { OnboardingTryoutContribution } from '../../browser/onboardingTryout.contribution.js';
import { onboardingTryoutPresentationRegistry } from '../../common/onboardingTryout.js';

suite('Lazy tryout presentations', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	teardown(() => sinon.restore());

	test('registers metadata and a restoring sample provider without constructing presentations', () => {
		const instantiation = store.add(new TestInstantiationService());
		const create = sinon.spy(instantiation, 'createInstance');
		const providers = new Map<string, ITextModelContentProvider>();
		const resolver = upcastPartial<ITextModelService>({
			registerTextModelContentProvider: (scheme, provider) => {
				providers.set(scheme, provider);
				return toDisposable(() => providers.delete(scheme));
			},
		});
		const contribution = store.add(new OnboardingTryoutContribution(instantiation, resolver));
		const registered = ['command', 'openView', 'guidedTryout', 'editorSample'].map(kind => !!onboardingTryoutPresentationRegistry.get(kind));
		const sampleProvider = providers.has(Schemas.vscodeOnboardingSample);
		contribution.dispose();
		assert.deepStrictEqual({ registered, sampleProvider, constructions: create.callCount, providers: providers.size }, {
			registered: [true, true, true, true], sampleProvider: true, constructions: 0, providers: 0,
		});
	});

	test('resolving a command initializes only its presentation once and does not execute', () => {
		const instantiation = store.add(new TestInstantiationService());
		let executed = 0;
		instantiation.stub(ICommandService, { executeCommand: async () => { executed++; } });
		instantiation.stub(IContextKeyService, { onDidChangeContext: Event.None, contextMatchesRules: () => true });
		const create = sinon.spy(instantiation, 'createInstance');
		store.add(new OnboardingTryoutContribution(instantiation, upcastPartial<ITextModelService>({
			registerTextModelContentProvider: () => toDisposable(() => { }),
		})));
		store.add(CommandsRegistry.registerCommand('test.lazyTryout', () => { executed++; }));
		const presentation = onboardingTryoutPresentationRegistry.get('command')!;
		const scenario = {
			id: 'test.lazy',
			trigger: { kind: 'command' as const, commandId: 'test.lazy' },
			presentation: { kind: 'command', payload: { commandId: 'test.lazyTryout' } },
		};
		const availability = [presentation.getAvailability(scenario), presentation.getAvailability(scenario)];
		assert.deepStrictEqual({ availability, constructions: create.callCount, executed }, {
			availability: [{ kind: 'ready' }, { kind: 'ready' }], constructions: 1, executed: 0,
		});
	});
});
