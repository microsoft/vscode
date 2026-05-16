/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $ } from '../../../../../base/browser/dom.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Disposable, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { localize, localize2 } from '../../../../../nls.js';
import { Action2, MenuId, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { BROWSER_DEVICE_PRESETS, IBrowserDeviceEmulation } from '../../../../../platform/browserView/common/browserView.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { IQuickInputService, IQuickPickItem, IQuickPickSeparator } from '../../../../../platform/quickinput/common/quickInput.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { IBrowserViewModel } from '../../../browserView/common/browserView.js';
import { BrowserEditor, BrowserEditorContribution, CONTEXT_BROWSER_HAS_ERROR, CONTEXT_BROWSER_HAS_URL, IBrowserEditorWidgetContribution } from '../browserEditor.js';
import { BROWSER_EDITOR_ACTIVE, BrowserActionCategory, BrowserActionGroup } from '../browserViewActions.js';

/**
 * Small pill shown in the URL bar when a device emulation profile is active.
 */
class BrowserDevicePill extends Disposable {
	readonly element: HTMLElement;
	private readonly _label: HTMLElement;

	constructor() {
		super();
		this.element = $('.browser-device-pill');
		this.element.style.display = 'none';
		const icon = $('span');
		icon.className = ThemeIcon.asClassName(Codicon.deviceMobile);
		this._label = $('span');
		this.element.appendChild(icon);
		this.element.appendChild(this._label);
	}

	update(device: IBrowserDeviceEmulation | undefined): void {
		if (device) {
			this._label.textContent = device.label;
			this.element.title = localize('browser.deviceEmulationActive', "Emulating {0} ({1}×{2})", device.label, device.width, device.height);
			this.element.style.display = '';
			this.element.classList.add('visible');
		} else {
			this.element.classList.remove('visible');
			this.element.style.display = 'none';
		}
	}
}

export class BrowserEditorDeviceSupport extends BrowserEditorContribution {
	private readonly _pill: BrowserDevicePill;

	constructor(editor: BrowserEditor) {
		super(editor);
		this._pill = this._register(new BrowserDevicePill());
	}

	override get urlBarWidgets(): readonly IBrowserEditorWidgetContribution[] {
		return [{ element: this._pill.element, order: 10 }];
	}

	protected override subscribeToModel(model: IBrowserViewModel, store: DisposableStore): void {
		this._pill.update(model.deviceEmulation);
		store.add(model.onDidChangeDeviceEmulation(device => this._pill.update(device)));
	}

	override clear(): void {
		this._pill.update(undefined);
	}
}

BrowserEditor.registerContribution(BrowserEditorDeviceSupport);

interface IDevicePickItem extends IQuickPickItem {
	readonly device: IBrowserDeviceEmulation | undefined;
}

class PickBrowserDeviceAction extends Action2 {
	static readonly ID = 'workbench.action.browser.pickDevice';

	constructor() {
		super({
			id: PickBrowserDeviceAction.ID,
			title: localize2('browser.pickDevice', 'Emulate Device…'),
			category: BrowserActionCategory,
			icon: Codicon.deviceMobile,
			f1: true,
			precondition: ContextKeyExpr.and(BROWSER_EDITOR_ACTIVE, CONTEXT_BROWSER_HAS_URL, CONTEXT_BROWSER_HAS_ERROR.negate()),
			menu: {
				id: MenuId.BrowserActionsToolbar,
				group: BrowserActionGroup.Page,
				order: 10,
			},
		});
	}

	async run(accessor: ServicesAccessor, browserEditor = accessor.get(IEditorService).activeEditorPane): Promise<void> {
		if (!(browserEditor instanceof BrowserEditor)) {
			return;
		}
		const model = browserEditor.model;
		if (!model) {
			return;
		}

		const quickInputService = accessor.get(IQuickInputService);
		const current = model.deviceEmulation;

		const items: (IDevicePickItem | IQuickPickSeparator)[] = [
			{
				label: localize('browser.device.responsive', "Responsive (default)"),
				description: localize('browser.device.responsiveDescription', "Page mirrors the pane size"),
				device: undefined,
				picked: !current,
			},
			{ type: 'separator', label: localize('browser.device.presets', "Presets") },
			...BROWSER_DEVICE_PRESETS.map<IDevicePickItem>(device => ({
				label: device.label,
				description: `${device.width} × ${device.height} @ ${device.deviceScaleFactor}x`,
				device,
				picked: current?.id === device.id,
			})),
		];

		const picked = await quickInputService.pick(items, {
			placeHolder: localize('browser.device.placeholder', "Select a device to emulate"),
			activeItem: items.find((item): item is IDevicePickItem => item.type !== 'separator' && !!item.picked),
		});

		if (picked) {
			await model.setDeviceEmulation(picked.device);
		}
	}
}

registerAction2(PickBrowserDeviceAction);
