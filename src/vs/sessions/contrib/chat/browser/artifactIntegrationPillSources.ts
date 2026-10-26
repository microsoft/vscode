/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { equals } from '../../../../base/common/arrays.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { constObservable, derived, derivedOpts, IObservable, mapObservableArrayCached } from '../../../../base/common/observable.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IChatPillEntry } from '../../../../workbench/browser/chatPills.js';
import { ChatInputPillPins, createChatInputPillSource, IChatInputPillSource } from '../../../../workbench/contrib/chat/browser/chatInputPills.js';
import { SessionChatPillKind } from '../../../../workbench/contrib/chat/common/sessionChatPills.js';
import { ArtifactIntegrationGroup, IArtifactIntegrationGroupMember } from './artifactIntegrationGroup.js';
import { ArtifactIntegrationPresentation, IArtifactDetailsHost } from './artifactIntegrationPresentation.js';

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
 * The group an integrated record can join: artifacts of the same pill kind and main integration share one. References
 * never join a group, nor do records without a main integration.
 */
export function getArtifactIntegrationGroupKey(kind: SessionChatPillKind, isArtifact: boolean, mainIntegrationId: string | undefined): string | undefined {
	return isArtifact && mainIntegrationId !== undefined ? JSON.stringify([kind, mainIntegrationId]) : undefined;
}

/** An artifact that can be listed in a group of artifacts sharing its main integration. */
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

interface IArtifactIntegrationPillPlacement extends IArtifactIntegrationPillItem, IArtifactIntegrationPillCandidate {
	readonly pinned: boolean;
}

/**
 * Places integrated artifacts in the chat input pill row: artifacts sharing an integration collapse into a group
 * pill with a dropdown, while artifacts the user pinned out of their group, and those without company, keep pills
 * of their own. Pinning uses the same storage as other pill dropdowns.
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
			return items.read(reader).map((item): IArtifactIntegrationPillPlacement => ({
				...item,
				groupKey: getArtifactIntegrationGroupKey(item.kind, item.isArtifact, item.presentation.snapshot.read(reader).mainIntegrationId),
				pinned: pins.getPinned(scope, item.kind, reader).has(item.entry.id),
			}));
		});
		const layout = derived(this, reader => layoutArtifactIntegrationPills(placements.read(reader).filter(item => item.visible), item => item.pinned));
		const pinAction = (item: IArtifactIntegrationPillPlacement, scope: string | undefined, pinned: boolean) =>
			scope ? pins.createPinAction(item.entry, item.kind, scope, pinned) : undefined;

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
