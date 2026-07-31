/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Pane } from '../../../../../base/browser/ui/splitview/paneview.js';
import { Emitter } from '../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ConfigurationTarget } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { TestLayoutService } from '../../../../test/browser/workbenchTestServices.js';
import { LayoutSettings } from '../../../../services/layout/browser/layoutService.js';
import { StyleOverridesContribution } from '../../browser/styleOverrides.contribution.js';

class StyleOverridesTestPane extends Pane {

	constructor() {
		super({ title: 'Test', minimumBodySize: 0, maximumBodySize: 0 });
	}

	protected renderHeader(container: HTMLElement): void { }
	protected renderBody(container: HTMLElement): void { }
	protected layoutBody(height: number, width: number): void { }
}

class StyleOverridesTestLayoutService extends TestLayoutService {

	override mainContainer = document.createElement('div');
	override containers = [this.mainContainer];
	override activeContainer = this.mainContainer;

	readonly onDidAddContainerEmitter = new Emitter<{ container: HTMLElement; disposables: DisposableStore }>();
	override readonly onDidAddContainer = this.onDidAddContainerEmitter.event;
	layoutCount = 0;

	override layout(): void {
		this.layoutCount++;
	}

	addContainer(container: HTMLDivElement, disposables: DisposableStore): void {
		this.containers.push(container);
		this.onDidAddContainerEmitter.fire({ container, disposables });
	}
}

suite('StyleOverridesContribution', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('applies startup values without relayout and relayouts once when toggled', async () => {
		const configurationService = new TestConfigurationService({ [LayoutSettings.MODERN_UI]: true });
		store.add(configurationService.onDidChangeConfigurationEmitter);
		const layoutService = new StyleOverridesTestLayoutService();
		store.add(layoutService.onDidAddContainerEmitter);
		store.add(new StyleOverridesContribution(configurationService, layoutService));
		const pane = store.add(new StyleOverridesTestPane());

		const auxiliaryContainer = document.createElement('div');
		const auxiliaryDisposables = store.add(new DisposableStore());
		layoutService.addContainer(auxiliaryContainer, auxiliaryDisposables);

		const startupState = {
			mainEnabled: layoutService.mainContainer.classList.contains('style-override'),
			auxiliaryEnabled: auxiliaryContainer.classList.contains('style-override'),
			paneHeaderSize: pane.minimumSize,
			layoutCount: layoutService.layoutCount,
		};

		await configurationService.setUserConfiguration(LayoutSettings.MODERN_UI, false);
		configurationService.onDidChangeConfigurationEmitter.fire({
			affectsConfiguration: key => key === LayoutSettings.MODERN_UI,
			source: ConfigurationTarget.USER,
			affectedKeys: new Set([LayoutSettings.MODERN_UI]),
			change: { keys: [LayoutSettings.MODERN_UI], overrides: [] }
		});

		assert.deepStrictEqual({
			startupState,
			mainEnabledAfterToggle: layoutService.mainContainer.classList.contains('style-override'),
			auxiliaryEnabledAfterToggle: auxiliaryContainer.classList.contains('style-override'),
			paneHeaderSizeAfterToggle: pane.minimumSize,
			layoutCountAfterToggle: layoutService.layoutCount,
		}, {
			startupState: {
				mainEnabled: true,
				auxiliaryEnabled: true,
				paneHeaderSize: 28,
				layoutCount: 0,
			},
			mainEnabledAfterToggle: false,
			auxiliaryEnabledAfterToggle: false,
			paneHeaderSizeAfterToggle: 22,
			layoutCountAfterToggle: 1,
		});
	});
});
