/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $ } from '../../../../base/browser/dom.js';
import { ISerializableView } from '../../../../base/browser/ui/grid/grid.js';
import { Emitter } from '../../../../base/common/event.js';
import { DisposableStore, IDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { constObservable, IObservable, observableFromEvent, observableValue } from '../../../../base/common/observable.js';
import { MenuActivityBar, MenuActivityBarSize } from '../activitybar/menuActivityBar.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';

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
	 * Whether the host is turned on. While it is off, the strip stays beside its chat even while the host is
	 * {@link active}. Defaults to on.
	 */
	readonly enabled?: IObservable<boolean>;
	/**
	 * Called while a shown strip would show in the host if it were {@link enabled}, whether or not it is, so the host
	 * knows when turning it on or off makes a difference.
	 */
	offer?(): void;
	/**
	 * Whether the strip shows at the full size of a {@link MenuActivityBar} in the host, like the workbench activity bar,
	 * rather than at the slim size it has beside a chat.
	 */
	readonly fullSize?: boolean;
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

/** The profile state of the size of the Session Activity Bar in the main window's column, chosen from its context menu. */
const SESSION_ACTIVITY_BAR_SIZE_STORAGE_KEY = 'workbench.sessions.sessionActivityBarSize';

/** The size of the Session Activity Bar in the main window's column: compact unless the normal size was chosen. */
export function getSessionActivityBarSize(storageService: IStorageService): MenuActivityBarSize {
	return storageService.get(SESSION_ACTIVITY_BAR_SIZE_STORAGE_KEY, StorageScope.PROFILE) === MenuActivityBarSize.Normal ? MenuActivityBarSize.Normal : MenuActivityBarSize.Compact;
}

export function setSessionActivityBarSize(storageService: IStorageService, size: MenuActivityBarSize): void {
	storageService.store(SESSION_ACTIVITY_BAR_SIZE_STORAGE_KEY, size, StorageScope.PROFILE, StorageTarget.USER);
}

/** {@link getSessionActivityBarSize}, as it changes. */
export function observeSessionActivityBarSize(owner: object, storageService: IStorageService, store: DisposableStore): IObservable<MenuActivityBarSize> {
	return observableFromEvent(owner, storageService.onDidChangeValue(StorageScope.PROFILE, SESSION_ACTIVITY_BAR_SIZE_STORAGE_KEY, store), () => getSessionActivityBarSize(storageService));
}

/**
 * The fixed-width column at the right of the main window's grid that the Session Activity Bar of the active chat shows
 * in, to the right of the side pane, or of the chat while the side pane is closed. The workbench shows it while a strip
 * is in it: see {@link occupied}. Its width includes the gap between it and the cards to its left, the same as the gap
 * between those cards; see {@link setGap}.
 */
export class SessionActivityBarColumn implements ISerializableView, ISessionActivityBarExternalHost {

	static readonly ID = 'workbench.parts.sessionActivityBarColumn';

	readonly element = $('.session-activity-bar-column.session-activity-bar-host');

	readonly fullSize = true;

	private gap = 0;
	private compactDensity = false;
	private size = MenuActivityBarSize.Compact;

	get minimumWidth(): number {
		return this.gap + MenuActivityBar.getWidth(this.compactDensity, this.size);
	}

	get maximumWidth(): number {
		return this.minimumWidth;
	}

	readonly minimumHeight = 0;
	readonly maximumHeight = Number.POSITIVE_INFINITY;

	private readonly _onDidChange = new Emitter<undefined>();
	readonly onDidChange = this._onDidChange.event;

	private readonly occupancy = new SessionActivityBarHostOccupancy();
	/** Whether a shown strip is in the column. */
	readonly occupied = this.occupancy.occupied;

	/**
	 * @param active Whether the strip of the active chat can show in the column now.
	 * @param enabled Whether the column is turned on; see {@link ISessionActivityBarExternalHost.enabled}.
	 * @param onDidOffer Called while a shown strip would show in the column if it were turned on.
	 */
	constructor(
		readonly active: IObservable<boolean>,
		readonly enabled: IObservable<boolean> = constObservable(true),
		private readonly onDidOffer?: () => void,
	) { }

	offer(): void {
		this.onDidOffer?.();
	}

	setOccupied(occupant: object, occupied: boolean): void {
		this.occupancy.set(occupant, occupied);
	}

	/**
	 * Sets the gap between the cards of the window, which the column keeps to the left of the strip, whether the window
	 * has the compact layout density, and the size of the strip, which both set the strip's width.
	 */
	setLayout(gap: number, compactDensity: boolean, size: MenuActivityBarSize): void {
		if (this.gap !== gap || this.compactDensity !== compactDensity || this.size !== size) {
			this.gap = gap;
			this.compactDensity = compactDensity;
			this.size = size;
			this._onDidChange.fire(undefined);
		}
	}

	dispose(): void {
		this._onDidChange.dispose();
	}

	layout(): void { }

	toJSON(): object {
		return { type: SessionActivityBarColumn.ID };
	}
}
