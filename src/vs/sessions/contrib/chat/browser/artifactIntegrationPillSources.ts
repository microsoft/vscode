/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { equals } from '../../../../base/common/arrays.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { constObservable, derived, derivedOpts, IObservable, mapObservableArrayCached } from '../../../../base/common/observable.js';
import { ArtifactSnapshot, getArtifactMainContribution } from '../../../../platform/artifactIntegrations/common/artifactIntegration.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IChatPillEntry } from '../../../../workbench/browser/chatPills.js';
import { ChatInputPillPins, createChatInputPillSource, IChatInputPillSource } from '../../../../workbench/contrib/chat/browser/chatInputPills.js';
import { SessionChatPillKind } from '../../../../workbench/contrib/chat/common/sessionChatPills.js';
import { ArtifactIntegrationGroup, IArtifactIntegrationGroupMember } from './artifactIntegrationGroup.js';
import { ArtifactIntegrationPresentation, countEnabledArtifactAutomations, IArtifactDetailsHost } from './artifactIntegrationPresentation.js';

/** An integrated artifact or reference, with what the pill row needs to place it. */
export interface IArtifactIntegrationPillItem {
	/** The entry the artifact's pill shows, supplying its title, open target and entry actions. */
	readonly entry: IChatPillEntry;
	readonly presentation: ArtifactIntegrationPresentation;
	readonly kind: SessionChatPillKind;
	/** Whether the record is an artifact rather than a reference. */
	readonly isArtifact: boolean;
	/** Whether the pill kind's own filter, such as showing only open pull requests, keeps the artifact. */
	readonly visible: boolean;
}

/**
 * The group ID the main integration assigns an integrated record, which gives the record a pill of its own instead of
 * listing it in the pill for its kind. Records without a main integration have none.
 */
export function getArtifactIntegrationGroupId(snapshot: ArtifactSnapshot): string | undefined {
	return getArtifactMainContribution(snapshot)?.view.groupId;
}

/**
 * The group an integrated record can join: artifacts of the same pill kind whose main integration assigns them the same
 * group ID share one, even across integrations. References never join a group, nor do records without a group ID.
 */
export function getArtifactIntegrationGroupKey(kind: SessionChatPillKind, isArtifact: boolean, groupId: string | undefined): string | undefined {
	return isArtifact && groupId !== undefined ? JSON.stringify([kind, groupId]) : undefined;
}

/**
 * Identifies the resource an integrated record presents: records the main integration bound to the same canonical
 * resource, such as several links to one experiment step, are aliases of each other. Records not yet bound have none.
 */
export function getArtifactIntegrationAliasKey(snapshot: ArtifactSnapshot): string | undefined {
	const main = getArtifactMainContribution(snapshot);
	return main?.resourceKey !== undefined ? JSON.stringify([(main.authority ?? snapshot.authority).id, main.integrationId, main.resourceKey]) : undefined;
}

/** An integrated record that may be an alias of another record of the same resource. */
export interface IArtifactIntegrationAliasCandidate {
	readonly isArtifact: boolean;
	/** Identifies the resource the record presents; records without a key are never aliases. */
	readonly aliasKey?: string;
	/**
	 * Whether the record has state only its own pill reaches, such as enabled Autopilot rules or activity. Bindings,
	 * consent and runs stay per record, so such a record is never hidden behind another.
	 */
	readonly hasOwnState?: boolean;
}

/** Describes an integrated record's snapshot for {@link collapseArtifactIntegrationAliases}. */
export function getArtifactIntegrationAliasCandidate(snapshot: ArtifactSnapshot): Pick<IArtifactIntegrationAliasCandidate, 'aliasKey' | 'hasOwnState'> {
	return {
		aliasKey: getArtifactIntegrationAliasKey(snapshot),
		hasOwnState: countEnabledArtifactAutomations(snapshot) > 0 || snapshot.runs.length > 0,
	};
}

/**
 * Keeps one record per resource, so aliases recorded several times, such as scorecards of one experiment step, show
 * one pill. The first artifact among the aliases represents them, else the first reference, in its recorded position;
 * `merge` folds the aliases it hides, such as their pins, into it. Aliases with state of their own stay visible.
 */
