/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IObservable } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';

/**
 * Where the extension that declares a canvas was discovered.
 */
export const enum CanvasCustomizationSourceGroup {
	Workspace = 'workspace',
	User = 'user',
	Plugin = 'plugin',
}

/**
 * Lifecycle state of the extension that declares a canvas.
 */
export const enum CanvasCustomizationStatus {
	Running = 'running',
	Disabled = 'disabled',
}

/**
 * One row on the Canvases customization page.
 *
 * Enablement belongs to the declaring extension, so every row from the same
 * extension shares `enabled` and toggles together. When the extension is off,
 * its canvases cannot be enumerated and a single extension-level
 * row (without `canvasId`) represents it.
 */
export interface ICanvasCustomizationRow {
	/** Stable row identity: `${extensionId}/${canvasId}`, or `extensionId` for an extension-level row. */
	readonly id: string;
	readonly extensionId: string;
	readonly extensionName: string;
	readonly canvasId?: string;
	readonly displayName: string;
	readonly description?: string;
	readonly sourceGroup: CanvasCustomizationSourceGroup;
	readonly pluginName?: string;
	/** Root of the owning installed plugin, used to open its plugin detail. */
	readonly pluginUri?: URI;
	readonly status: CanvasCustomizationStatus;
	readonly enabled: boolean;
	/** Copilot Extension entry file, opened by the source link. Must already be mapped to a client-openable URI. */
	readonly sourceUri?: URI;
}

export const ICanvasCustomizationService = createDecorator<ICanvasCustomizationService>('canvasCustomizationService');

/**
 * Supplies canvases and their declaring extensions to the Canvases
 * customization page for the Copilot harness.
 */
export interface ICanvasCustomizationService {
	readonly _serviceBrand: undefined;

	readonly rows: IObservable<readonly ICanvasCustomizationRow[]>;

	/** True when Copilot extensions are turned off globally or by policy, so no row can be toggled. */
	readonly extensionsDisabled: IObservable<boolean>;

	/** Turns the row's declaring extension on or off, which affects all of its canvases. */
	setEnabled(row: ICanvasCustomizationRow, enabled: boolean): Promise<void>;

	/** Opens or focuses the row's canvas beside the active chat. Only called for enabled, running canvas rows. */
	openCanvas(row: ICanvasCustomizationRow): Promise<void>;
}
