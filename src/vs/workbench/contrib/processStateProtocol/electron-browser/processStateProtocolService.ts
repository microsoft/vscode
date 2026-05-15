/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../base/common/codicons.js';
import { Disposable, DisposableMap, DisposableStore, toDisposable } from '../../../../base/common/lifecycle.js';
import { autorun, derived, IObservable, ISettableObservable, observableValue, transaction } from '../../../../base/common/observable.js';
import Severity from '../../../../base/common/severity.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { localize } from '../../../../nls.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import {
	ENV_VAR_ENDPOINT,
	ENV_VAR_TOKEN,
	initialWatchDoc,
	IProcessStateProtocolMainService,
	IPspSessionSnapshot,
	IWatchDoc,
	PSP_URI_SCHEME,
} from '../../../../platform/processStateProtocol/common/protocol.js';
import { ITerminalInstance, ITerminalInstanceService } from '../../terminal/browser/terminal.js';
import { ITerminalStatus } from '../../terminal/common/terminal.js';
import { IPspSession, IProcessStateProtocolService } from '../common/processStateProtocolService.js';
import { OPEN_PSP_SESSION_BY_TERMINAL_COMMAND_ID } from './pspCommands.js';
import { PspFileSystemProvider } from './pspFileSystemProvider.js';

const STATUS_ID = 'psp.connectedSession';

interface IMutableSession extends IPspSession {
	readonly _docObservable: ISettableObservable<IWatchDoc>;
}

export class ProcessStateProtocolService extends Disposable implements IProcessStateProtocolService {

	declare readonly _serviceBrand: undefined;

	private _endpoint: string | undefined;

	private readonly _sessions: ISettableObservable<ReadonlyMap<string, IPspSession>>;
	private readonly _sessionsById = new Map<string, IMutableSession>();

	/** Per-terminal lifetime store. Disposed when the terminal disposes or the service shuts down. */
	private readonly _terminalBindings = this._register(new DisposableMap<number>());
	/** Token assigned to each terminal, for fast session lookup. */
	private readonly _tokenByTerminal = new Map<number, string>();

	get sessions(): IObservable<ReadonlyMap<string, IPspSession>> { return this._sessions; }

	constructor(
		@ITerminalInstanceService terminalInstanceService: ITerminalInstanceService,
		@IFileService fileService: IFileService,
		@IProcessStateProtocolMainService private readonly _mainService: IProcessStateProtocolMainService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();

		this._sessions = observableValue<ReadonlyMap<string, IPspSession>>(this, new Map());

		// Fetch the endpoint up-front so terminal-create handlers can inject env vars synchronously.
		this._mainService.getEndpoint().then(endpoint => {
			this._endpoint = endpoint;
		}, err => {
			this._logService.error('[psp] failed to obtain hub endpoint', err);
		});

		// Mirror main-process session snapshots into renderer-side observables.
		this._register(this._mainService.onDidChangeSessions(snapshots => this._applySnapshots(snapshots)));

		// Expose live sessions as files under psp:/sessions/<sid>.json.
		const provider = this._register(new PspFileSystemProvider(this._sessions));
		this._register(fileService.registerProvider(PSP_URI_SCHEME, provider));

		this._register(terminalInstanceService.onDidCreateInstance(instance => {
			this._attachToTerminal(instance);
		}));
	}

	getSessionForTerminal(terminalInstanceId: number): IPspSession | undefined {
		const token = this._tokenByTerminal.get(terminalInstanceId);
		if (!token) {
			return undefined;
		}
		return findSessionByToken(this._sessions.get(), token);
	}

	observeSessionForTerminal(terminalInstanceId: number): IObservable<IPspSession | undefined> {
		const token = this._tokenByTerminal.get(terminalInstanceId);
		if (!token) {
			return derived(() => undefined);
		}
		return derived(this, reader => findSessionByToken(this._sessions.read(reader), token));
	}

	private _attachToTerminal(instance: ITerminalInstance): void {
		// If the hub isn't ready yet, skip — the terminal just won't have PSP env vars.
		if (!this._endpoint) {
			this._logService.warn('[psp] hub endpoint not yet known; terminal will not be PSP-enabled');
			return;
		}

		const store = new DisposableStore();
		const token = generateUuid();

		// Fire-and-forget claim. The publisher (a subprocess) cannot connect before the shell is
		// spawned, so the claim is virtually always registered first.
		this._mainService.claimToken(token).catch(err => this._logService.error('[psp] claimToken failed', err));
		store.add(toDisposable(() => {
			this._mainService.revokeToken(token).catch(err => this._logService.error('[psp] revokeToken failed', err));
		}));

		this._tokenByTerminal.set(instance.instanceId, token);
		store.add(toDisposable(() => this._tokenByTerminal.delete(instance.instanceId)));

		// Inject env vars and a clickable tab action button synchronously — `onDidCreateInstance`
		// fires before the shell process is spawned, so both are visible to the publisher and the
		// initial tab rendering.
		instance.shellLaunchConfig.env = {
			...(instance.shellLaunchConfig.env ?? {}),
			[ENV_VAR_ENDPOINT]: this._endpoint,
			[ENV_VAR_TOKEN]: token,
		};
		instance.shellLaunchConfig.tabActions = [
			...(instance.shellLaunchConfig.tabActions ?? []),
			{
				id: OPEN_PSP_SESSION_BY_TERMINAL_COMMAND_ID,
				label: localize('psp.openDocument', "Open Process State"),
				icon: Codicon.info,
			},
		];

		// Surface a tab badge while a publisher is connected. The click action lives on the tab
		// action bar (above) so the status is purely informational.
		const session = this.observeSessionForTerminal(instance.instanceId);
		store.add(autorun(reader => {
			const s = session.read(reader);
			if (s) {
				const status: ITerminalStatus = {
					id: STATUS_ID,
					severity: Severity.Info,
					icon: Codicon.info,
					tooltip: localize('psp.connected', "A process in this terminal is publishing live state."),
				};
				instance.statusList.add(status);
			} else {
				instance.statusList.remove(STATUS_ID);
			}
		}));

		this._terminalBindings.set(instance.instanceId, store);
		store.add(instance.onDisposed(() => this._terminalBindings.deleteAndDispose(instance.instanceId)));
	}

	private _applySnapshots(snapshots: readonly IPspSessionSnapshot[]): void {
		const next = new Map<string, IPspSession>();
		const seen = new Set<string>();

		transaction(tx => {
			for (const snap of snapshots) {
				seen.add(snap.id);
				let existing = this._sessionsById.get(snap.id);
				if (!existing) {
					const docObservable = observableValue<IWatchDoc>(`psp.doc.${snap.id}`, snap.doc ?? initialWatchDoc);
					existing = {
						id: snap.id,
						token: snap.token,
						client: snap.client,
						doc: docObservable,
						_docObservable: docObservable,
					};
					this._sessionsById.set(snap.id, existing);
				} else {
					existing._docObservable.set(snap.doc ?? initialWatchDoc, tx);
				}
				next.set(snap.id, existing);
			}
			// Drop sessions that disappeared.
			for (const id of [...this._sessionsById.keys()]) {
				if (!seen.has(id)) {
					this._sessionsById.delete(id);
				}
			}
			this._sessions.set(next, tx);
		});
	}
}

function findSessionByToken(sessions: ReadonlyMap<string, IPspSession>, token: string): IPspSession | undefined {
	for (const session of sessions.values()) {
		if (session.token === token) {
			return session;
		}
	}
	return undefined;
}

