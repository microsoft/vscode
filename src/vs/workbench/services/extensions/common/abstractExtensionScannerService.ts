/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ImplicitActivationEvents } from 'vs/platform/extensionManagement/common/implicitActivationEvents';
import { IRelaxedExtensionDescription } from 'vs/platform/extensions/common/extensions';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';

export enum ScanLocation {
	Web,
	Remote,
	Local
}

export const IUnifiedExtensionScannerService = createDecorator<IUnifiedExtensionScannerService>('IUnifiedExtensionScannerService');
export interface IUnifiedExtensionScannerService {
	readonly _serviceBrand: undefined;

	scanExtensions(location: ScanLocation): Promise<Readonly<IRelaxedExtensionDescription>[]>;
}

export abstract class AbstractExtensionScannerService implements IUnifiedExtensionScannerService {
	public _serviceBrand: undefined;

	async scanExtensions(location: ScanLocation) {
		const extensions = await this._doScanExtensions(location);
		extensions.forEach(extension => ImplicitActivationEvents.updateManifest(extension));
		return extensions;
	}

	protected abstract _doScanExtensions(scanLocation: ScanLocation): Promise<Readonly<IRelaxedExtensionDescription>[]>;
}
