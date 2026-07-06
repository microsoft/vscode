/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Extension } from 'vscode';
import { Event } from '../../../util/vs/base/common/event';
import { IExtensionsService } from '../../extensions/common/extensionsService';

export class TestExtensionsService implements IExtensionsService {
	readonly _serviceBrand: undefined;

	private readonly _extensions = new Map<string, Extension<void>>();
	public readonly onDidChange = Event.None;

	addExtension(extension: Partial<Extension<void>> & { id: string }) {
		this._extensions.set(extension.id, extension as Extension<void>);
	}

	constructor(extensions: readonly Extension<void>[] = []) {
		for (const extension of extensions) {
			this._extensions.set(extension.id, extension);
		}
	}

	getExtension<T = any>(extensionId: string, includeDifferentExtensionHosts?: boolean): Extension<T> | undefined {
		return this._extensions.get(extensionId) as Extension<T> | undefined;
	}

	get allAcrossExtensionHosts() {
		return Array.from(this._extensions.values());
	}

	get all() {
		return this.allAcrossExtensionHosts;
	}
}