export function collapseArtifactIntegrationAliases<T extends IArtifactIntegrationAliasCandidate>(items: readonly T[], merge: (representative: T, hidden: readonly T[]) => T = representative => representative): readonly T[] {
	const representatives = new Map<string, T>();
	for (const item of items) {
		if (item.aliasKey !== undefined) {
			const current = representatives.get(item.aliasKey);
			if (!current || (!current.isArtifact && item.isArtifact)) {
				representatives.set(item.aliasKey, item);
			}
		}
	}
	const hidden = new Map<T, T[]>();
	const kept = items.filter(item => {
		const representative = item.aliasKey !== undefined ? representatives.get(item.aliasKey) : undefined;
		if (!representative || representative === item || item.hasOwnState) {
			return true;
		}
		const aliases = hidden.get(representative) ?? [];
		aliases.push(item);
		hidden.set(representative, aliases);
		return false;
	});
	return kept.map(item => {
		const aliases = hidden.get(item);
		return aliases ? merge(item, aliases) : item;
	});
}

/** An artifact that can be listed in a group of artifacts sharing its group ID. */
export interface IArtifactIntegrationPillCandidate {
	/** Identifies the group the artifact can join; artifacts without a key never join a group. */
	readonly groupKey?: string;
}

export type ArtifactIntegrationPillLayout<T extends IArtifactIntegrationPillCandidate> =
	| { readonly kind: 'single'; readonly item: T; readonly pinned: boolean }
	| { readonly kind: 'group'; readonly key: string; readonly items: readonly T[] };

/**
 * Arranges integrated artifacts into pills: two or more unpinned artifacts sharing a group key collapse into one
 * group, shown where the first of them would be. Pinned artifacts and artifacts without company keep pills of
 * their own, in their recorded order.
 */
export function layoutArtifactIntegrationPills<T extends IArtifactIntegrationPillCandidate>(items: readonly T[], isPinned: (item: T) => boolean): readonly ArtifactIntegrationPillLayout<T>[] {
	const groups = new Map<string, T[]>();
	for (const item of items) {
		if (item.groupKey !== undefined && !isPinned(item)) {
			const group = groups.get(item.groupKey) ?? [];
			group.push(item);
			groups.set(item.groupKey, group);
		}
	}
	const result: ArtifactIntegrationPillLayout<T>[] = [];
	const emitted = new Set<string>();
	for (const item of items) {
		const pinned = item.groupKey !== undefined && isPinned(item);
		const group = !pinned && item.groupKey !== undefined ? groups.get(item.groupKey) : undefined;
		if (!group || group.length < 2) {
			result.push({ kind: 'single', item, pinned });
		} else if (!emitted.has(item.groupKey!)) {
			emitted.add(item.groupKey!);
			result.push({ kind: 'group', key: item.groupKey!, items: group });
		}
	}
	return result;
}

interface IArtifactIntegrationPillPlacement extends IArtifactIntegrationPillItem, IArtifactIntegrationPillCandidate, IArtifactIntegrationAliasCandidate {
	readonly pinned: boolean;
	/** The saved pins this placement shows, including those of the aliases it represents; Unpin clears them all. */
	readonly pins: readonly IArtifactIntegrationPillPlacement[];
}

/**
 * Places integrated artifacts that have a group ID in the chat input pill row: artifacts sharing a group ID collapse
 * into a group pill with a dropdown, while artifacts the user pinned out of their group, and those without company,
 * keep pills of their own. Pinning uses the same storage as other pill dropdowns.
 */
export class ArtifactIntegrationPillSources extends Disposable {
	readonly sources: IObservable<readonly IChatInputPillSource[]>;

