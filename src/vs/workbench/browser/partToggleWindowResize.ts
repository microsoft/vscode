/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDimension } from '../../base/browser/dom.js';
import { DeferredPromise, Sequencer, raceTimeout } from '../../base/common/async.js';
import { Emitter, Event } from '../../base/common/event.js';
import { Disposable, DisposableStore } from '../../base/common/lifecycle.js';
import { ILogService } from '../../platform/log/common/log.js';
import { IWindowResizeAnchor, IWindowResizeDelta } from '../../platform/native/common/native.js';
import { IHostService } from '../services/host/browser/host.js';
import { Parts } from '../services/layout/browser/layoutService.js';

export interface IPartToggleWindowResize {
	readonly part: Parts;
	readonly editorSize: IDimension;
	readonly delta: IWindowResizeDelta;
	readonly anchor: IWindowResizeAnchor;
	readonly partSizes: readonly IPartToggleSize[];
}

export interface IPartToggleSize {
	readonly part: Parts;
	readonly size: number;
	readonly horizontal: boolean;
}

interface IWindowResizeLayout {
	readonly onDidLayout: Event<IDimension>;
	getDimension(): IDimension;
	canResize(): boolean;
	restoreSizes(editorSize: IDimension, partSizes: readonly IPartToggleSize[]): void;
}

/**
 * Serializes window resizes and preserves part sizes across overlapping toggles.
 */
export class PartToggleWindowResizeController extends Disposable {
	private readonly sequencer = new Sequencer();
	private readonly onWillDispose = this._register(new Emitter<void>());
	private readonly partSizes = new Map<Parts, IPartToggleSize>();
	private editorSize: IDimension | undefined;
	private pending = 0;
	private disposed = false;

	constructor(
		private readonly layout: IWindowResizeLayout,
		private readonly hostService: Pick<IHostService, 'resizeMainWindow'>,
		private readonly logService: ILogService
	) {
		super();
	}

	resize(resize: IPartToggleWindowResize): Promise<void> {
		if (this.disposed) {
			return Promise.resolve();
		}

		this.editorSize ??= resize.editorSize;
		for (const partSize of resize.partSizes) {
			if (this.partSizes.get(partSize.part)?.horizontal !== partSize.horizontal) {
				this.partSizes.set(partSize.part, partSize);
			}
		}
		// The part may still be squeezed by a pending resize.
		const partSize = this.partSizes.get(resize.part)?.size ?? Math.abs(resize.delta.width || resize.delta.height);
		const delta = {
			width: Math.sign(resize.delta.width) * partSize,
			height: Math.sign(resize.delta.height) * partSize
		};
		this.pending++;

		return this.sequencer.queue(async () => {
			try {
				if (this.disposed || !this.layout.canResize()) {
					return;
				}

				const target = await this.hostService.resizeMainWindow(delta, resize.anchor);
				if (!target || this.disposed) {
					return;
				}

				if (!await this.waitForLayout(target)) {
					if (!this.disposed) {
						this.logService.warn('[layout] Timed out waiting for the window resize');
					}
					return;
				}

				if (!this.disposed && this.pending === 1 && this.editorSize && this.layout.canResize()) {
					this.layout.restoreSizes(this.editorSize, [...this.partSizes.values()]);
				}
			} catch (error) {
				this.logService.warn('[layout] resizeWindowToKeepEditorSize failed', error);
			} finally {
				if (--this.pending === 0) {
					this.editorSize = undefined;
					this.partSizes.clear();
				}
			}
		});
	}

	private async waitForLayout(target: IDimension): Promise<boolean> {
		// Allow for rounding when converting native bounds to CSS pixels.
		const matches = (dimension: IDimension) => Math.abs(dimension.width - target.width) < 1 && Math.abs(dimension.height - target.height) < 1;
		if (matches(this.layout.getDimension())) {
			return true; // Layout may arrive before the IPC reply.
		}

		const store = new DisposableStore();
		const completed = new DeferredPromise<boolean>();
		store.add(this.layout.onDidLayout(dimension => {
			if (matches(dimension)) {
				void completed.complete(true);
			}
		}));
		store.add(this.onWillDispose.event(() => void completed.complete(false)));
		try {
			return await raceTimeout(completed.p, 1000) ?? false;
		} finally {
			store.dispose();
			void completed.complete(false);
		}
	}

	override dispose(): void {
		this.disposed = true;
		this.onWillDispose.fire();
		super.dispose();
	}
}
