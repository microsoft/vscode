/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DeferredPromise, raceTimeout } from '../../../../base/common/async.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { toErrorMessage } from '../../../../base/common/errorMessage.js';
import { CancellationError } from '../../../../base/common/errors.js';
import { Disposable, DisposableMap, DisposableStore, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { autorun, derived, IObservable, observableSignal } from '../../../../base/common/observable.js';
import { isEqual } from '../../../../base/common/resources.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { ArtifactRun, ArtifactRunState, ArtifactSnapshot, IArtifactModel, isArtifactRunSettled } from '../../../../platform/artifactIntegrations/common/artifactIntegration.js';
import { IChatWidget, IChatWidgetService } from '../../../../workbench/contrib/chat/browser/chat.js';
import { IChatRequestViewModel, IChatResponseViewModel, isRequestVM, isResponseVM } from '../../../../workbench/contrib/chat/common/model/chatViewModel.js';
import { ISessionsService } from '../../../services/sessions/browser/sessionsService.js';
import { ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';
import { ArtifactDetailsViewState, IArtifactActivitiesViewData, IArtifactActivityViewData } from './artifactDetailsView.js';

interface IActivityPage {
	readonly runs: readonly ArtifactRun[];
	readonly next?: string;
}

/** Adapts runtime history to display rows and owns paging, execution recovery and chat navigation. */
export class ArtifactActivitiesModel extends Disposable {
	private readonly changed = observableSignal(this);
	private readonly pages: IActivityPage[] = [];
	private readonly pending = new Set<string>();
	private loading = false;
	private error = '';
	private retryPage = 0;
	private generation = 0;
	readonly data: IObservable<IArtifactActivitiesViewData>;

	constructor(
		private readonly snapshot: IObservable<ArtifactSnapshot>,
		private readonly model: IArtifactModel,
		state: ArtifactDetailsViewState,
		private readonly run: (operation: () => Promise<void>) => Promise<void>,
		private readonly dismiss: () => void,
		@ISessionsManagementService private readonly sessionsManagementService: ISessionsManagementService,
		@ISessionsService private readonly sessionsService: ISessionsService,
		@IChatWidgetService private readonly chatWidgetService: IChatWidgetService,
	) {
		super();
		this.data = derived(this, reader => {
			this.changed.read(reader);
			const snapshot = this.snapshot.read(reader);
			const items = this.runs(snapshot).map(run => this.item(run, snapshot));
			return {
				expanded: state.activitiesExpanded,
				loading: this.loading,
				items,
				summary: localize('artifactActivitiesLoadedCount', "{0} loaded", items.length),
				message: this.error,
				more: this.error ? {
					id: 'retry', label: localize('artifactActivitiesRetry', "Retry Loading Activities"),
					enabled: !this.loading, run: () => { void this.loadPage(this.retryPage); },
				} : this.pages.at(-1)?.next ? {
					id: 'earlier', label: localize('artifactEarlierActivities', "Earlier Activities"),
					enabled: !this.loading, run: () => { void this.loadPage(this.pages.length); },
				} : undefined,
				setExpanded: expanded => {
					state.activitiesExpanded = expanded;
					this.changed.trigger(undefined);
					if (expanded && !this.pages.length && !this.loading) {
						void this.loadPage(0);
					}
				},
			};
		});
		this._register(autorun(reader => {
			const snapshot = this.snapshot.read(reader);
			if (!snapshot.runs.length) {
				this.pages.length = 0;
				this.generation++;
				this.loading = false;
				this.error = '';
				this.changed.trigger(undefined);
			} else if (state.activitiesExpanded && !this.pages.length && !this.loading && !this.error) {
				void this.loadPage(0);
			}
		}));
	}

	private runs(snapshot: ArtifactSnapshot): readonly ArtifactRun[] {
		if (!snapshot.runs.length) {
			return [];
		}
		const runs = new Map<string, ArtifactRun>();
		for (const run of [...this.pages.flatMap(page => page.runs), ...snapshot.runs]) {
			if (run.updatedAt >= (runs.get(run.id)?.updatedAt ?? -1)) {
				runs.set(run.id, run);
			}
		}
		return [...runs.values()].sort((a, b) => b.createdAt - a.createdAt || a.id.localeCompare(b.id));
	}

	private item(run: ArtifactRun, snapshot: ArtifactSnapshot): IArtifactActivityViewData {
		const actions = snapshot.contributions.flatMap(contribution => contribution.actions).filter(action => action.id === run.actionId);
		const name = run.presentation?.action.label ?? (actions.length === 1 ? actions[0].label : run.actionId);
		const label = localize('artifactActivityLabel', "{0}: {1}", name, artifactRunStateLabel(run.state));
		const revealable = !!run.chat && !!run.receipt;
		return {
			id: run.id, label, icon: activityIcon(run),
			description: localize('artifactActivityDescription', "{0}\n{1}\n{2}\n{3}{4}", label, run.reason,
				run.source === 'automation' ? localize('artifactAutomaticActivity', "Automatic action") : localize('artifactManualActivity', "Manual action"),
				new Date(run.createdAt).toLocaleString(), revealable ? localize('artifactRevealActivityHint', "\nSelect to reveal in chat.") : ''),
			reveal: revealable ? () => { void this.run(() => this.reveal(run)); } : undefined,
			action: !run.indeterminate && isArtifactRunSettled(run) ? undefined : {
				id: run.id, label: run.indeterminate ? localize('artifactReconcileOutcome', "Reconcile Outcome") : localize('artifactCancelRun', "Cancel Action"),
				ariaLabel: run.indeterminate ? localize('artifactReconcileActivity', "Reconcile {0}", label) : localize('artifactCancelActivity', "Cancel {0}", label),
				icon: run.indeterminate ? Codicon.refresh : Codicon.closeCompact, iconOnly: true, enabled: !this.pending.has(run.id),
				run: () => this.operate(run),
			},
		};
	}

	private async loadPage(index: number, replacePending = false): Promise<void> {
		if (this._store.isDisposed || (this.loading && !replacePending)) {
			return;
		}
		const before = index === 0 ? undefined : this.pages[index - 1]?.next;
		const generation = ++this.generation;
		this.loading = true;
		this.error = '';
		this.retryPage = index;
		this.changed.trigger(undefined);
		try {
			if (index > 0 && !before) {
				throw new Error(localize('artifactActivityCursorUnavailable', "Earlier activity is no longer available. Reopen the artifact details to refresh its history."));
			}
			const page = await this.model.getRuns(before, 50);
			if (this._store.isDisposed || generation !== this.generation) {
				return;
			}
			if (this.pages[index]?.next !== page.next) {
				this.pages.length = index;
			}
			this.pages[index] = page;
		} catch (error) {
			if (!this._store.isDisposed && generation === this.generation) {
				this.error = localize('artifactActivitiesLoadError', "Could not load activities: {0}", toErrorMessage(error));
			}
		} finally {
			if (!this._store.isDisposed && generation === this.generation) {
				this.loading = false;
				this.changed.trigger(undefined);
			}
		}
	}

	private operate(run: ArtifactRun): void {
		if (this._store.isDisposed || this.pending.has(run.id)) {
			return;
		}
		const pageIndex = Math.max(0, this.pages.findIndex(page => page.runs.some(item => item.id === run.id)));
		this.pending.add(run.id);
		this.changed.trigger(undefined);
		void this.run(async () => {
			try {
				await (run.indeterminate ? this.model.reconcile(run.id) : this.model.cancel(run.id));
				if (!this._store.isDisposed) {
					await this.loadPage(pageIndex, true);
				}
			} finally {
				this.pending.delete(run.id);
				this.changed.trigger(undefined);
			}
		});
	}

	private async reveal(run: ArtifactRun): Promise<void> {
		if (!run.chat || !run.receipt) {
			throw new Error(localize('artifactActivityNoChat', "This activity has no chat destination."));
		}
		const resource = URI.parse(run.chat, true);
		const owner = this.sessionsManagementService.getSessionForChatResource(resource);
		if (!owner) {
			throw new Error(localize('artifactActivityChatUnavailable', "The chat for this activity is no longer available."));
		}
		const id = run.receipt.kind === 'turn' ? run.receipt.turnId : run.receipt.queuedMessageId;
		const ready = new DeferredPromise<{ widget: IChatWidget; item: IChatRequestViewModel | IChatResponseViewModel } | undefined>();
		const store = new DisposableStore();
		let opened = false;
		let cancelled = false;
		try {
			const watches = store.add(new DisposableMap<IChatWidget, DisposableStore>());
			const check = () => {
				if (!opened) {
					return;
				}
				const widget = this.chatWidgetService.getWidgetBySessionResource(resource);
				const items = widget?.viewModel?.getItems() ?? [];
				const item = items.find(item => isRequestVM(item) && item.id === id)
					?? items.find(item => isResponseVM(item) && item.requestId === id);
				if (!ready.isSettled && widget && (isRequestVM(item) || isResponseVM(item))) {
					void ready.complete({ widget, item });
				}
			};
			const watch = (widget: IChatWidget) => {
				const lifetime = new DisposableStore();
				watches.set(widget, lifetime);
				const model = lifetime.add(new MutableDisposable());
				const changed = () => {
					model.value = widget.viewModel?.onDidChange(check);
					check();
				};
				lifetime.add(widget.onDidChangeViewModel(changed));
				changed();
			};
			store.add(this.chatWidgetService.onDidAddWidget(watch));
			store.add(this.chatWidgetService.onDidRemoveWidget(widget => watches.deleteAndDispose(widget)));
			this.chatWidgetService.getAllWidgets().forEach(watch);
			this.dismiss();
			await this.sessionsService.openChat(owner.session, resource, { source: 'link' });
			opened = true;
			store.add(autorun(reader => {
				const active = this.sessionsService.activeSession.read(reader);
				if (!isEqual(active?.activeChat.read(reader)?.resource, resource)) {
					cancelled = true;
					if (!ready.isSettled) {
						void ready.complete(undefined);
					}
				}
			}));
			check();
			const target = await raceTimeout(ready.p, 10_000);
			if (cancelled) {
				throw new CancellationError();
			}
			if (!target) {
				throw new Error(localize('artifactActivityRequestUnavailable', "The activity's message could not be found in its chat."));
			}
			target.widget.reveal(target.item);
			target.widget.focus(target.item);
		} finally {
			store.dispose();
		}
	}
}

export function artifactRunStateLabel(state: ArtifactRunState): string {
	switch (state) {
		case 'queued': return localize('artifactQueued', "Queued");
		case 'preparing': return localize('artifactPreparing', "Preparing");
		case 'blocked': return localize('artifactBlocked', "Waiting");
		case 'submitted': return localize('artifactSubmitted', "Submitted");
		case 'running': return localize('artifactRunning', "Running");
		case 'completed': return localize('artifactCompleted', "Completed");
		case 'skipped': return localize('artifactSkipped', "Skipped");
		case 'failed': return localize('artifactFailed', "Failed");
		case 'cancelled': return localize('artifactCancelled', "Cancelled");
		case 'interrupted': return localize('artifactInterrupted', "Interrupted");
	}
}

function activityIcon(run: ArtifactRun): ThemeIcon {
	switch (run.state) {
		case 'completed': return { ...Codicon.passFilledCompact, color: { id: 'charts.green' } };
		case 'failed': return { ...Codicon.errorCompact, color: { id: 'errorForeground' } };
		case 'interrupted': return { ...Codicon.warning, color: { id: 'editorWarning.foreground' } };
		case 'skipped': return Codicon.skip;
		case 'cancelled': return Codicon.circleSlash;
		case 'blocked': return Codicon.watch;
		case 'queued': return Codicon.clock;
		case 'preparing':
		case 'submitted':
		case 'running': return ThemeIcon.modify(Codicon.loading, 'spin');
	}
}
