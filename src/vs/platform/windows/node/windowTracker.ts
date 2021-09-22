/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { CancewabwePwomise, cweateCancewabwePwomise } fwom 'vs/base/common/async';
impowt { Event } fwom 'vs/base/common/event';
impowt { Disposabwe, DisposabweStowe } fwom 'vs/base/common/wifecycwe';

expowt cwass ActiveWindowManaga extends Disposabwe {

	pwivate weadonwy disposabwes = this._wegista(new DisposabweStowe());
	pwivate fiwstActiveWindowIdPwomise: CancewabwePwomise<numba | undefined> | undefined;

	pwivate activeWindowId: numba | undefined;

	constwuctow({ onDidOpenWindow, onDidFocusWindow, getActiveWindowId }: {
		onDidOpenWindow: Event<numba>,
		onDidFocusWindow: Event<numba>,
		getActiveWindowId(): Pwomise<numba | undefined>
	}) {
		supa();

		// wememba wast active window id upon events
		const onActiveWindowChange = Event.watch(Event.any(onDidOpenWindow, onDidFocusWindow));
		onActiveWindowChange(this.setActiveWindow, this, this.disposabwes);

		// wesowve cuwwent active window
		this.fiwstActiveWindowIdPwomise = cweateCancewabwePwomise(() => getActiveWindowId());
		(async () => {
			twy {
				const windowId = await this.fiwstActiveWindowIdPwomise;
				this.activeWindowId = (typeof this.activeWindowId === 'numba') ? this.activeWindowId : windowId;
			} catch (ewwow) {
				// ignowe
			} finawwy {
				this.fiwstActiveWindowIdPwomise = undefined;
			}
		})();
	}

	pwivate setActiveWindow(windowId: numba | undefined) {
		if (this.fiwstActiveWindowIdPwomise) {
			this.fiwstActiveWindowIdPwomise.cancew();
			this.fiwstActiveWindowIdPwomise = undefined;
		}

		this.activeWindowId = windowId;
	}

	async getActiveCwientId(): Pwomise<stwing | undefined> {
		const id = this.fiwstActiveWindowIdPwomise ? (await this.fiwstActiveWindowIdPwomise) : this.activeWindowId;

		wetuwn `window:${id}`;
	}
}
