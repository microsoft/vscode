/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationError, onUnexpectedError } from '../../../base/common/errors.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { generateUuid } from '../../../base/common/uuid.js';
import { IBrowserViewCreateOptions, IBrowserViewInfo, IBrowserViewService } from './browserView.js';

/** Tracks native view ownership independently of renderer models. */
export class BrowserViewReferences extends Disposable {

	private readonly references = new Map<string, { windowId: number; references: Set<string> }>();

	constructor(
		private readonly getOrCreateView: (id: string, options: IBrowserViewCreateOptions) => IBrowserViewInfo,
		private readonly destroy: (id: string) => void,
	) {
		super();
	}

	acquire(id: string, windowId: number, referenceId: string): void {
		let entry = this.references.get(id);
		if (!entry) {
			entry = { windowId, references: new Set() };
			this.references.set(id, entry);
		}
		if (entry.windowId !== windowId) {
			throw new Error('The browser view belongs to another workbench window.');
		}
		entry.references.add(referenceId);
	}

	getOrCreate(id: string, options: IBrowserViewCreateOptions, referenceId: string): IBrowserViewInfo {
		const entry = this.references.get(id);
		if (entry?.windowId !== options.host.windowId || !entry.references.has(referenceId)) {
			throw new CancellationError();
		}
		return this.getOrCreateView(id, options);
	}

	release(id: string, referenceId: string): void {
		const entry = this.references.get(id);
		if (!entry?.references.delete(referenceId)) {
			return;
		}
		if (!entry.references.size) {
			this.references.delete(id);
			this.destroy(id);
		}
	}

	clear(id: string): void {
		this.references.delete(id);
	}

	clearWindow(windowId: number, preserveViews = false): void {
		for (const [id, entry] of this.references) {
			if (entry.windowId === windowId) {
				this.references.delete(id);
				if (!preserveViews) {
					this.destroy(id);
				}
			}
		}
	}

	override dispose(): void {
		this.references.clear();
		super.dispose();
	}
}

/** An editor or embedded model holds a reference, including while creation crosses IPC. */
export class BrowserViewReference extends Disposable {

	readonly referenceId = generateUuid();
	private readonly ready: Promise<void>;
	private pendingCreations = 0;
	private released = false;

	constructor(private readonly service: IBrowserViewService, private readonly id: string, windowId: number) {
		super();
		this.ready = service.acquireBrowserView(id, windowId, this.referenceId);
		void this.ready.catch(onUnexpectedError);
	}

	async getOrCreate(options: IBrowserViewCreateOptions): Promise<IBrowserViewInfo> {
		this.pendingCreations++;
		try {
			await this.ready;
			if (this._store.isDisposed) {
				throw new CancellationError();
			}
			return await this.service.getOrCreateBrowserView(this.id, options, this.referenceId);
		} finally {
			this.pendingCreations--;
			this.releaseIfDisposed();
		}
	}

	private releaseIfDisposed(): void {
		if (this._store.isDisposed && !this.pendingCreations && !this.released) {
			this.released = true;
			void this.service.releaseBrowserView(this.id, this.referenceId).catch(onUnexpectedError);
		}
	}

	/** Hand native lifetime back to the window when the renderer shuts down. */
	detach(): void {
		this.released = true;
		this.dispose();
	}

	override dispose(): void {
		super.dispose();
		// A pending reply can still be used by a replacement that acquires its own reference.
		this.releaseIfDisposed();
	}
}
