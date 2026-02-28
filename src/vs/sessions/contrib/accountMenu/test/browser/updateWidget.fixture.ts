/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Action } from '../../../../../base/common/actions.js';
import { Emitter } from '../../../../../base/common/event.js';
import { IUpdateService, State } from '../../../../../platform/update/common/update.js';
import { ComponentFixtureContext, createEditorServices, defineComponentFixture, defineThemedFixtureGroup } from '../../../../../workbench/test/browser/componentFixtures/fixtureUtils.js';
import { UpdateWidget } from '../../browser/account.contribution.js';

// Ensure color registrations are loaded
import '../../../../common/theme.js';
import '../../../../../platform/theme/common/colors/inputColors.js';

// Import the CSS
import '../../../../browser/media/sidebarActionButton.css';
import '../../browser/media/accountWidget.css';

const mockUpdate = { version: '1.0.0' };

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

function renderUpdateWidget(ctx: ComponentFixtureContext, state: State): void {
	ctx.container.style.padding = '16px';
	ctx.container.style.width = '300px';
	ctx.container.style.backgroundColor = 'var(--vscode-sideBar-background)';

	const mockService = createMockUpdateService(state);

	const instantiationService = createEditorServices(ctx.disposableStore, {
		colorTheme: ctx.theme,
		additionalServices: (reg) => {
			reg.defineInstance(IUpdateService, mockService);
		},
	});

	const action = ctx.disposableStore.add(new Action('sessions.action.updateWidget', 'Sessions Update'));
	const widget = instantiationService.createInstance(UpdateWidget, action, {});
	ctx.disposableStore.add(widget);
	widget.render(ctx.container);
}

export default defineThemedFixtureGroup({
	Ready: defineComponentFixture({
		render: (ctx) => renderUpdateWidget(ctx, State.Ready(mockUpdate, true, false)),
	}),

	CheckingForUpdates: defineComponentFixture({
		render: (ctx) => renderUpdateWidget(ctx, State.CheckingForUpdates(true)),
	}),

	AvailableForDownload: defineComponentFixture({
		render: (ctx) => renderUpdateWidget(ctx, State.AvailableForDownload(mockUpdate)),
	}),

	Downloading0Percent: defineComponentFixture({
		render: (ctx) => renderUpdateWidget(ctx, State.Downloading(mockUpdate, true, false, 0, 100_000_000)),
	}),

	Downloading30Percent: defineComponentFixture({
		render: (ctx) => renderUpdateWidget(ctx, State.Downloading(mockUpdate, true, false, 30_000_000, 100_000_000)),
	}),

	Downloading65Percent: defineComponentFixture({
		render: (ctx) => renderUpdateWidget(ctx, State.Downloading(mockUpdate, true, false, 65_000_000, 100_000_000)),
	}),

	Downloading100Percent: defineComponentFixture({
		render: (ctx) => renderUpdateWidget(ctx, State.Downloading(mockUpdate, true, false, 100_000_000, 100_000_000)),
	}),

	DownloadingIndeterminate: defineComponentFixture({
		render: (ctx) => renderUpdateWidget(ctx, State.Downloading(mockUpdate, true, false)),
	}),

	Downloaded: defineComponentFixture({
		render: (ctx) => renderUpdateWidget(ctx, State.Downloaded(mockUpdate, true, false)),
	}),

	Updating: defineComponentFixture({
		render: (ctx) => renderUpdateWidget(ctx, State.Updating(mockUpdate)),
	}),

	Overwriting: defineComponentFixture({
		render: (ctx) => renderUpdateWidget(ctx, State.Overwriting(mockUpdate, true)),
	}),
});
