/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Event } from '../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TestCommandService } from '../../../../../editor/test/browser/editorTestServices.js';
import { IActionViewItemFactory, IActionViewItemService } from '../../../../../platform/actions/browser/actionViewItemService.js';
import { IMenu, IMenuActionOptions, IMenuService, MenuId } from '../../../../../platform/actions/common/actions.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService } from '../../../../../platform/contextview/browser/contextView.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IKeybindingService } from '../../../../../platform/keybinding/common/keybinding.js';
import { MockContextKeyService, MockKeybindingService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { NullTelemetryServiceShape } from '../../../../../platform/telemetry/common/telemetryUtils.js';
import { AgentHostShortcutsWidget } from '../../browser/agentHostShortcutsWidget.js';

class TestActionViewItemService implements IActionViewItemService {
	declare _serviceBrand: undefined;
	readonly onDidChange = Event.None;
	register(_menu: MenuId, _commandId: string | MenuId, _provider: IActionViewItemFactory): { dispose(): void } {
		return { dispose: () => { } };
	}
	lookUp(_menu: MenuId, _commandId: string | MenuId): IActionViewItemFactory | undefined {
		return undefined;
	}
}

class TestMenuService implements IMenuService {
	declare readonly _serviceBrand: undefined;
	createMenu(_id: MenuId): IMenu {
		return {
			onDidChange: Event.None,
			dispose: () => { },
			getActions: () => [],
		};
	}
	getMenuActions(_id: MenuId, _contextKeyService: unknown, _options?: IMenuActionOptions) { return []; }
	getMenuContexts() { return new Set<string>(); }
	resetHiddenStates() { }
}

function createWidget(disposables: DisposableStore): { container: HTMLElement } {
	const container = document.createElement('div');
	document.body.appendChild(container);
	disposables.add({ dispose: () => container.remove() });

	const instantiationService = disposables.add(new TestInstantiationService());
	instantiationService.set(IMenuService, new TestMenuService());
	instantiationService.set(IActionViewItemService, new TestActionViewItemService());
	instantiationService.set(IContextKeyService, new MockContextKeyService());
	instantiationService.set(IContextMenuService, {
		_serviceBrand: undefined,
		onDidShowContextMenu: Event.None,
		onDidHideContextMenu: Event.None,
		showContextMenu: () => { },
	});
	instantiationService.set(IKeybindingService, new MockKeybindingService());
	instantiationService.set(ICommandService, new TestCommandService(instantiationService));
	instantiationService.set(ITelemetryService, new NullTelemetryServiceShape());

	disposables.add(instantiationService.createInstance(AgentHostShortcutsWidget, container, undefined));
	return { container };
}

suite('AgentHostShortcutsWidget', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('renders an always-expanded toolbar with content and no collapse affordance', () => {
		const testDisposables = disposables.add(new DisposableStore());
		const { container } = createWidget(testDisposables);

		const toolbar = container.querySelector<HTMLElement>('.agent-host-toolbar');
		const content = container.querySelector<HTMLElement>('.agent-host-toolbar-content');

		assert.deepStrictEqual({
			toolbarPresent: !!toolbar,
			contentPresent: !!content,
			collapsed: toolbar?.classList.contains('collapsed') ?? false,
			hasChevron: !!container.querySelector('.ai-customization-chevron, .agent-host-toolbar-chevron'),
		}, {
			toolbarPresent: true,
			contentPresent: true,
			collapsed: false,
			hasChevron: false,
		});
	});
});
