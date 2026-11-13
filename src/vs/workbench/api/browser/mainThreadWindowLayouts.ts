/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../base/common/lifecycle.js';
import { IConfigurationService } from '../../../platform/configuration/common/configuration.js';
import { ExtensionIdentifier } from '../../../platform/extensions/common/extensions.js';
import { extHostNamedCustomer, IExtHostContext } from '../../services/extensions/common/extHostCustomers.js';
import { INamedLayout, INamedLayoutsService, NAMED_LAYOUTS_ENABLED_SETTING } from '../../services/namedLayouts/common/namedLayouts.js';
import { ExtHostContext, ExtHostWindowLayoutsShape, MainContext, MainThreadWindowLayoutsShape, WindowLayoutDto } from '../common/extHost.protocol.js';

function toWindowLayoutDto(layout: INamedLayout): WindowLayoutDto {
	return {
		label: layout.name,
		contribution: layout.contribution ? { extensionId: layout.contribution.extensionId, id: layout.contribution.id } : undefined
	};
}

/**
 * Lets extensions switch to the layouts they contribute and back. Registered by the
 * workbench only, the Agents window does not support named layouts.
 */
@extHostNamedCustomer(MainContext.MainThreadWindowLayouts)
export class MainThreadWindowLayouts extends Disposable implements MainThreadWindowLayoutsShape {

	private readonly proxy: ExtHostWindowLayoutsShape;

	/**
	 * Maps the tokens of switches that can still be restored to the layout that
	 * was active before the switch and the layout the extension switched to.
	 */
	private readonly restorableSwitches = new Map<number, { readonly previousLayoutId: string; readonly layoutId: string }>();
	private nextToken = 1;

	constructor(
		extHostContext: IExtHostContext,
		@INamedLayoutsService private readonly namedLayoutsService: INamedLayoutsService,
		@IConfigurationService private readonly configurationService: IConfigurationService
	) {
		super();

		this.proxy = extHostContext.getProxy(ExtHostContext.ExtHostWindowLayouts);

		this._register(this.namedLayoutsService.onDidChangeActiveLayout(layout => {
			// Restoring must not undo a later switch
			this.restorableSwitches.clear();
			this.proxy.$acceptActiveLayout(toWindowLayoutDto(layout));
		}));
		this.proxy.$acceptActiveLayout(toWindowLayoutDto(this.namedLayoutsService.activeLayout));
	}

	async $switchLayout(extensionId: string, id: string): Promise<{ readonly token: number; readonly previousLayout: WindowLayoutDto }> {
		if (this.configurationService.getValue<boolean>(NAMED_LAYOUTS_ENABLED_SETTING) !== true) {
			throw new Error(`Layouts are not enabled. Enable the setting '${NAMED_LAYOUTS_ENABLED_SETTING}'.`);
		}

		// Extensions can only switch to the layouts they contribute
		const layout = this.namedLayoutsService.layouts.find(candidate => candidate.contribution
			&& ExtensionIdentifier.equals(candidate.contribution.extensionId, extensionId)
			&& candidate.contribution.id === id);
		if (!layout) {
			throw new Error(`The extension '${extensionId}' does not contribute a layout with the id '${id}'.`);
		}

		const previousLayout = this.namedLayoutsService.activeLayout;
		await this.namedLayoutsService.switchLayout(layout);

		const token = this.nextToken++;
		if (this.namedLayoutsService.activeLayout.id === layout.id) {
			this.restorableSwitches.set(token, { previousLayoutId: previousLayout.id, layoutId: layout.id });
		}

		return { token, previousLayout: toWindowLayoutDto(previousLayout) };
	}

	async $restoreLayout(token: number): Promise<boolean> {
		const restorableSwitch = this.restorableSwitches.get(token);
		this.restorableSwitches.delete(token);
		if (!restorableSwitch || this.namedLayoutsService.activeLayout.id !== restorableSwitch.layoutId) {
			return false;
		}

		const previousLayout = this.namedLayoutsService.layouts.find(layout => layout.id === restorableSwitch.previousLayoutId);
		if (!previousLayout) {
			return false;
		}

		await this.namedLayoutsService.switchLayout(previousLayout);
		return true;
	}
}
