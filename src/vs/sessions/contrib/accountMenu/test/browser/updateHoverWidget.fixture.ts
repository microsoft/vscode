/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from '../../../../../base/common/event.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { IUpdateService, State } from '../../../../../platform/update/common/update.js';
import { ComponentFixtureContext, createEditorServices, defineComponentFixture, defineThemedFixtureGroup } from '../../../../../workbench/test/browser/componentFixtures/fixtureUtils.js';
import { UpdateHoverWidget } from '../../browser/updateHoverWidget.js';

const mockUpdate = { version: 'a1b2c3d4e5f6', productVersion: '1.100.0', timestamp: Date.now() - 2 * 60 * 60 * 1000 };
const mockUpdateSameVersion = { version: 'a1b2c3d4e5f6', productVersion: '1.99.0', timestamp: Date.now() - 3 * 24 * 60 * 60 * 1000 };

function createMockUpdateService(state: State): IUpdateService {
	const onStateChange = new Emitter<State>();
	const service: IUpdateService = {
		_serviceBrand: undefined,
		state,
		onStateChange: onStateChange.event,
		checkForUpdates: async () => { },
		downloadUpdate: async () => { },
		applyUpdate: async () => { },
		quitAndInstall: async () => { },
		isLatestVersion: async () => true,
		_applySpecificUpdate: async () => { },
		setInternalOrg: async () => { },
	};
	return service;
}

function renderHoverWidget(ctx: ComponentFixtureContext, state: State): void {
	ctx.container.style.backgroundColor = 'var(--vscode-editorHoverWidget-background)';

	const instantiationService = createEditorServices(ctx.disposableStore, {
		colorTheme: ctx.theme,
	});

	const updateService = createMockUpdateService(state);
	const productService = new class extends mock<IProductService>() {
		override readonly version = '1.99.0';
		override readonly nameShort = 'VS Code Insiders';
		override readonly commit = 'f0e1d2c3b4a5';
		override readonly date = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
	};
	const hoverService = instantiationService.get(IHoverService);
	const widget = new UpdateHoverWidget(updateService, productService, hoverService);
	ctx.container.appendChild(widget.createHoverContent(state));
}

export default defineThemedFixtureGroup({ path: 'sessions/' }, {
	UpdateHoverReady: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: ctx => renderHoverWidget(ctx, State.Ready(mockUpdate, true, false)),
	}),

	UpdateHoverAvailableForDownload: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: ctx => renderHoverWidget(ctx, State.AvailableForDownload(mockUpdate)),
	}),

	UpdateHoverDownloading30Percent: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: ctx => renderHoverWidget(ctx, State.Downloading(mockUpdate, true, false, 30_000_000, 100_000_000)),
	}),

	UpdateHoverInstalling: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: ctx => renderHoverWidget(ctx, State.Downloaded(mockUpdate, true, false)),
	}),

	UpdateHoverUpdating: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: ctx => renderHoverWidget(ctx, State.Updating(mockUpdate, 40, 100)),
	}),

	UpdateHoverSameVersion: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: ctx => renderHoverWidget(ctx, State.Ready(mockUpdateSameVersion, true, false)),
	}),
});
