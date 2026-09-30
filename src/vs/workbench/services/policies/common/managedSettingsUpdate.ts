/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IObservable } from '../../../../base/common/observable.js';
import { localize } from '../../../../nls.js';
import { RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { IManagedSettingsCompatibilityError } from '../../../../platform/defaultAccount/common/defaultAccount.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { DisablementReason, State, StateType } from '../../../../platform/update/common/update.js';

export const ManagedSettingsUpdateRequiredContext = new RawContextKey<boolean>('managedSettingsUpdateRequired', false);
export const MANAGED_SETTINGS_UPDATE_VIEW_ID = 'workbench.panel.chat.updateRequired';

export interface IManagedSettingsUpdateInfo {
	readonly title: string;
	readonly message: string;
	readonly detail: string | undefined;
	readonly action: { readonly label: string; readonly href: string } | undefined;
	readonly updateStatus: string | undefined;
}

export const IManagedSettingsUpdateService = createDecorator<IManagedSettingsUpdateService>('managedSettingsUpdateService');

/** Presentation of the existing client compatibility block; does not evaluate or enforce policy. */
export interface IManagedSettingsUpdateService {
	readonly _serviceBrand: undefined;
	readonly updateInfo: IObservable<IManagedSettingsUpdateInfo | undefined>;
}

function getManagedSettingsUpdateMessage(error: IManagedSettingsCompatibilityError, product: IProductService): Pick<IManagedSettingsUpdateInfo, 'title' | 'message' | 'detail'> {
	// The managed-settings request identifies this client as vscode; runtime targets are not in the response contract.
	const component = product.nameShort;
	const currentVersion = error.clientVersion || product.version;
	const requiredVersion = error.minimumClientVersion;
	return {
		title: localize('managedSettingsUpdate.title', "Update required by your organization"),
		message: requiredVersion
			? localize('managedSettingsUpdate.minimumVersion', "Your organization requires {0} {1} or later to use AI features.", component, requiredVersion)
			: localize('managedSettingsUpdate.message', "Your organization requires an update to {0} to use AI features.", component),
		detail: currentVersion ? localize('managedSettingsUpdate.installed', "Installed: {0}", currentVersion) : undefined,
	};
}

export function getManagedSettingsUpdateInfo(error: IManagedSettingsCompatibilityError, product: IProductService, state: State): IManagedSettingsUpdateInfo {
	let action: IManagedSettingsUpdateInfo['action'];
	let updateStatus: string | undefined;
	switch (state.type) {
		case StateType.Uninitialized:
			updateStatus = localize('managedSettingsUpdate.initializing', "Update availability is not yet known.");
			break;
		case StateType.Idle:
			action = { label: localize('managedSettingsUpdate.check', "Check for Updates"), href: 'command:update.checkForUpdate' };
			break;
		case StateType.AvailableForDownload:
			action = { label: localize('managedSettingsUpdate.download', "Download Update"), href: 'command:update.downloadUpdate' };
			break;
		case StateType.Downloaded:
			action = { label: localize('managedSettingsUpdate.install', "Install Update"), href: 'command:update.installUpdate' };
			break;
		case StateType.Ready:
			action = { label: localize('managedSettingsUpdate.restart', "Restart to Update"), href: 'command:update.restartToUpdate' };
			break;
		case StateType.Disabled:
			if (state.reason === DisablementReason.Policy) {
				updateStatus = localize('managedSettingsUpdate.disabled', "Built-in updates are disabled by your organization. Contact your administrator for an approved update.");
			}
			break;
		default:
			updateStatus = localize('managedSettingsUpdate.progress', "An update operation is in progress.");
			break;
	}
	return { ...getManagedSettingsUpdateMessage(error, product), action, updateStatus };
}
