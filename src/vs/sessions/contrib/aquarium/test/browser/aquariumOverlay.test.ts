/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { IManagedHover } from '../../../../../base/browser/ui/hover/hover.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TestAccessibilityService } from '../../../../../platform/accessibility/test/common/testAccessibilityService.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { MockContextKeyService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { InMemoryStorageService, StorageScope } from '../../../../../platform/storage/common/storage.js';
import { NullTelemetryServiceShape } from '../../../../../platform/telemetry/common/telemetryUtils.js';
import { IWorkbenchLayoutService } from '../../../../../workbench/services/layout/browser/layoutService.js';
import { AquariumService, SESSIONS_DEVELOPER_JOY_ENABLED_SETTING } from '../../browser/aquariumOverlay.js';
import { disposeSharedFishDefs, Fish, FishSpecies } from '../../browser/fish.js';

suite('AquariumService', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('persists and applies aquarium action visibility to mounted buttons', () => {
		const mainContainer = document.createElement('div');
		const toggleContainer = document.createElement('div');
		document.body.append(mainContainer, toggleContainer);
		store.add(toDisposable(() => {
			mainContainer.remove();
			toggleContainer.remove();
		}));

		const storageService = store.add(new InMemoryStorageService());
		const layoutService = new class extends mock<IWorkbenchLayoutService>() {
			override readonly mainContainer = mainContainer;
		}();
		const hoverService = new class extends mock<IHoverService>() {
			override setupManagedHover(): IManagedHover {
				return {
					dispose() { },
					show() { },
					hide() { },
					update() { },
				};
			}
		}();
		const configurationService = new TestConfigurationService({ [SESSIONS_DEVELOPER_JOY_ENABLED_SETTING]: true });
		store.add(configurationService.onDidChangeConfigurationEmitter);
		const service = store.add(new AquariumService(
			layoutService,
			new MockContextKeyService(),
			hoverService,
			storageService,
			configurationService,
			new TestAccessibilityService(),
			new NullTelemetryServiceShape(),
		));
		store.add(service.mountToggle(toggleContainer));
		const button = toggleContainer.querySelector<HTMLButtonElement>('.agents-aquarium-toggle');

		const initial = {
			visible: service.actionVisible.get(),
			display: button?.style.display,
		};
		const hidden = service.toggleActionVisibility();
		const afterHide = {
			visible: service.actionVisible.get(),
			display: button?.style.display,
			stored: storageService.getBoolean('sessions.aquarium.action.visible', StorageScope.APPLICATION),
		};
		const shown = service.toggleActionVisibility();
		const afterShow = {
			visible: service.actionVisible.get(),
			display: button?.style.display,
		};

		assert.deepStrictEqual({
			initial,
			hidden,
			afterHide,
			shown,
			afterShow,
		}, {
			initial: { visible: true, display: '' },
			hidden: false,
			afterHide: { visible: false, display: 'none', stored: false },
			shown: true,
			afterShow: { visible: true, display: '' },
		});
	});

	test('creates aquarium elements in the main realm for an auxiliary window', () => {
		const iframe = document.createElement('iframe');
		document.body.appendChild(iframe);
		store.add(toDisposable(() => iframe.remove()));

		const auxiliaryDocument = iframe.contentDocument!;
		const toggleContainer = document.createElement('div');
		auxiliaryDocument.body.appendChild(toggleContainer);
		const createElement = auxiliaryDocument.createElement;
		auxiliaryDocument.createElement = () => {
			throw new Error('Not allowed to create elements in child window JavaScript context.');
		};
		store.add(toDisposable(() => auxiliaryDocument.createElement = createElement));

		const storageService = store.add(new InMemoryStorageService());
		const layoutService = new class extends mock<IWorkbenchLayoutService>() {
			override readonly mainContainer = document.createElement('div');
		}();
		const hoverService = new class extends mock<IHoverService>() {
			override setupManagedHover(): IManagedHover {
				return {
					dispose() { },
					show() { },
					hide() { },
					update() { },
				};
			}
		}();
		const configurationService = new TestConfigurationService({ [SESSIONS_DEVELOPER_JOY_ENABLED_SETTING]: true });
		store.add(configurationService.onDidChangeConfigurationEmitter);
		const service = store.add(new AquariumService(
			layoutService,
			new MockContextKeyService(),
			hoverService,
			storageService,
			configurationService,
			new TestAccessibilityService(),
			new NullTelemetryServiceShape(),
		));
		store.add(service.mountToggle(toggleContainer));
		const fish = new Fish({
			species: FishSpecies.Stable,
			size: 24,
			positionX: 0,
			positionY: 0,
			velocityX: 1,
			velocityY: 0,
		}, auxiliaryDocument);
		auxiliaryDocument.body.appendChild(fish.element);
		store.add(toDisposable(() => {
			fish.element.remove();
			disposeSharedFishDefs(auxiliaryDocument);
		}));

		const button = toggleContainer.querySelector('.agents-aquarium-toggle');
		const svg = fish.element.querySelector('svg');
		assert.deepStrictEqual({
			buttonOwnerDocument: button?.ownerDocument === auxiliaryDocument,
			fishOwnerDocument: fish.element.ownerDocument === auxiliaryDocument,
			mainRealmButton: button instanceof HTMLButtonElement,
			mainRealmFish: fish.element instanceof HTMLDivElement,
			mainRealmSvg: svg instanceof SVGSVGElement,
		}, {
			buttonOwnerDocument: true,
			fishOwnerDocument: true,
			mainRealmButton: true,
			mainRealmFish: true,
			mainRealmSvg: true,
		});
	});
});
