/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { distinct } from '../../../base/common/arrays.js';
import { ConfigurationTarget, IConfigurationService } from '../../configuration/common/configuration.js';
import { ILocalExtension } from '../../extensionManagement/common/extensionManagement.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';

export const IIgnoredExtensionsManagementService = createDecorator<IIgnoredExtensionsManagementService>('IIgnoredExtensionsManagementService');
export interface IIgnoredExtensionsManagementService {
	readonly _serviceBrand: any;

	getIgnoredExtensions(installed: ILocalExtension[]): string[];

	hasToNeverSyncExtension(extensionId: string): boolean;
	hasToAlwaysSyncExtension(extensionId: string): boolean;
	updateIgnoredExtensions(ignoredExtensionId: string, ignore: boolean): Promise<void>;
	updateSynchronizedExtensions(ignoredExtensionId: string, sync: boolean): Promise<void>;
}

export class IgnoredExtensionsManagementService implements IIgnoredExtensionsManagementService {

	declare readonly _serviceBrand: undefined;

	constructor(
		@IConfigurationService private readonly configurationService: IConfigurationService,
	) {
	}

	hasToNeverSyncExtension(extensionId: string): boolean {
		const configuredIgnoredExtensions = this.getConfiguredIgnoredExtensions();
		return configuredIgnoredExtensions.includes(extensionId.toLowerCase());
	}

	hasToAlwaysSyncExtension(extensionId: string): boolean {
		const configuredIgnoredExtensions = this.getConfiguredIgnoredExtensions();
		return configuredIgnoredExtensions.includes(`-${extensionId.toLowerCase()}`);
	}

	updateIgnoredExtensions(ignoredExtensionId: string, ignore: boolean): Promise<void> {
		// first remove the extension completely from ignored extensions
		let currentValue = [...this.configurationService.getValue<string[]>('settingsSync.ignoredExtensions')].map(id => id.toLowerCase());
		currentValue = currentValue.filter(v => v !== ignoredExtensionId && v !== `-${ignoredExtensionId}`);

		// Add only if ignored
		if (ignore) {
			currentValue.push(ignoredExtensionId.toLowerCase());
		}

		return this.configurationService.updateValue('settingsSync.ignoredExtensions', currentValue.length ? currentValue : undefined, ConfigurationTarget.USER);
	}

	updateSynchronizedExtensions(extensionId: string, sync: boolean): Promise<void> {
		// first remove the extension completely from ignored extensions
		let currentValue = [...this.configurationService.getValue<string[]>('settingsSync.ignoredExtensions')].map(id => id.toLowerCase());
		currentValue = currentValue.filter(v => v !== extensionId && v !== `-${extensionId}`);

		// Add only if synced
		if (sync) {
			currentValue.push(`-${extensionId.toLowerCase()}`);
		}

		return this.configurationService.updateValue('settingsSync.ignoredExtensions', currentValue.length ? currentValue : undefined, ConfigurationTarget.USER);
	}

	getIgnoredExtensions(installed: ILocalExtension[]): string[] {
		const defaultIgnoredExtensions = installed.filter(i => i.isMachineScoped).map(i => i.identifier.id.toLowerCase());
		const value = this.getConfiguredIgnoredExtensions().map(id => id.toLowerCase());
		const added: string[] = [], removed: string[] = [];
		if (Array.isArray(value)) {
			for (const key of value) {
				if (key.startsWith('-')) {
					removed.push(key.substring(1));
				} else {
					added.push(key);
				}
			}
		}
		return distinct([...defaultIgnoredExtensions, ...added,].filter(setting => !removed.includes(setting)));
	}

	private getConfiguredIgnoredExtensions(): ReadonlyArray<string> {
		let userValue = this.configurationService.inspect<string[]>('settingsSync.ignoredExtensions').userValue;
		if (userValue !== undefined) {
			return userValue;
		}
		userValue = this.configurationService.inspect<string[]>('sync.ignoredExtensions').userValue;
		if (userValue !== undefined) {
			return userValue;
		}
		return (this.configurationService.getValue<string[]>('settingsSync.ignoredExtensions') || []).map(id => id.toLowerCase());
	}
}
