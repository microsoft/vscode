/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IStringDictionary } from '../../../base/common/collections.js';
import { onUnexpectedError } from '../../../base/common/errors.js';
import { ExtensionIdentifier, IExtensionDescription } from '../../extensions/common/extensions.js';

export interface IActivationEventsGenerator<T> {
	(contributions: readonly T[]): Iterable<string>;
}

export class ImplicitActivationEventsImpl {

	private readonly _generators = new Map<string, IActivationEventsGenerator<unknown>>();
	private readonly _cache = new WeakMap<IExtensionDescription, string[]>();

	public register<T>(extensionPointName: string, generator: IActivationEventsGenerator<T>): void {
		this._generators.set(extensionPointName, generator as IActivationEventsGenerator<unknown>);
	}

	/**
	 * This can run correctly only on the renderer process because that is the only place
	 * where all extension points and all implicit activation events generators are known.
	 */
	public readActivationEvents(extensionDescription: IExtensionDescription): string[] {
		if (!this._cache.has(extensionDescription)) {
			this._cache.set(extensionDescription, this._readActivationEvents(extensionDescription));
		}
		return this._cache.get(extensionDescription)!;
	}

	/**
	 * This can run correctly only on the renderer process because that is the only place
	 * where all extension points and all implicit activation events generators are known.
	 */
	public createActivationEventsMap(extensionDescriptions: IExtensionDescription[]): { [extensionId: string]: string[] } {
		const result: { [extensionId: string]: string[] } = Object.create(null);
		for (const extensionDescription of extensionDescriptions) {
			const activationEvents = this.readActivationEvents(extensionDescription);
			if (activationEvents.length > 0) {
				result[ExtensionIdentifier.toKey(extensionDescription.identifier)] = activationEvents;
			}
		}
		return result;
	}

	private _readActivationEvents(desc: IExtensionDescription): string[] {
		if (typeof desc.main === 'undefined' && typeof desc.browser === 'undefined') {
			return [];
		}

		const activationEvents: string[] = (Array.isArray(desc.activationEvents) ? desc.activationEvents.slice(0) : []);

		for (let i = 0; i < activationEvents.length; i++) {
			// TODO@joao: there's no easy way to contribute this
			if (activationEvents[i] === 'onUri') {
				activationEvents[i] = `onUri:${ExtensionIdentifier.toKey(desc.identifier)}`;
			}
		}

		if (!desc.contributes) {
			// no implicit activation events
			return activationEvents;
		}

		for (const extPointName in desc.contributes) {
			const generator = this._generators.get(extPointName);
			if (!generator) {
				// There's no generator for this extension point
				continue;
			}
			const contrib = (desc.contributes as IStringDictionary<unknown>)[extPointName];
			const contribArr = Array.isArray(contrib) ? contrib : [contrib];
			try {
				activationEvents.push(...generator(contribArr));
			} catch (err) {
				onUnexpectedError(err);
			}
		}

		return activationEvents;
	}
}

export const ImplicitActivationEvents: ImplicitActivationEventsImpl = new ImplicitActivationEventsImpl();
