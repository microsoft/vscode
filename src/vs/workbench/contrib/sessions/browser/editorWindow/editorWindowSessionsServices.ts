/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BrandedService, ServiceIdentifier } from '../../../../../platform/instantiation/common/instantiation.js';
import { InstantiationType, registerSingleton } from '../../../../../platform/instantiation/common/extensions.js';

/** A sessions service that an editor window registers ({@link registerEditorWindowSessionsSingleton}). */
export interface IEditorWindowSessionsSingleton {
	readonly id: ServiceIdentifier<unknown>;
	readonly ctor: new (...args: never[]) => unknown;
}

const singletons: IEditorWindowSessionsSingleton[] = [];

/**
 * Registers a sessions service of an editor window, as {@link registerSingleton} does, and records it, so that it can be
 * told apart from the services that only the Agents window registers (see {@link getEditorWindowSessionsSingletons}).
 */
export function registerEditorWindowSessionsSingleton<T, Services extends BrandedService[]>(id: ServiceIdentifier<T>, ctor: new (...services: Services) => T, supportsDelayedInstantiation: InstantiationType): void {
	registerSingleton(id, ctor, supportsDelayedInstantiation);
	singletons.push({ id, ctor: ctor as new (...args: never[]) => unknown });
}

/** The sessions services that an editor window registers, in the order it registers them. */
export function getEditorWindowSessionsSingletons(): readonly IEditorWindowSessionsSingleton[] {
	return singletons;
}