	constructor(
		items: IObservable<readonly IArtifactIntegrationPillItem[]>,
		pinScope: IObservable<string | undefined>,
		detailsHost: IArtifactDetailsHost,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();
		const pins = this._register(instantiationService.createInstance(ChatInputPillPins));
		const placements = derived(this, reader => {
			const scope = pinScope.read(reader);
			return items.read(reader).map((item): IArtifactIntegrationPillPlacement => {
				const snapshot = item.presentation.snapshot.read(reader);
				const pinned = pins.getPinned(scope, item.kind, reader).has(item.entry.id);
				const placement: IArtifactIntegrationPillPlacement = {
					...item,
					groupKey: getArtifactIntegrationGroupKey(item.kind, item.isArtifact, getArtifactIntegrationGroupId(snapshot)),
					...getArtifactIntegrationAliasCandidate(snapshot),
					pinned,
					pins: [],
				};
				return pinned ? { ...placement, pins: [placement] } : placement;
			});
		});
		// A representative is pinned while any alias it hides is, so pinning one alias keeps the resource out of its group.
		const mergeAliases = (representative: IArtifactIntegrationPillPlacement, hidden: readonly IArtifactIntegrationPillPlacement[]): IArtifactIntegrationPillPlacement => {
			const merged = [representative, ...hidden].flatMap(item => item.pins);
			return merged.length === representative.pins.length ? representative : { ...representative, pinned: true, pins: merged };
		};
		const layout = derived(this, reader => layoutArtifactIntegrationPills(collapseArtifactIntegrationAliases(placements.read(reader).filter(item => item.visible), mergeAliases), item => item.pinned));
		const pinAction = (item: IArtifactIntegrationPillPlacement, scope: string | undefined, pinned: boolean) => {
			if (!scope) {
				return undefined;
			}
			const action = pins.createPinAction(item.entry, item.kind, scope, pinned);
			return pinned && item.pins.length > 1
				? { ...action, run: () => item.pins.forEach(pin => pins.setPinned(scope, pin.kind, pin.entry.id, pin.entry.label, false)) }
				: action;
		};

		// Groups keep their pill, and so an open dropdown, while their members change.
		const groupKeys = derivedOpts<readonly string[]>({ owner: this, equalsFn: equals }, reader =>
			layout.read(reader).flatMap(item => item.kind === 'group' ? [item.key] : []));
		const groups = mapObservableArrayCached(this, groupKeys, (key, store) => {
			const members = derived(reader => {
				const scope = pinScope.read(reader);
				const group = layout.read(reader).find(item => item.kind === 'group' && item.key === key);
				return group?.kind === 'group'
					? group.items.map((item): IArtifactIntegrationGroupMember => ({ presentation: item.presentation, entry: item.entry, pinAction: pinAction(item, scope, false) }))
					: [];
			});
			return { key, group: store.add(instantiationService.createInstance(ArtifactIntegrationGroup, key, members, detailsHost)) };
		});
		// A lone artifact keeps one pill whether or not it is pinned, which offers Unpin while it is.
		const singleKeys = derivedOpts<readonly ArtifactIntegrationPresentation[]>({ owner: this, equalsFn: equals }, reader =>
			layout.read(reader).flatMap(item => item.kind === 'single' ? [item.item.presentation] : []));
		const singles = mapObservableArrayCached(this, singleKeys, presentation => {
			const unpin = derived(reader => {
				const item = layout.read(reader).find(item => item.kind === 'single' && item.item.presentation === presentation);
				return item?.kind === 'single' && item.pinned ? pinAction(item.item, pinScope.read(reader), true) : undefined;
			});
			return { presentation, pill: presentation.createPill(unpin), unpin };
		});

		this.sources = derived(this, reader => {
			const groupsByKey = new Map(groups.read(reader).map(({ key, group }) => [key, group]));
			const singlesByPresentation = new Map(singles.read(reader).map(single => [single.presentation, single]));
			// Filtered-out artifacts keep a hidden source, so their pill kind's options stay reachable from the row.
			const hidden = placements.read(reader).filter(item => !item.visible).map((item): IChatInputPillSource => ({
				...createChatInputPillSource(item.presentation.inlinePill, item.kind),
				isVisible: constObservable(false),
			}));
			return [...layout.read(reader).flatMap((item): IChatInputPillSource[] => {
				if (item.kind === 'group') {
					const group = groupsByKey.get(item.key);
					return group ? [createChatInputPillSource(group.pill, item.items[0].kind)] : [];
				}
				const single = singlesByPresentation.get(item.item.presentation);
				if (!single) {
					return [];
				}
				const remove = item.item.entry.promotedAction;
				return [{
					...createChatInputPillSource(single.pill, item.item.kind),
					getContextMenuPrimaryActions: () => {
						const unpin = single.unpin.read(undefined);
						return [...unpin ? [unpin] : [], ...remove ? [remove] : []];
					},
				}];
			}), ...hidden];
		});
	}
}
