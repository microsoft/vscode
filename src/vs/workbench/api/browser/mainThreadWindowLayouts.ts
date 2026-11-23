/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../base/common/lifecycle.js';
import { equals } from '../../../base/common/objects.js';
import { IConfigurationService } from '../../../platform/configuration/common/configuration.js';
import { ExtensionIdentifier } from '../../../platform/extensions/common/extensions.js';
import { extHostNamedCustomer, IExtHostContext } from '../../services/extensions/common/extHostCustomers.js';
import { INamedLayout, INamedLayoutsService, NAMED_LAYOUTS_ENABLED_SETTING } from '../../services/namedLayouts/common/namedLayouts.js';
import { ExtHostContext, ExtHostWindowLayoutsShape, MainContext, MainThreadWindowLayoutsShape, WindowLayoutDto } from '../common/extHost.protocol.js';

function toWindowLayoutDto(layout: INamedLayout): WindowLayoutDto {
	return {
		id: layout.id,
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
	 * Maps the tokens of switches that can still be restored to the layout that was active
	 * before the switch, and to the number of changes of the active layout after the switch.
	 */
	private readonly restorableSwitches = new Map<number, { readonly previousLayoutId: string; readonly activeLayoutChanges: number }>();
	private nextToken = 1;

	/**
	 * Counts the changes of the active layout. The service changes the active layout in its
	 * sequenced tasks, so a restore can find out when it runs whether a switch ran meanwhile.
	 */
	private activeLayoutChanges = 0;

	/**
	 * The active layout as the extension host knows it.
	 */
	private acceptedActiveLayout: WindowLayoutDto | undefined;

	constructor(
		extHostContext: IExtHostContext,
		@INamedLayoutsService private readonly namedLayoutsService: INamedLayoutsService,
		@IConfigurationService private readonly configurationService: IConfigurationService
	) {
		super();

		this.proxy = extHostContext.getProxy(ExtHostContext.ExtHostWindowLayouts);

		this._register(this.namedLayoutsService.onDidChangeActiveLayout(layout => {
			// Restoring must not undo a later switch
			this.activeLayoutChanges++;
			this.restorableSwitches.clear();
			this.acceptActiveLayout(layout);
		}));
		// The label of the active layout can change without a switch, for example when its extension
		// renames it or when the layouts of extensions become known after the window was restored
		this._register(this.namedLayoutsService.onDidChangeLayouts(() => this.acceptActiveLayout(this.namedLayoutsService.activeLayout)));
		this.acceptActiveLayout(this.namedLayoutsService.activeLayout);
	}

	private acceptActiveLayout(layout: INamedLayout): void {
		const activeLayout = toWindowLayoutDto(layout);
		if (!equals(activeLayout, this.acceptedActiveLayout)) {
			this.acceptedActiveLayout = activeLayout;
			this.proxy.$acceptActiveLayout(activeLayout);
		}
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

		// The layout that was active is determined when the switch runs, after the switches queued before it.
		// The service resolves the switch before it runs the changes queued after it
		const previousLayout = await this.namedLayoutsService.switchLayout(layout);

		const token = this.nextToken++;
		// Switching to the active layout changes nothing that could be restored, and fires
		// no event that clears the map, so such switches are not stored
		if (previousLayout.id !== layout.id && this.namedLayoutsService.activeLayout.id === layout.id) {
			this.restorableSwitches.set(token, { previousLayoutId: previousLayout.id, activeLayoutChanges: this.activeLayoutChanges });
		}

		return { token, previousLayout: toWindowLayoutDto(previousLayout) };
	}

	async $restoreLayout(token: number): Promise<boolean> {
		const restorableSwitch = this.restorableSwitches.get(token);
		this.restorableSwitches.delete(token);
		const previousLayout = restorableSwitch && this.namedLayoutsService.layouts.find(layout => layout.id === restorableSwitch.previousLayoutId);
		if (!restorableSwitch || !previousLayout) {
			return false;
		}

		// Whether the active layout changed since the switch is checked when the restore runs,
		// so that it does not undo a switch that was queued before it
		return !!await this.namedLayoutsService.switchLayout(previousLayout, { condition: () => this.activeLayoutChanges === restorableSwitch.activeLayoutChanges });
	}
}
