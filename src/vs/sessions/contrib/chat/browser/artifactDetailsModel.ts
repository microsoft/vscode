/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { status } from '../../../../base/browser/ui/aria/aria.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { toErrorMessage } from '../../../../base/common/errorMessage.js';
import { Disposable, DisposableMap, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { autorun, derived, IObservable, IReader, observableSignal, observableValue } from '../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { getArtifactDetailsDescription, getArtifactDetailsItemLabel, getArtifactThemeIcon } from '../../../../platform/artifactIntegrations/browser/artifactDetailsList.js';
import { ArtifactActionView, ArtifactAvailability, ArtifactContributionSnapshot, ArtifactDetails, ArtifactDetailsItem, ArtifactItemActionDescriptor, ArtifactRun, ArtifactSnapshot, artifactBindingId, getArtifactMainContribution, IArtifactDetailsModel, isArtifactRunSettled } from '../../../../platform/artifactIntegrations/common/artifactIntegration.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { getChatPillEntryToolbarActions } from '../../../../workbench/browser/chatPills.js';
import { ArtifactActivitiesModel, artifactRunStateLabel } from './artifactActivitiesModel.js';
import { ArtifactAutopilotModel } from './artifactAutopilotModel.js';
import { artifactViewKey as key, IArtifactActionViewData, IArtifactDetailsViewData, IArtifactListViewData, IArtifactSectionTarget } from './artifactDetailsView.js';
import { ArtifactIntegrationPresentation } from './artifactIntegrationPresentation.js';

function availabilityText(availability: ArtifactAvailability | undefined): string {
	return !availability || availability.kind === 'loading' || availability.kind === 'available' ? '' : availability.reason;
}

function requiresAuthentication(contribution: ArtifactContributionSnapshot): boolean {
	return !!contribution.authentication || contribution.view.availability.kind === 'authenticationRequired';
}

class ArtifactDetailsLease extends Disposable {
	readonly value = observableValue<ArtifactDetails | undefined>(this, undefined);
	private readonly model = this._register(new MutableDisposable<IArtifactDetailsModel>());

	constructor(presentation: ArtifactIntegrationPresentation, integrationId: string, detailsId: string, label: string) {
		super();
		void this.acquire(presentation, integrationId, detailsId, label);
	}

	private async acquire(presentation: ArtifactIntegrationPresentation, integrationId: string, detailsId: string, label: string): Promise<void> {
		try {
			const model = await presentation.model.acquireDetails(integrationId, detailsId);
			if (this._store.isDisposed) {
				model.dispose();
				return;
			}
			this.model.value = model;
			this._register(autorun(reader => this.value.set(model.details.read(reader), undefined)));
		} catch (error) {
			if (!this._store.isDisposed) {
				this.value.set({ title: label, availability: { kind: 'error', reason: toErrorMessage(error) }, links: [], items: [], completeness: 'complete' }, undefined);
			}
		}
	}

	get canLoadMore(): boolean { return !!this.model.value?.loadMore; }

	async loadMore(): Promise<void> {
		if (!this.model.value?.loadMore) {
			throw new Error(localize('artifactPartialList', "This list is incomplete. Open the resource to see all items."));
		}
		await this.model.value.loadMore(CancellationToken.None);
	}

	async runItemAction(itemId: string, actionId: string): Promise<void> {
		if (!this.model.value?.runItemAction) {
			throw new Error(localize('artifactItemActionUnavailable', "This action is no longer available for this item."));
		}
		await this.model.value.runItemAction(itemId, actionId, CancellationToken.None);
	}
}

/** Owns the live details subscription and projects provider data into one renderable view model. */
export class ArtifactDetailsModel extends Disposable {
	private readonly leases = this._register(new DisposableMap<string, ArtifactDetailsLease>());
	private readonly leasesChanged = observableSignal(this);
	private readonly changed = observableSignal(this);
	private readonly requests = new Map<string, string | undefined>();
	/** Item actions in progress, which keeps their rows busy until the provider settles. */
	private readonly pendingItemActions = new Set<string>();
	private readonly autopilot: ArtifactAutopilotModel;
	private readonly activities: ArtifactActivitiesModel;
	readonly data: IObservable<IArtifactDetailsViewData>;

	constructor(
		private readonly presentation: ArtifactIntegrationPresentation,
		private readonly dismiss: () => void,
		@IInstantiationService instantiationService: IInstantiationService,
		@IOpenerService private readonly openerService: IOpenerService,
	) {
		super();
		const run = (operation: () => Promise<void>) => presentation.run(operation);
		this.autopilot = this._register(instantiationService.createInstance(ArtifactAutopilotModel, presentation.snapshot, presentation.model, presentation.viewState, run));
		this.activities = this._register(instantiationService.createInstance(ArtifactActivitiesModel, presentation.snapshot, presentation.model, presentation.viewState, run, dismiss));
		this._register(autorun(reader => {
			const snapshot = presentation.snapshot.read(reader);
			const wanted = new Map<string, { integrationId: string; detailsId: string; label: string }>();
			for (const contribution of snapshot.contributions) {
				if (requiresAuthentication(contribution)) {
					continue;
				}
				const { main, sections, lists } = contribution.view;
				for (const part of [...main ? [main] : [], ...sections, ...lists ?? []]) {
					wanted.set(key(contribution.integrationId, part.detailsId), { integrationId: contribution.integrationId, detailsId: part.detailsId, label: part.label });
				}
			}
			for (const id of this.leases.keys()) {
				if (!wanted.has(id)) {
					this.leases.deleteAndDispose(id);
				}
			}
			for (const [id, part] of wanted) {
				if (!this.leases.has(id)) {
					this.leases.set(id, new ArtifactDetailsLease(presentation, part.integrationId, part.detailsId, part.label));
				}
			}
			this.leasesChanged.trigger(undefined);
		}));
		this.data = derived(this, reader => this.read(reader));
	}

	private read(reader: IReader): IArtifactDetailsViewData {
		this.leasesChanged.read(reader);
		this.changed.read(reader);
		const snapshot = this.presentation.snapshot.read(reader);
		const details = new Map([...this.leases].map(([id, lease]) => [id, lease.value.read(reader)]));
		const contribution = getArtifactMainContribution(snapshot);
		const main = contribution?.view.main;
		const mainDetails = main && contribution ? details.get(key(contribution.integrationId, main.detailsId)) : undefined;
		const loading = snapshot.contributions.some(contribution => contribution.view.availability.kind === 'loading')
			|| !!(main && contribution && !requiresAuthentication(contribution) && (!mainDetails || mainDetails.availability.kind === 'loading'));
		const title = mainDetails?.title || snapshot.artifact.label;
		const description = (mainDetails ? getArtifactDetailsDescription(mainDetails) : '') || (mainDetails?.availability.kind === 'available' ? localize('artifactNoDescription', "No description provided.") : '');
		const message = [...new Set([
			...snapshot.contributions.map(contribution => availabilityText(contribution.view.availability)),
			...(main && contribution && !requiresAuthentication(contribution) ? [availabilityText(mainDetails?.availability)] : []),
		].filter(Boolean))].join('\n');
		const lists: IArtifactListViewData[] = [];
		const listTargets = new Map<string, string>();
		for (const contribution of snapshot.contributions) {
			if (requiresAuthentication(contribution)) {
				continue;
			}
			const references = contribution.view.lists ?? [
				...contribution.view.main ? [{ ...contribution.view.main, id: key('main', contribution.view.main.detailsId) }] : [],
				...contribution.view.sections.map(section => ({ ...section, id: key('section', section.id) })),
			].filter(part => {
				const value = details.get(key(contribution.integrationId, part.detailsId));
				return !!value?.items.length || value?.completeness === 'partial';
			});
			for (const reference of references) {
				const id = key(contribution.integrationId, reference.id);
				const detailKey = key(contribution.integrationId, reference.detailsId);
				const value = details.get(detailKey);
				const lease = this.leases.get(detailKey);
				const loading = !value || value.availability.kind === 'loading';
				const items = value?.items ?? [];
				const itemActions = new Map(items.flatMap(item => {
					const actions = this.itemActionButtons(detailKey, value?.itemActions ?? [], item);
					return actions.length ? [[item.id, actions] as const] : [];
				}));
				listTargets.set(detailKey, id);
				lists.push({
					id, title: value?.title || reference.label,
					icon: getArtifactThemeIcon(reference.icon ?? contribution.view.sections.find(section => section.detailsId === reference.detailsId)?.icon ?? Codicon.listFlat),
					description: value ? getArtifactDetailsDescription(value) : '',
					message: availabilityText(value?.availability) || (!loading && !items.length ? value?.completeness === 'partial'
						? localize('artifactListIncomplete', "This list is incomplete.") : localize('artifactListEmpty', "No items.") : ''),
					loading, items, itemActions,
					more: value?.completeness === 'partial' ? {
						id: key(id, 'loadMore'), label: localize('artifactLoadMore', "Load More"), enabled: lease?.canLoadMore === true,
						description: lease?.canLoadMore ? undefined : localize('artifactPartialList', "This list is incomplete. Open the resource to see all items."),
						run: () => {
							void this.presentation.run(async () => {
								const current = this.leases.get(detailKey);
								if (!current) {
									throw new Error(localize('artifactListUnavailable', "This artifact list is no longer available."));
								}
								await current.loadMore();
							});
						},
					} : undefined,
					openItem: item => {
						void this.presentation.run(async () => {
							const uri = URI.parse(item.resource, true);
							if (['command', 'javascript', 'data'].includes(uri.scheme.toLowerCase())) {
								throw new Error(localize('artifactUnsafeLink', "This artifact link cannot be opened."));
							}
							await this.openerService.open(uri, { fromUserGesture: true, allowCommands: false });
						});
					},
				});
			}
		}
		const actions = snapshot.contributions.flatMap(contribution => requiresAuthentication(contribution) ? [] : this.actionButtons(snapshot, contribution, contribution.view.stateActions));
		actions.sort((a, b) => Number(a.enabled === false) - Number(b.enabled === false));
		const stateActions = actions.map((action, index) => ({ ...action, primary: index === 0 }));
		const entry = this.presentation.baseEntry;
		const generalActions: IArtifactActionViewData[] = [
			...snapshot.contributions.flatMap(contribution => {
				const authentication = this.presentation.authenticationButton(contribution);
				return authentication ? [authentication] : this.actionButtons(snapshot, contribution, contribution.view.generalActions);
			}),
			...(entry ? getChatPillEntryToolbarActions(entry) : []).map(action => {
				const glyphClass = action.class?.split(' ').find(value => value.startsWith('codicon-'));
				return {
					id: `shell:${action.id}`, label: action.hoverLabel ?? action.label, ariaLabel: action.label,
					description: action.tooltip || action.label, enabled: action.enabled,
					icon: glyphClass ? getArtifactThemeIcon({ id: glyphClass.slice('codicon-'.length) }) : undefined,
					run: () => { void this.presentation.run(async () => { await action.run(); }); },
				};
			}),
		];
		const sections: IArtifactSectionTarget[] = [];
		for (const contribution of snapshot.contributions) {
			const authentication = this.presentation.authenticationButton(contribution);
			sections.push({ id: key(contribution.integrationId), target: authentication ? { kind: 'action', id: authentication.id } : undefined, pending: false });
			const references = [...contribution.view.main ? [contribution.view.main] : [], ...contribution.view.sections, ...contribution.view.lists ?? []];
			for (const id of new Set(references.map(part => key(contribution.integrationId, part.detailsId)))) {
				const value = details.get(id);
				const list = lists.find(list => list.id === listTargets.get(id));
				const action = value?.links.find(link => link.kind === 'action' && [...stateActions, ...generalActions].some(action => action.id === key(contribution.integrationId, link.actionId)));
				sections.push({
					id, target: list ? { kind: 'list', id: list.id } : action?.kind === 'action' ? { kind: 'action', id: key(contribution.integrationId, action.actionId) }
						: authentication ? { kind: 'action', id: authentication.id } : undefined,
					pending: !requiresAuthentication(contribution) && (list ? list.loading && !list.items.length : !value),
				});
			}
		}
		const autopilot = this.autopilot.data.read(reader);
		const activities = this.activities.data.read(reader);
		const selectedList = lists.some(list => list.id === this.presentation.viewState.selectedList) ? this.presentation.viewState.selectedList : undefined;
		return {
			title, resource: snapshot.artifact.resource, icon: main ? getArtifactThemeIcon(main.icon) : entry?.icon,
			titleDescription: main?.description ?? '', description, message, loading, lists, selectedList, stateActions, generalActions, autopilot, activities, sections,
			openResource: () => {
				void this.presentation.run(async () => {
					const entry = this.presentation.baseEntry;
					if (!entry) {
						throw new Error(localize('artifactResourceUnavailable', "This artifact is no longer available."));
					}
					await entry.open();
				});
			},
			selectList: id => {
				if (this.presentation.viewState.selectedList !== id) {
					this.presentation.viewState.selectedList = id;
					this.changed.trigger(undefined);
				}
			},
			accessibleText: [
				title, main?.description, description, message,
				...lists.flatMap(list => [list.title, list.description, list.message, ...list.items.map(item => {
					const actions = list.itemActions.get(item.id)?.map(action => action.label);
					return actions?.length ? localize('artifactAccessibleItemActions', "{0} (actions: {1})", getArtifactDetailsItemLabel(item), actions.join(', ')) : getArtifactDetailsItemLabel(item);
				}), list.more?.description]),
				...[...stateActions, ...generalActions].map(action => action.enabled === false ? localize('artifactAccessibleDisabled', "{0}: unavailable. {1}", action.label, action.description ?? '') : action.label),
				...autopilot.flatMap(group => [group.title, group.summary, ...group.rules.map(rule =>
					localize('artifactAccessibleAutomation', "{0}: {1}. {2}", rule.label, rule.checked ? rule.policy?.label ?? localize('artifactAutomationOn', "On")
						: rule.policy ? localize('artifactAutomationOffWithPolicy', "Off; selected policy: {0}", rule.policy.label) : localize('artifactAutomationOff', "Off"), rule.description))]),
				...activities.items.length ? [localize('artifactActivities', "Activities"), activities.summary, ...activities.items.map(item => item.description), activities.message] : [],
			].filter(Boolean).join('\n'),
		};
	}

	/** Row actions for one details item, in the order the item lists them. */
	private itemActionButtons(detailKey: string, descriptors: readonly ArtifactItemActionDescriptor[], item: ArtifactDetailsItem): IArtifactActionViewData[] {
		return (item.actions ?? []).flatMap(actionId => {
			const action = descriptors.find(action => action.id === actionId);
			if (!action) {
				return [];
			}
			const id = JSON.stringify([detailKey, item.id, action.id]);
			const pending = this.pendingItemActions.has(id);
			return [{
				id, label: action.label, enabled: !pending,
				description: pending ? localize('artifactItemActionRunning', "Running") : undefined,
				icon: pending ? ThemeIcon.modify(Codicon.loading, 'spin') : getArtifactThemeIcon({ id: action.iconId }),
				run: () => {
					if (this.pendingItemActions.has(id)) {
						return;
					}
					this.pendingItemActions.add(id);
					this.changed.trigger(undefined);
					void this.presentation.run(async () => {
						try {
							const lease = this.leases.get(detailKey);
							if (!lease) {
								throw new Error(localize('artifactListUnavailable', "This artifact list is no longer available."));
							}
							await lease.runItemAction(item.id, action.id);
							status(localize('artifactItemActionCompleted', "{0} completed for {1}", action.label, item.label));
						} finally {
							this.pendingItemActions.delete(id);
							if (!this._store.isDisposed) {
								this.changed.trigger(undefined);
							}
						}
					});
				},
			}];
		});
	}

	private activity(snapshot: ArtifactSnapshot, integrationId: string, actionId: string): { run?: ArtifactRun; latest?: ArtifactRun; requested: boolean } {
		const id = key(integrationId, actionId);
		const requested = this.requests.get(id);
		if (requested && snapshot.runs.some(run => run.id === requested)) {
			this.requests.delete(id);
		}
		const authority = snapshot.contributions.find(contribution => contribution.integrationId === integrationId)?.authority ?? snapshot.authority;
		const bindingId = artifactBindingId(authority.id, snapshot.session, snapshot.artifact.id, integrationId);
		const runs = snapshot.runs.filter(run => run.bindingId === bindingId && run.actionId === actionId);
		const unsettled = runs.filter(run => !isArtifactRunSettled(run));
		return { run: unsettled.find(run => run.dispatched) ?? unsettled.at(-1), latest: runs.at(-1), requested: this.requests.has(id) };
	}

	private actionButtons(snapshot: ArtifactSnapshot, contribution: ArtifactContributionSnapshot, views: readonly ArtifactActionView[]): IArtifactActionViewData[] {
		return views.flatMap(view => {
			const action = contribution.actions.find(action => action.id === view.id);
			if (!action) {
				return [];
			}
			const activity = this.activity(snapshot, contribution.integrationId, view.id);
			const busy = !!activity.run || activity.requested;
			const description = activity.run?.state === 'blocked' ? localize('artifactRunWaiting', "Waiting: {0}", activity.run.reason)
				: busy ? activity.run?.source === 'automation'
					? localize('artifactRunAutomatic', "{0} automatically", artifactRunStateLabel(activity.run.state)) : artifactRunStateLabel(activity.run?.state ?? 'queued')
					: !view.enabled ? view.disabledReason ?? (availabilityText(contribution.view.availability) || localize('artifactActionUnavailable', "This action is not available in the current resource state."))
						: activity.latest?.indeterminate ? localize('artifactRunOutcomeUnknown', "The outcome of the last run is unknown. Reconcile it in Activities.") : undefined;
			return [{
				id: key(contribution.integrationId, view.id), label: action.label, description,
				icon: activity.run?.state === 'blocked' ? Codicon.watch : busy ? ThemeIcon.modify(Codicon.loading, 'spin') : getArtifactThemeIcon({ id: action.iconId }),
				enabled: view.enabled && !busy, run: () => this.invoke(contribution.integrationId, action.id),
			}];
		});
	}

	private invoke(integrationId: string, actionId: string): void {
		const snapshot = this.presentation.snapshot.get();
		const contribution = snapshot.contributions.find(contribution => contribution.integrationId === integrationId);
		const view = contribution && [...contribution.view.stateActions, ...contribution.view.generalActions].find(view => view.id === actionId);
		if (this._store.isDisposed || !contribution || !view?.enabled) {
			void this.presentation.run(async () => { throw new Error(localize('artifactActionUnavailable', "This action is not available in the current resource state.")); });
			return;
		}
		if (this.activity(snapshot, integrationId, actionId).run || this.requests.has(key(integrationId, actionId))) {
			return;
		}
		if (contribution.actions.find(action => action.id === actionId)?.kind === 'code') {
			this.dismiss();
		}
		const id = key(integrationId, actionId);
		this.requests.set(id, undefined);
		this.changed.trigger(undefined);
		void this.presentation.run(async () => {
			try {
				const run = await this.presentation.invoke(integrationId, actionId);
				this.requests.set(id, run.id);
			} catch (error) {
				this.requests.delete(id);
				throw error;
			} finally {
				this.changed.trigger(undefined);
			}
		});
	}
}
