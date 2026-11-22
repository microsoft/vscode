/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { IObservable, observableValue } from '../../../../base/common/observable.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { ISessionCanvasDefinition, SessionCanvasExtensionSource } from '../../../../workbench/services/sessions/common/session.js';
import { canStartSessionWithCanvas, ISessionCanvasCatalogService } from '../common/sessionCanvas.js';

const CANVAS_CATALOG_STORAGE_KEY = 'sessions.canvasCatalog';

/** Icons larger than this are not remembered, to keep the stored catalog small. */
const MAX_STORED_ICON_LENGTH = 32 * 1024;

interface IStoredCanvasCatalog {
	readonly version: 1;
	readonly canvases: readonly ISessionCanvasDefinition[];
}

const extensionSources: readonly SessionCanvasExtensionSource[] = ['user', 'project', 'session', 'plugin', 'unknown'];

/** Keeps the fields a catalog entry needs, so that two listings of the same canvas types compare equal. */
function toCatalogEntry(canvas: ISessionCanvasDefinition): ISessionCanvasDefinition {
	return {
		canvasId: canvas.canvasId,
		extensionId: canvas.extensionId,
		extensionSource: canvas.extensionSource,
		...(canvas.extensionName ? { extensionName: canvas.extensionName } : {}),
		displayName: canvas.displayName,
		description: canvas.description,
		...(canvas.icon && canvas.icon.length <= MAX_STORED_ICON_LENGTH ? { icon: canvas.icon } : {}),
		requiresInput: canvas.requiresInput,
	};
}

function isStoredCanvas(value: unknown): value is ISessionCanvasDefinition {
	if (typeof value !== 'object' || value === null) {
		return false;
	}
	const canvas = value as Partial<Record<keyof ISessionCanvasDefinition, unknown>>;
	return typeof canvas.canvasId === 'string'
		&& typeof canvas.extensionId === 'string'
		&& extensionSources.includes(canvas.extensionSource as SessionCanvasExtensionSource)
		&& (canvas.extensionName === undefined || typeof canvas.extensionName === 'string')
		&& typeof canvas.displayName === 'string'
		&& typeof canvas.description === 'string'
		&& (canvas.icon === undefined || typeof canvas.icon === 'string')
		&& typeof canvas.requiresInput === 'boolean';
}

function readCatalog(storageService: IStorageService): ISessionCanvasDefinition[] {
	const stored = storageService.getObject<Partial<IStoredCanvasCatalog>>(CANVAS_CATALOG_STORAGE_KEY, StorageScope.PROFILE);
	if (stored?.version !== 1 || !Array.isArray(stored.canvases)) {
		return [];
	}
	return stored.canvases.filter(isStoredCanvas).map(toCatalogEntry).filter(canStartSessionWithCanvas);
}

function sortCatalog(canvases: Iterable<ISessionCanvasDefinition>): ISessionCanvasDefinition[] {
	return [...canvases].sort((a, b) => a.displayName.localeCompare(b.displayName) || a.extensionId.localeCompare(b.extensionId) || a.canvasId.localeCompare(b.canvasId));
}

export class SessionCanvasCatalogService extends Disposable implements ISessionCanvasCatalogService {

	declare readonly _serviceBrand: undefined;
	private readonly catalog = observableValue<readonly ISessionCanvasDefinition[]>(this, []);
	readonly entries: IObservable<readonly ISessionCanvasDefinition[]> = this.catalog;

	constructor(
		@IStorageService private readonly storageService: IStorageService,
	) {
		super();
		this.catalog.set(sortCatalog(readCatalog(storageService)), undefined);
	}

	replace(canvases: readonly ISessionCanvasDefinition[]): void {
		const next = sortCatalog(canvases.filter(canStartSessionWithCanvas).map(toCatalogEntry));
		if (JSON.stringify(next) === JSON.stringify(this.catalog.get())) {
			return;
		}
		this.catalog.set(next, undefined);
		const stored: IStoredCanvasCatalog = { version: 1, canvases: next };
		this.storageService.store(CANVAS_CATALOG_STORAGE_KEY, JSON.stringify(stored), StorageScope.PROFILE, StorageTarget.MACHINE);
	}
}
