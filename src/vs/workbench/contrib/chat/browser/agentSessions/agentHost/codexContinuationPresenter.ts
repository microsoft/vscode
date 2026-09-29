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
	show(candidate: ICodexContinuationCandidate, visible: () => Promise<boolean>, dismiss: () => void): IDisposable;
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
		this._register(toDisposable(() => { void _nudge.releasePresentation(); }));
	}

	private async _update(): Promise<void> {
		if (this._store.isDisposed) { return; }
		const presentable = this._host.hasFocus && this._delegate.isPresentable() && !!this._nudge.candidate.get();
		if (this._presentation.value) {
			if (!presentable || (this._visible && !this._nudge.ownsEpisode())) { this._presentation.clear(); this._visible = false; void this._nudge.releasePresentation(); }
			return;
		}
		if (!presentable || this._opening) { return; }
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
			let claiming = false;
			const isVisible = () => !presentation.isDisposed && !this._store.isDisposed && this._host.hasFocus && this._delegate.isPresentable();
			presentation.add(this._delegate.show(candidate, async () => {
				if (!isVisible()) { return false; }
				if (this._visible || claiming) { return this._visible; }
				claiming = true;
				try {
					const visible = await this._nudge.markVisible(this._delegate.surface, candidate, isVisible);
					if (presentation.isDisposed) { return false; }
					this._visible = visible;
					if (!this._visible) { this._presentation.clear(); }
					return this._visible;
				} catch (error) {
					onUnexpectedError(error);
					presentation.dispose();
					return false;
				} finally { claiming = false; }
			}, () => {
				if (this._visible) { this._nudge.dismiss(this._delegate.surface); }
				this._presentation.clear();
				void this._nudge.releasePresentation();
			}));

		} catch {
			this._presentation.clear();
			await this._nudge.releasePresentation();
		} finally {
			this._opening = false;
			if (generation !== this._generation && !this._store.isDisposed) { this._schedule.schedule(); }
		}
	}
}
