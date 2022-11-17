/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { onUnexpectedError } from 'vs/base/common/errors';
import { IExtensionManifest } from 'vs/platform/extensions/common/extensions';

export interface IActivationEventsGenerator<T> {
	(contribution: T, result: { push(item: string): void }): void;
}

export class ImplicitActivationEventsImpl {

	private readonly _generators = new Map<string, IActivationEventsGenerator<any>>();

	public register<T>(extensionPointName: string, generator: IActivationEventsGenerator<T>): void {
		this._generators.set(extensionPointName, generator);
	}

	public updateManifest(manifest: IExtensionManifest) {
		if (!Array.isArray(manifest.activationEvents) || !manifest.contributes) {
			return;
		}
		if (typeof manifest.main === 'undefined' && typeof manifest.browser === 'undefined') {
			return;
		}

		for (const extPointName in manifest.contributes) {
			const generator = this._generators.get(extPointName);
			if (!generator) {
				// There's no generator for this extension point
				continue;
			}
			const contrib = (manifest.contributes as any)[extPointName];
			const contribArr = Array.isArray(contrib) ? contrib : [contrib];
			try {
				generator(contribArr, manifest.activationEvents);
			} catch (err) {
				onUnexpectedError(err);
			}
		}
	}
}

export const ImplicitActivationEvents: ImplicitActivationEventsImpl = new ImplicitActivationEventsImpl();
