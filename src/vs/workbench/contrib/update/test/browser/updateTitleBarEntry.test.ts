/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mainWindow } from '../../../../../base/browser/window.js';
import { Action } from '../../../../../base/common/actions.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { IHoverOptions, IHoverWidget } from '../../../../../base/browser/ui/hover/hover.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IClipboardService } from '../../../../../platform/clipboard/common/clipboardService.js';
import { ICommandEvent, ICommandService } from '../../../../../platform/commands/common/commands.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { IMeteredConnectionService } from '../../../../../platform/meteredConnection/common/meteredConnection.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { IUpdateService, State } from '../../../../../platform/update/common/update.js';
import { UpdateTitleBarEntry } from '../../browser/updateTitleBarEntry.js';
import { UpdateTooltip } from '../../browser/updateTooltip.js';

class TestCommandService extends mock<ICommandService>() {
	private readonly _onDidExecuteCommand = new Emitter<ICommandEvent>();
	override readonly onDidExecuteCommand = this._onDidExecuteCommand.event;

	fireDidExecuteCommand(commandId: string): void {
		this._onDidExecuteCommand.fire({ commandId, args: [] });
	}

	dispose(): void {
		this._onDidExecuteCommand.dispose();
	}
}

class TestHoverWidget implements IHoverWidget {
	isDisposed = false;

	dispose(): void {
		this.isDisposed = true;
	}
}

class TestHoverService extends mock<IHoverService>() {
	readonly showRequests: { readonly focus: boolean; readonly trapFocus: boolean }[] = [];

	override showInstantHover(options: IHoverOptions, focus?: boolean): IHoverWidget {
		this.showRequests.push({ focus: !!focus, trapFocus: !!options.trapFocus });
		return new TestHoverWidget();
	}
}

suite('UpdateTitleBarEntry', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('Show or Focus Hover focuses the tooltip while Tab remains unhandled', () => {
		const container = mainWindow.document.createElement('div');
		mainWindow.document.body.appendChild(container);
		store.add(toDisposable(() => container.remove()));

		const commandService = store.add(new TestCommandService());
		const hoverService = new TestHoverService();
		const action = store.add(new Action('workbench.actions.updateIndicator', 'Update'));
		const entry = store.add(new UpdateTitleBarEntry(
			action,
			{},
			new class extends mock<UpdateTooltip>() {
				override readonly domNode = mainWindow.document.createElement('div');
			},
			() => { },
			() => { },
			commandService,
			hoverService,
			new class extends mock<ITelemetryService>() { },
			new class extends mock<IUpdateService>() {
				override readonly onStateChange = Event.None;
				override readonly state = State.Uninitialized;
			},
		));
		entry.render(container);
		entry.focus();

		const tabEvent = new KeyboardEvent('keydown', { key: 'Tab', keyCode: 9, bubbles: true, cancelable: true });
		container.dispatchEvent(tabEvent);
		commandService.fireDidExecuteCommand('workbench.action.showHover');

		assert.deepStrictEqual({
			tabDefaultPrevented: tabEvent.defaultPrevented,
			hoverShowRequests: hoverService.showRequests,
		}, {
			tabDefaultPrevented: false,
			hoverShowRequests: [{ focus: true, trapFocus: true }],
		});
	});
});

suite('UpdateTooltip', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('removes hidden actions from the tab order', () => {
		const configurationService = new TestConfigurationService({ 'update.mode': 'default' });
		store.add(configurationService.onDidChangeConfigurationEmitter);
		const tooltip = store.add(new UpdateTooltip(
			new class extends mock<IClipboardService>() { },
			store.add(new TestCommandService()),
			configurationService,
			new TestHoverService(),
			new class extends mock<IMeteredConnectionService>() {
				override readonly isConnectionMetered = false;
			},
			new class extends mock<IProductService>() {
				override readonly nameLong = 'Code - OSS Dev';
				override readonly version = '1.134.0';
				override readonly commit = 'current';
			},
		));

		tooltip.renderState(State.Ready({ version: 'next', productVersion: '1.135.0' }, false, false));

		assert.deepStrictEqual(
			Array.from(tooltip.domNode.querySelectorAll<HTMLElement>('button, [tabindex]')).map(element => ({
				className: element.className,
				display: element.style.display,
				tabIndex: element.tabIndex,
			})),
			[
				{ className: 'copy-version-button', display: '', tabIndex: 0 },
				{ className: 'copy-version-button', display: '', tabIndex: 0 },
				{ className: 'release-notes-button', display: '', tabIndex: 0 },
				{ className: 'action-button', display: 'none', tabIndex: -1 },
			],
		);
	});
});
