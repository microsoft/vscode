/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RunOnceScheduler } from '../../../../../../base/common/async.js';
import { onUnexpectedError } from '../../../../../../base/common/errors.js';
import { Event } from '../../../../../../base/common/event.js';
import { Disposable, DisposableStore, IDisposable, MutableDisposable, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { autorun } from '../../../../../../base/common/observable.js';
import { CodexContinuationSurface, ICodexContinuationCandidate } from '../../../../../services/agentHost/browser/codexContinuation.js';
import { ICodexContinuationService } from '../../../../../services/agentHost/browser/codexContinuationService.js';
import { ILanguageModelsService } from '../../../common/languageModels.js';
import { IHostService } from '../../../../../services/host/browser/host.js';

export interface ICodexContinuationPresentation {
	readonly surface: CodexContinuationSurface;
	readonly onDidChangePresentability: Event<void>;
	isPresentable(): boolean;
	show(candidate: ICodexContinuationCandidate, visible: () => Promise<boolean>, close: (reason: 'action' | 'dismissed') => void, runAction: (action: () => Promise<void> | void) => Promise<void>): IDisposable;
}

/** Keeps both surfaces on the same experiment and visibility boundary. */
export class CodexContinuationPresenter extends Disposable {
	private readonly _presentation = this._register(new MutableDisposable());
	private readonly _schedule = this._register(new RunOnceScheduler(() => { void this._update(); }, 0));
	private _generation = 0;
	private _visible = false;
	private _opening = false;

	constructor(
		private readonly _delegate: ICodexContinuationPresentation,
		@ICodexContinuationService private readonly _nudge: ICodexContinuationService,
		@IHostService private readonly _host: IHostService,
		@ILanguageModelsService models: ILanguageModelsService,
	) {
		super();
		const updateModels = () => _nudge.setSelectableModels(models.getLanguageModelIds().flatMap(id => {
			const model = models.lookupLanguageModel(id);
			return model && model.isUserSelectable !== false ? [{ id: model.id, vendor: model.vendor }] : [];
		}));
		this._register(models.onDidChangeLanguageModels(updateModels));
		updateModels();
		const schedule = () => { this._generation++; this._schedule.schedule(); };
		this._register(autorun(reader => { _nudge.candidate.read(reader); _nudge.revision.read(reader); schedule(); }));
		this._register(_host.onDidChangeFocus(schedule));
		this._register(_delegate.onDidChangePresentability(schedule));
		this._register(toDisposable(() => { void _nudge.releasePresentation(); _nudge.endPreview(); }));
	}

	private async _update(): Promise<void> {
		if (this._store.isDisposed) { return; }
		const surfacePresentable = this._delegate.isPresentable() && !!this._nudge.candidate.get();
		if (this._presentation.value) {
			// Focus gates the initial presentation and claim, but ordinary window
			// switching must not consume a nudge the user can no longer see.
			if (!surfacePresentable || (!this._visible && !this._host.hasFocus) || (this._visible && !this._nudge.ownsEpisode())) {
				this._presentation.clear();
				this._visible = false;
				void this._nudge.releasePresentation();
				this._nudge.endPreview();
			}
			return;
		}
		if (!surfacePresentable || !this._host.hasFocus || this._opening) { return; }
		const generation = this._generation;
		this._opening = true;
		try {
			if (!await this._nudge.wouldShow(this._delegate.surface)) { return; }
			const candidate = await this._nudge.resolve();
			if (!candidate || this._store.isDisposed || generation !== this._generation || !this._host.hasFocus || !this._delegate.isPresentable()) { return; }
			if (!await this._nudge.reservePresentation()) { return; }
			if (this._store.isDisposed || !this._host.hasFocus || !this._delegate.isPresentable()) { await this._nudge.releasePresentation(); return; }
			this._visible = false;
			const presentation = new DisposableStore();
			this._presentation.value = presentation;
			let visibilityClaim: Promise<boolean> | undefined;
			let actionPending = false;
			const isVisible = () => !presentation.isDisposed && !this._store.isDisposed && this._host.hasFocus && this._delegate.isPresentable();
			const close = (reason: 'action' | 'dismissed' | 'unavailable') => {
				// A late callback belongs only to the presentation that created it.
				if (this._presentation.value !== presentation) { return; }
				if (this._visible && reason === 'dismissed') { this._nudge.dismiss(this._delegate.surface); }
				this._presentation.clear();
				this._visible = false;
				void this._nudge.releasePresentation();
				if (reason !== 'action') { this._nudge.endPreview(); }
			};
			const claimVisibility = (): Promise<boolean> => {
				if (!isVisible()) { return Promise.resolve(false); }
				return visibilityClaim ??= (async () => {
					try {
						const visible = await this._nudge.markVisible(this._delegate.surface, candidate, isVisible);
						if (presentation.isDisposed) { return false; }
						this._visible = visible;
						if (visible) { presentation.add(this._nudge.trackVisibility()); }
						else { close('unavailable'); }
						return visible;
					} catch (error) {
						close('unavailable');
						onUnexpectedError(error);
						return false;
					}
				})();
			};
			presentation.add(this._delegate.show(candidate, claimVisibility, close, async action => {
				if (actionPending || !isVisible()) { return; }
				actionPending = true;
				// Clicking is itself evidence of visibility. Share the in-flight claim
				// with the render callback, and keep the surface alive until it settles.
				if (!await claimVisibility() || !isVisible()) { return; }
				close('action');
				try { await action(); } catch (error) { onUnexpectedError(error); }
				finally { this._nudge.endPreview(); }
			}));

		} catch {
			this._presentation.clear();
			this._visible = false;
			await this._nudge.releasePresentation();
			this._nudge.endPreview();
		} finally {
			this._opening = false;
			if (generation !== this._generation && !this._store.isDisposed) { this._schedule.schedule(); }
		}
	}
}
