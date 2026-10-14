/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../../base/common/uri.js';
import { createDecorator } from '../../../../instantiation/common/instantiation.js';
import { IAgentHostSessionStateStore } from '../../../common/agentHostSessionStateStore.js';
import { readSessionAdditionalWorktrees } from '../../shared/sessionAdditionalWorktrees.js';
import { IAgentHostWorktreeIsolation } from '../../shared/worktreeIsolation.js';

export const IAdditionalWorktreeLifecycleService = createDecorator<IAdditionalWorktreeLifecycleService>('additionalWorktreeLifecycleService');

export interface IAdditionalWorktreeLifecycleService {
	readonly _serviceBrand: undefined;
	runWithAutomaticArchive<T>(session: URI, operation: () => T): T;
	runWithPreservedWorktrees<T>(session: URI, operation: () => T): T;
	synchronizeArchiveState(session: URI, archived: boolean, strictCleanup?: boolean): Promise<void>;
}

export class AdditionalWorktreeLifecycleService implements IAdditionalWorktreeLifecycleService {
	declare readonly _serviceBrand: undefined;

	private readonly _automaticArchiveDepth = new Map<string, number>();
	private readonly _preservedWorktrees = new Set<string>();

	constructor(
		@IAgentHostSessionStateStore private readonly _sessionStateStore: IAgentHostSessionStateStore,
		@IAgentHostWorktreeIsolation private readonly _worktree: IAgentHostWorktreeIsolation,
	) { }

	runWithAutomaticArchive<T>(session: URI, operation: () => T): T {
		const sessionKey = session.toString();
		const depth = this._automaticArchiveDepth.get(sessionKey) ?? 0;
		this._automaticArchiveDepth.set(sessionKey, depth + 1);
		try {
			return operation();
		} finally {
			if (depth === 0) {
				this._automaticArchiveDepth.delete(sessionKey);
			} else {
				this._automaticArchiveDepth.set(sessionKey, depth);
			}
		}
	}

	async synchronizeArchiveState(session: URI, archived: boolean, strictCleanup = archived && this._automaticArchiveDepth.has(session.toString())): Promise<void> {
		if (this._preservedWorktrees.has(session.toString())) {
			return;
		}
		const worktrees = await readSessionAdditionalWorktrees(this._sessionStateStore, session);
		await Promise.all(worktrees.map(worktree => this._worktree.setDetachedWorktreeArchived(worktree.handle, archived, strictCleanup)));
	}

	/** Suppresses worktree lifecycle changes during synchronous metadata-only publication. */
	runWithPreservedWorktrees<T>(session: URI, operation: () => T): T {
		const key = session.toString();
		const alreadyPreserved = this._preservedWorktrees.has(key);
		this._preservedWorktrees.add(key);
		try {
			return operation();
		} finally {
			if (!alreadyPreserved) {
				this._preservedWorktrees.delete(key);
			}
		}
	}
}
