/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $ } from '../../../base/browser/dom.js';
import { ISerializableView } from '../../../base/browser/ui/grid/grid.js';
import { Event } from '../../../base/common/event.js';
import { IDisposable, toDisposable } from '../../../base/common/lifecycle.js';
import { IObservable, observableValue } from '../../../base/common/observable.js';

/** Width of the strip itself: 24px buttons, 2px padding and a 1px border on each side, in `sessionActivityBar.css`. */
const STRIP_WIDTH = 30;

/** Space kept on either side of the strip in its column, matching `sessionActivityBar.css`. */
const COLUMN_GAP = 2;

/**
 * The width of the column the Session Activity Bar takes, beside the chat or in a host outside it: the strip with an
 * equal gap on either side.
 */
export const SESSION_ACTIVITY_BAR_COLUMN_WIDTH = COLUMN_GAP + STRIP_WIDTH + COLUMN_GAP;

/**
 * A place outside the chat where the active strip shows instead, such as a column of its own at the right of the
 * window. See {@link registerSessionActivityBarExternalHost}.
 */
export interface ISessionActivityBarExternalHost {
	/** The element the strip moves into: {@link SESSION_ACTIVITY_BAR_COLUMN_WIDTH} wide. */
	readonly element: HTMLElement;
	/** Whether the active strip shows in the host rather than beside its chat. */
	readonly active: IObservable<boolean>;
	/**
	 * Whether `occupant`, a shown strip, is in the host, for the host to keep room for it while any strip is. A strip can
	 * enter before another leaves; see {@link SessionActivityBarHostOccupancy}.
	 */
	setOccupied(occupant: object, occupied: boolean): void;
}

/** Whether any strip is in an {@link ISessionActivityBarExternalHost}, whatever order they enter and leave it in. */
export class SessionActivityBarHostOccupancy {

	private readonly occupants = new Set<object>();
	private readonly _occupied = observableValue<boolean>(this, false);
	readonly occupied: IObservable<boolean> = this._occupied;

	set(occupant: object, occupied: boolean): void {
		if (occupied) {
			this.occupants.add(occupant);
		} else {
			this.occupants.delete(occupant);
		}
		this._occupied.set(this.occupants.size > 0, undefined);
	}
}

const externalHosts = new Map<HTMLElement, ISessionActivityBarExternalHost>();

/** Registers `host` for the strips of the chat views within `scope`, such as a window. The host of the nearest registered scope applies. */
export function registerSessionActivityBarExternalHost(scope: HTMLElement, host: ISessionActivityBarExternalHost): IDisposable {
	externalHosts.set(scope, host);
	return toDisposable(() => {
		if (externalHosts.get(scope) === host) {
			externalHosts.delete(scope);
		}
	});
}

/** The host registered for the nearest scope among `element` and its ancestors, which the strip of a chat in it shows in. */
export function findSessionActivityBarExternalHost(element: HTMLElement): ISessionActivityBarExternalHost | undefined {
	for (let candidate: HTMLElement | null = element; candidate; candidate = candidate.parentElement) {
		const host = externalHosts.get(candidate);
		if (host) {
			return host;
		}
	}
	return undefined;
}

/**
 * The fixed-width column at the right of the main window's grid that the Session Activity Bar of the active chat shows
 * in, to the right of the side pane, or of the chat while the side pane is closed. The workbench shows it while a strip
 * is in it: see {@link occupied}.
 */
export class SessionActivityBarColumn implements ISerializableView, ISessionActivityBarExternalHost {

	static readonly ID = 'workbench.parts.sessionActivityBarColumn';

	readonly element = $('.session-activity-bar-column.session-activity-bar-host');

	readonly minimumWidth = SESSION_ACTIVITY_BAR_COLUMN_WIDTH;
	readonly maximumWidth = SESSION_ACTIVITY_BAR_COLUMN_WIDTH;
	readonly minimumHeight = 0;
	readonly maximumHeight = Number.POSITIVE_INFINITY;
	readonly onDidChange = Event.None;

	private readonly occupancy = new SessionActivityBarHostOccupancy();
	/** Whether a shown strip is in the column. */
	readonly occupied = this.occupancy.occupied;

	constructor(readonly active: IObservable<boolean>) { }

	setOccupied(occupant: object, occupied: boolean): void {
		this.occupancy.set(occupant, occupied);
	}

	layout(): void { }

	toJSON(): object {
		return { type: SessionActivityBarColumn.ID };
	}
}
