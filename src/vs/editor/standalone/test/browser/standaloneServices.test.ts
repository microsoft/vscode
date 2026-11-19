/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { KeyCode } from '../../../../base/common/keyCodes.js';
import { DisposableStore, IReference } from '../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { StandaloneCodeEditorService } from '../../browser/standaloneCodeEditorService.js';
import { StandaloneCommandService, StandaloneConfigurationService, StandaloneKeybindingService, StandaloneNotificationService } from '../../browser/standaloneServices.js';
import { InMemoryTextModelService } from '../../../common/services/inMemoryTextModelService.js';
import { IResolvedTextEditorModel } from '../../../common/services/resolverService.js';
import { URI } from '../../../../base/common/uri.js';
import { StandaloneThemeService } from '../../browser/standaloneThemeService.js';
import { ContextKeyService } from '../../../../platform/contextkey/browser/contextKeyService.js';
import { InstantiationService } from '../../../../platform/instantiation/common/instantiationService.js';
import { ServiceCollection } from '../../../../platform/instantiation/common/serviceCollection.js';
import { IKeyboardEvent } from '../../../../platform/keybinding/common/keybinding.js';
import { NullLogService } from '../../../../platform/log/common/log.js';
import { NullTelemetryService } from '../../../../platform/telemetry/common/telemetryUtils.js';
import { createModelServices } from '../../../test/common/testTextModel.js';
import { IModelService } from '../../../common/services/model.js';

suite('InMemoryTextModelService', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	for (const releaseCreatorFirst of [false, true]) {
		test(`owns synthetic documents until the last reference releases (creator first: ${releaseCreatorFirst})`, async () => {
			const services = createModelServices(disposables.add(new DisposableStore()));
			const resolver = services.createInstance(InMemoryTextModelService);
			const owner = disposables.add(await resolver.createSyntheticDocument('shared', null));
			const model = owner.object.textEditorModel;
			const reference = disposables.add(await resolver.createModelReference(model.uri));
			if (releaseCreatorFirst) {
				owner.dispose();
			} else {
				reference.dispose();
			}
			assert.strictEqual(model.getValue(), 'shared');
			owner.dispose();
			reference.dispose();
			assert.strictEqual(model.isDisposed(), true);
		});
	}

	test('reentrant opens from onModelAdded share the creator reference', async () => {
		const services = createModelServices(disposables.add(new DisposableStore()));
		const resolver = services.createInstance(InMemoryTextModelService);
		let pending: Promise<IReference<IResolvedTextEditorModel>> | undefined;
		disposables.add(services.get(IModelService).onModelAdded(model => {
			pending = resolver.createModelReference(model.uri);
		}));
		const owner = disposables.add(await resolver.createSyntheticDocument('', null));
		assert.ok(pending);
		const reference = disposables.add(await pending);
		assert.strictEqual(reference.object, owner.object);
		reference.dispose();
		assert.strictEqual(owner.object.textEditorModel.isDisposed(), false);
	});

	test('does not take ownership of externally created models', async () => {
		const services = createModelServices(disposables.add(new DisposableStore()));
		const resolver = services.createInstance(InMemoryTextModelService);
		const model = disposables.add(services.get(IModelService).createModel('external', null));
		const reference = disposables.add(await resolver.createModelReference(model.uri));
		reference.dispose();
		assert.deepStrictEqual({ disposed: model.isDisposed(), content: model.getValue() }, { disposed: false, content: 'external' });
	});

	test('releases failed acquisitions so a later open can succeed', async () => {
		const services = createModelServices(disposables.add(new DisposableStore()));
		const resolver = services.createInstance(InMemoryTextModelService);
		const resource = URI.parse('inmemory:/later');
		await assert.rejects(resolver.createModelReference(resource), /Model not found/);
		const model = disposables.add(services.get(IModelService).createModel('later', null, resource));
		const reference = disposables.add(await resolver.createModelReference(resource));
		assert.strictEqual(reference.object.textEditorModel, model);
	});
});

suite('StandaloneKeybindingService', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	class TestStandaloneKeybindingService extends StandaloneKeybindingService {
		public testDispatch(e: IKeyboardEvent): void {
			super._dispatch(e, null!);
		}
	}

	test('issue microsoft/monaco-editor#167', () => {

		const disposables = new DisposableStore();
		const serviceCollection = new ServiceCollection();
		const instantiationService = new InstantiationService(serviceCollection, true);
		const configurationService = new StandaloneConfigurationService(new NullLogService());
		const contextKeyService = disposables.add(new ContextKeyService(configurationService));
		const commandService = new StandaloneCommandService(instantiationService);
		const notificationService = new StandaloneNotificationService();
		const standaloneThemeService = disposables.add(new StandaloneThemeService());
		const codeEditorService = disposables.add(new StandaloneCodeEditorService(contextKeyService, standaloneThemeService));
		const keybindingService = disposables.add(new TestStandaloneKeybindingService(contextKeyService, commandService, NullTelemetryService, notificationService, new NullLogService(), codeEditorService));

		let commandInvoked = false;
		disposables.add(keybindingService.addDynamicKeybinding('testCommand', KeyCode.F9, () => {
			commandInvoked = true;
		}, undefined));

		keybindingService.testDispatch({
			_standardKeyboardEventBrand: true,
			ctrlKey: false,
			shiftKey: false,
			altKey: false,
			metaKey: false,
			altGraphKey: false,
			keyCode: KeyCode.F9,
			code: null!
		});

		assert.ok(commandInvoked, 'command invoked');

		disposables.dispose();
	});
});
