/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { constObservable, derivedObservableWithCache, ValueWithChangeEventFromObservable } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IWorkbenchContribution } from '../../../../workbench/common/contributions.js';
import { isIChatSessionFileChange2 } from '../../../../workbench/contrib/chat/common/chatSessionsService.js';
import { IMultiDiffSourceResolver, IMultiDiffSourceResolverService, IResolvedMultiDiffSource, MultiDiffEditorItem } from '../../../../workbench/contrib/multiDiffEditor/browser/multiDiffSourceResolverService.js';
import { ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';
import { ISessionFileChange } from '../../../services/sessions/common/session.js';

const LAST_TURN_CHANGES_MULTI_DIFF_SOURCE_SCHEME = 'chat-last-turn-changes-multi-diff-source';

interface ILastTurnChangesMultiDiffUriFields {
	readonly chatResource: string;
}

/**
 * Resolves the multi-diff source that backs the chat input's changes pill. The
 * pill is scoped to a single chat's **last turn**, so its editor is identified
 * by a {@link LAST_TURN_CHANGES_MULTI_DIFF_SOURCE_SCHEME} URI carrying that
 * chat's resource. Reusing the same URI reuses the same editor while the diff
 * list updates reactively.
 *
 * The resolved resource list is derived live from the chat's
 * `lastTurnChanges` observable. For every file changed in the last turn it
 * shows the diff between:
 * - the **first origin** resource found for that file (the snapshot of its
 *   before-content), used as the *original* side; and
 * - the file **on disk** (its live resource), used as the *modified* side so the
 *   diff keeps updating as the agent writes further edits.
 *
 * Files are keyed by their on-disk resource so a file that appears in several
 * edits is shown once, keeping the first origin it was seen with. The row for an
 * already-seen file is reused as-is, so further edits to a known file don't
 * rebuild the list — the diff source only changes when a new file appears (or an
 * existing one drops out of the turn).
 */
export class LastTurnChangesMultiDiffSourceResolver extends Disposable implements IMultiDiffSourceResolver {

	/**
	 * Build the multi-diff source URI identifying the last-turn changes editor
	 * for a chat.
	 */
	static getMultiDiffSourceUri(chatResource: URI): URI {
		return URI.from({
			scheme: LAST_TURN_CHANGES_MULTI_DIFF_SOURCE_SCHEME,
			query: JSON.stringify({ chatResource: chatResource.toString() } satisfies ILastTurnChangesMultiDiffUriFields),
		});
	}

	/**
	 * If the given URI identifies a last-turn changes editor (one built by
	 * {@link getMultiDiffSourceUri}), return the chat resource it belongs to;
	 * otherwise `undefined`.
	 */
	static parseUri(uri: URI): URI | undefined {
		if (uri.scheme !== LAST_TURN_CHANGES_MULTI_DIFF_SOURCE_SCHEME) {
			return undefined;
		}

		let fields: ILastTurnChangesMultiDiffUriFields;
		try {
			fields = JSON.parse(uri.query) as ILastTurnChangesMultiDiffUriFields;
		} catch {
			return undefined;
		}

		if (typeof fields !== 'object' || fields === null || typeof fields.chatResource !== 'string') {
			return undefined;
		}

		return URI.parse(fields.chatResource);
	}

	constructor(
		@ISessionsManagementService private readonly _sessionsManagementService: ISessionsManagementService,
		@IMultiDiffSourceResolverService multiDiffSourceResolverService: IMultiDiffSourceResolverService,
	) {
		super();
		this._register(multiDiffSourceResolverService.registerResolver(this));
	}

	canHandleUri(uri: URI): boolean {
		return LastTurnChangesMultiDiffSourceResolver.parseUri(uri) !== undefined;
	}

	async resolveDiffSource(uri: URI): Promise<IResolvedMultiDiffSource> {
		const chatResource = LastTurnChangesMultiDiffSourceResolver.parseUri(uri)!;

		// The chat's resource is fixed for this editor, so resolve the owning chat
		// once here rather than re-finding it on every observable read.
		const chat = this._sessionsManagementService.getSessionForChatResource(chatResource)?.chat;
		const lastTurnChanges = chat?.lastTurnChanges ?? constObservable<readonly ISessionFileChange[]>([]);

		// Reuse the row for a file we've already seen (keeping its first origin) and
		// keep the previous array reference when no new file appears, so the diff
		// source only changes when the set of changed files does — not on every edit
		// that streams in for an already-known file.
		const resourcesObs = derivedObservableWithCache<readonly MultiDiffEditorItem[]>(this, (reader, lastValue) => {
			const changes = lastTurnChanges.read(reader);

			const previousByKey = new Map<string, MultiDiffEditorItem>();
			for (const item of lastValue ?? []) {
				previousByKey.set(item.modifiedUri!.toString(), item);
			}

			const items: MultiDiffEditorItem[] = [];
			const seen = new Set<string>();
			let addedNewFile = false;
			for (const change of changes) {
				// The on-disk resource of the file: the live file whose current
				// content is shown as the modified side of the diff.
				const onDiskUri = isIChatSessionFileChange2(change) ? change.uri : change.modifiedUri;
				if (!onDiskUri) {
					continue;
				}
				const key = onDiskUri.toString();
				if (seen.has(key)) {
					continue;
				}
				seen.add(key);

				const existing = previousByKey.get(key);
				if (existing) {
					items.push(existing);
				} else {
					// First edit for this file: capture its origin (original side).
					items.push(new MultiDiffEditorItem(change.originalUri, onDiskUri, onDiskUri));
					addedNewFile = true;
				}
			}

			// Same set of files as before → keep the reference so downstream (and the
			// multi-diff editor) doesn't recompute.
			if (!addedNewFile && lastValue && items.length === lastValue.length) {
				return lastValue;
			}
			return items;
		});

		return { resources: new ValueWithChangeEventFromObservable(resourcesObs) };
	}
}

/**
 * Instantiates the {@link LastTurnChangesMultiDiffSourceResolver} so it registers
 * with the multi-diff source resolver service. Registered at
 * {@link WorkbenchPhase.BlockRestore} so a previously open last-turn changes diff
 * editor can resolve its contents during workbench restore.
 */
export class LastTurnChangesMultiDiffSourceResolverContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.sessions.lastTurnChangesMultiDiffSourceResolver';

	constructor(
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();
		this._register(instantiationService.createInstance(LastTurnChangesMultiDiffSourceResolver));
	}
}
