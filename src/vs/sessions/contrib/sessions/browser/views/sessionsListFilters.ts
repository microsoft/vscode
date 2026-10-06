/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from '../../../../../base/common/event.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { IReader } from '../../../../../base/common/observable.js';
import { localize } from '../../../../../nls.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { getSessionApplication } from '../../../../common/sessionApplication.js';
import { ISession, ISessionEnvironment } from '../../../../services/sessions/common/session.js';

export type SessionFilter =
	| { readonly kind: 'harness' | 'environment'; readonly id: string }
	| { readonly kind: 'application'; readonly environment: string; readonly id: string };

export interface ISessionFilterOption {
	readonly filter: SessionFilter;
	readonly label: string;
	readonly group: string;
}

export function sessionFilterKey(filter: SessionFilter): string {
	return JSON.stringify(filter.kind === 'application' ? [filter.kind, filter.environment, filter.id] : [filter.kind, filter.id]);
}

export function getSessionFilterOptions(sessions: readonly ISession[], environments: readonly ISessionEnvironment[], reader?: IReader): ISessionFilterOption[] {
	const options: ISessionFilterOption[] = [
		{ filter: { kind: 'harness', id: 'copilot' }, label: localize('harness.copilot', "Copilot"), group: '1_harnesses' },
		{ filter: { kind: 'harness', id: 'claude' }, label: localize('harness.claude', "Claude"), group: '1_harnesses' },
		{ filter: { kind: 'harness', id: 'codex' }, label: localize('harness.codex', "Codex"), group: '1_harnesses' },
	];
	const byId = new Map<string, ISessionEnvironment>([
		['local', { id: 'local', label: localize('environment.local', "Local") }],
		['cloud', { id: 'cloud', label: localize('environment.cloud', "Cloud") }],
	]);
	for (const environment of environments) {
		byId.set(environment.id, environment);
	}
	const ordered = [...byId.values()].sort((a, b) => {
		const rank = (id: string) => id === 'local' ? 0 : id === 'cloud' ? 1 : 2;
		return rank(a.id) - rank(b.id) || a.label.localeCompare(b.label) || a.id.localeCompare(b.id);
	});
	for (const environment of ordered) {
		if (environment.isConnected?.read(reader) !== false) {
			options.push({ filter: { kind: 'environment', id: environment.id }, label: environment.label, group: '2_environments' });
		}
	}
	const vscodeApplication = getSessionApplication('vscode');
	for (const [index, environment] of ordered.entries()) {
		const applications = new Map<string, string>();
		for (const session of sessions) {
			if (session.environment === environment.id && !session.isAutomation?.read(reader)) {
				const application = session.application.read(reader);
				applications.set(application.id, application.label);
			}
		}
		if (applications.size > 0 || environment.isConnected?.read(reader) !== false) {
			applications.set(vscodeApplication.id, vscodeApplication.label);
		}
		for (const [id, label] of [...applications].sort((a, b) => a[1].localeCompare(b[1]) || a[0].localeCompare(b[0]))) {
			options.push({
				filter: { kind: 'application', environment: environment.id, id },
				label: localize('application.environment', "{0} ({1})", label, environment.label),
				group: `3_applications_${String(index).padStart(6, '0')}`,
			});
		}
	}
	return options;
}

export class SessionsListFilters extends Disposable {
	private static readonly STORAGE_KEY = 'sessionsListControl.filters';
	private readonly excluded: Map<string, boolean>;
	private readonly _onDidChange = this._register(new Emitter<void>());
	readonly onDidChange = this._onDidChange.event;

	constructor(
		@IStorageService private readonly storageService: IStorageService,
		@ILogService logService: ILogService,
	) {
		super();
		this.excluded = new Map();
		const raw = storageService.get(SessionsListFilters.STORAGE_KEY, StorageScope.PROFILE);
		if (raw !== undefined) {
			try {
				const entries: unknown = JSON.parse(raw);
				if (!Array.isArray(entries) || !entries.every((entry): entry is [string, boolean] =>
					Array.isArray(entry) && entry.length === 2 && typeof entry[0] === 'string' && typeof entry[1] === 'boolean')) {
					throw new Error('Invalid session filter preferences.');
				}
				this.excluded = new Map(entries);
			} catch (error) {
				logService.warn('Unable to restore session filter preferences.', error);
			}
		}
	}

	isExcluded(filter: SessionFilter): boolean {
		return this.excluded.get(sessionFilterKey(filter))
			?? (filter.kind === 'application' && (
				(filter.environment !== 'cloud' && filter.id !== 'vscode') ||
				(filter.environment === 'cloud' && (filter.id === 'slack' || filter.id === 'teams'))
			));
	}

	setExcluded(filter: SessionFilter, excluded: boolean): void {
		this.excluded.set(sessionFilterKey(filter), excluded);
		this.storageService.store(SessionsListFilters.STORAGE_KEY, JSON.stringify([...this.excluded]), StorageScope.PROFILE, StorageTarget.USER);
		this._onDidChange.fire();
	}

	matches(session: Pick<ISession, 'harness' | 'environment' | 'application'>): boolean {
		return !this.isExcluded({ kind: 'harness', id: session.harness })
			&& !this.isExcluded({ kind: 'environment', id: session.environment })
			&& !this.isExcluded({ kind: 'application', environment: session.environment, id: session.application.get().id });
	}

	reset(): void {
		this.excluded.clear();
		this.storageService.remove(SessionsListFilters.STORAGE_KEY, StorageScope.PROFILE);
		this._onDidChange.fire();
	}
}
