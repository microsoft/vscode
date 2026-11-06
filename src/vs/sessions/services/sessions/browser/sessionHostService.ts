/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getActiveWindow, hasWindow } from '../../../../base/browser/dom.js';
import { Disposable, IDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { derivedObservableWithCache, IObservable, IReader, recomputeInitiallyAndOnChange, observableValue } from '../../../../base/common/observable.js';
import { isEqual } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { GroupIdentifier } from '../../../../workbench/common/editor.js';
import { IEditorGroup, IEditorGroupsService } from '../../../../workbench/services/editor/common/editorGroupsService.js';
import { IHostService } from '../../../../workbench/services/host/browser/host.js';
import { getMainWindowHost, IFocusedSessionHostService, ISessionHost, ISessionHostService, hostShows, SessionHostKind } from './sessionHost.js';
import { ISessionsService } from './sessionsService.js';

/** Whether a host owns what it shows: windows and panes do, while composers and dialogs only draft in them. */
function ownsContent(host: ISessionHost): boolean {
	return host.kind !== SessionHostKind.Composer && host.kind !== SessionHostKind.AutomationDialog;
}

/** Drops the hosts that a host nested in them also matches, as the main window and its active pane show the same chat. */
function innermost(hosts: readonly ISessionHost[]): readonly ISessionHost[] {
	return hosts.filter(host => !hosts.some(other => other !== host && isNestedIn(other, host)));
}

function isNestedIn(host: ISessionHost, ancestor: ISessionHost): boolean {
	for (let current = host.parent; current; current = current.parent) {
		if (current === ancestor) {
			return true;
		}
	}
	return false;
}

export class SessionHostService extends Disposable implements ISessionHostService {
	declare readonly _serviceBrand: undefined;

	private readonly _hosts = observableValue<readonly ISessionHost[]>(this, []);
	readonly hosts: IObservable<readonly ISessionHost[]> = this._hosts;

	/** The host of the main window: the grid's host. Not part of {@link ISessionHostService}: UI injects the host it is in. */
	readonly mainWindowHost: ISessionHost;

	constructor(
		@ISessionsService sessionsService: ISessionsService,
		@IEditorGroupsService private readonly _editorGroupsService: IEditorGroupsService,
	) {
		super();
		this.mainWindowHost = sessionsService.gridHost;
		this._register(this.registerHost(this.mainWindowHost));
	}

	registerHost(host: ISessionHost): IDisposable {
		this._hosts.set([...this._hosts.get(), host], undefined);
		return toDisposable(() => this._hosts.set(this._hosts.get().filter(candidate => candidate !== host), undefined));
	}

	getHost(id: string): ISessionHost | undefined {
		return this._hosts.get().find(host => host.id === id);
	}

	getHostOfWindow(windowId: number, reader?: IReader): ISessionHost | undefined {
		const windowHost = this._hosts.read(reader).find(host => !host.parent && host.windowId.read(reader) === windowId);
		if (windowHost) {
			return windowHost;
		}
		// Floating editor windows belong to the main window.
		return hasWindow(windowId) ? this.mainWindowHost : undefined;
	}

	getHostOfGroup(group: IEditorGroup | GroupIdentifier, reader?: IReader): ISessionHost | undefined {
		const resolved = typeof group === 'number' ? this._editorGroupsService.getGroup(group) : group;
		return resolved ? this.getHostOfWindow(resolved.windowId, reader) : undefined;
	}

	getHostOfChat(chatResource: URI, reader?: IReader): ISessionHost | undefined {
		return innermost(this._hosts.read(reader).filter(host => ownsContent(host) && isEqual(host.chatResource.read(reader), chatResource)))[0];
	}

	getHostsOfSession(sessionResource: URI, reader?: IReader): readonly ISessionHost[] {
		return innermost(this._hosts.read(reader).filter(host => ownsContent(host) && isEqual(host.session.read(reader)?.resource, sessionResource)));
	}

	isShown(resource: URI, reader?: IReader): boolean {
		return this._hosts.read(reader).some(host => hostShows(host, resource, reader));
	}
}

export class FocusedSessionHostService extends Disposable implements IFocusedSessionHostService {
	declare readonly _serviceBrand: undefined;

	private readonly _focusedWindowId = observableValue<number>(this, getActiveWindow().vscodeWindowId);
	readonly focusedHost: IObservable<ISessionHost>;

	constructor(
		@ISessionHostService private readonly _sessionHostService: ISessionHostService,
		@IHostService private readonly _hostService: IHostService,
	) {
		super();
		// Sticky: only a window gaining focus changes it, not the app losing focus. A chat window that gains focus before
		// its host knows its window resolves once it does.
		this._register(_hostService.onDidChangeActiveWindow(windowId => this._focusedWindowId.set(windowId, undefined)));
		// While the host of the window that gained focus is still loading, as a chat window does while it restores, the
		// previously focused host stays focused until it has loaded.
		this.focusedHost = derivedObservableWithCache<ISessionHost>(this, (reader, previous) => {
			const host = _sessionHostService.getHostOfWindow(this._focusedWindowId.read(reader), reader) ?? getMainWindowHost(_sessionHostService);
			return this._loadingFallback(host, previous, reader);
		});
		// Observed for the service's lifetime, so the previously focused host is always known.
		this._register(recomputeInitiallyAndOnChange(this.focusedHost));
	}

	private _loadingFallback(host: ISessionHost, previous: ISessionHost | undefined, reader: IReader | undefined): ISessionHost {
		if (previous && previous !== host && host.content.read(reader).kind === 'loading' && this._sessionHostService.hosts.read(reader).includes(previous)) {
			return previous;
		}
		return host;
	}

	getFocusedHost(): ISessionHost {
		// While the app is in the background no document has focus, and `getActiveWindow` falls back to the main window:
		// the window that last had focus is the focused one.
		if (!this._hostService.hasFocus) {
			return this.focusedHost.get();
		}
		const host = this._sessionHostService.getHostOfWindow(getActiveWindow().vscodeWindowId) ?? getMainWindowHost(this._sessionHostService);
		return this._loadingFallback(host, this.focusedHost.get(), undefined);
	}
}

registerSingleton(ISessionHostService, SessionHostService, InstantiationType.Delayed);
registerSingleton(IFocusedSessionHostService, FocusedSessionHostService, InstantiationType.Delayed);
