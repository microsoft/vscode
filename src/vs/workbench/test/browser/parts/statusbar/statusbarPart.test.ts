/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ConfigurationTarget, IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ContextKeyService } from '../../../../../platform/contextkey/browser/contextKeyService.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { TestThemeService } from '../../../../../platform/theme/test/common/testThemeService.js';
import { TestContextService, TestStorageService } from '../../../common/workbenchTestServices.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { MainStatusbarPart } from '../../../../browser/parts/statusbar/statusbarPart.js';
import { LayoutSettings } from '../../../../services/layout/browser/layoutService.js';
import { TestContextMenuService, TestLayoutService } from '../../workbenchTestServices.js';
import { mock } from '../../../../../base/test/common/mock.js';

suite('StatusbarPart', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	class TestMainStatusbarPart extends MainStatusbarPart {
		updateStylesCalls = 0;

		override updateStyles(): void {
			this.updateStylesCalls++;
			super.updateStyles();
		}
	}

	class TestFloatingPanelsLayoutService extends TestLayoutService {
		floatingPanelsEnabled = false;

		override isFloatingPanelsEnabled(): boolean {
			return this.floatingPanelsEnabled;
		}
	}

	function fireConfigChange(configurationService: TestConfigurationService, key: string): void {
		configurationService.onDidChangeConfigurationEmitter.fire({
			source: ConfigurationTarget.DEFAULT,
			affectedKeys: new Set([key]),
			change: { keys: [key], overrides: [] },
			affectsConfiguration: candidate => candidate === key,
		});
	}

	test('configuration changes update styles only after the part is created', () => {
		const configurationService = new TestConfigurationService();
		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(IConfigurationService, configurationService);
		instantiationService.stub(IHoverService, new class extends mock<IHoverService>() { });
		const contextKeyService = store.add(new ContextKeyService(configurationService));
		const part = store.add(new TestMainStatusbarPart(
			instantiationService,
			new TestThemeService(),
			new TestContextService(),
			store.add(new TestStorageService()),
			new TestLayoutService(),
			new TestContextMenuService(),
			contextKeyService,
			configurationService,
		));

		fireConfigChange(configurationService, LayoutSettings.MODERN_UI);
		const beforeCreate = part.updateStylesCalls;
		part.create(document.createElement('div'));
		const afterCreate = part.updateStylesCalls;
		fireConfigChange(configurationService, 'unrelated.setting');
		const afterUnrelatedChange = part.updateStylesCalls;
		fireConfigChange(configurationService, LayoutSettings.MODERN_UI);

		assert.deepStrictEqual({
			beforeCreate,
			afterCreate,
			afterUnrelatedChange,
			afterModernUIChange: part.updateStylesCalls,
		}, {
			beforeCreate: 0,
			afterCreate: 1,
			afterUnrelatedChange: 1,
			afterModernUIChange: 2,
		});
	});

	test('modern UI reserves compact vertical status bar padding', () => {
		const configurationService = new TestConfigurationService();
		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(IConfigurationService, configurationService);
		instantiationService.stub(IHoverService, new class extends mock<IHoverService>() { });
		const contextKeyService = store.add(new ContextKeyService(configurationService));
		const layoutService = new TestFloatingPanelsLayoutService();
		const part = store.add(new TestMainStatusbarPart(
			instantiationService,
			new TestThemeService(),
			new TestContextService(),
			store.add(new TestStorageService()),
			layoutService,
			new TestContextMenuService(),
			contextKeyService,
			configurationService,
		));

		const defaultConstraints = { minimumHeight: part.minimumHeight, maximumHeight: part.maximumHeight };
		layoutService.floatingPanelsEnabled = true;
		const modernUIConstraints = { minimumHeight: part.minimumHeight, maximumHeight: part.maximumHeight };

		assert.deepStrictEqual({ defaultConstraints, modernUIConstraints }, {
			defaultConstraints: { minimumHeight: 22, maximumHeight: 22 },
			modernUIConstraints: { minimumHeight: 28, maximumHeight: 28 },
		});
	});
});
