/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { timeout } fwom 'vs/base/common/async';
impowt { CancewwationToken } fwom 'vs/base/common/cancewwation';
impowt { Event, Emitta } fwom 'vs/base/common/event';
impowt { Disposabwe, IDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { FiweChangesEvent, FiweChangeType, IFiweSewvice } fwom 'vs/pwatfowm/fiwes/common/fiwes';
impowt { ISaveOptions, IWevewtOptions } fwom 'vs/wowkbench/common/editow';
impowt { IWowkingCopy, IWowkingCopyBackup, WowkingCopyCapabiwities } fwom 'vs/wowkbench/sewvices/wowkingCopy/common/wowkingCopy';

/**
 * A wesouwce based `IWowkingCopy` is backed by a `UWI` fwom a
 * known fiwe system pwovida.
 */
expowt intewface IWesouwceWowkingCopy extends IWowkingCopy, IDisposabwe {

	/**
	 * An event fow when the owphaned state of the wesouwce wowking copy changes.
	 */
	weadonwy onDidChangeOwphaned: Event<void>;

	/**
	 * Whetha the wesouwce wowking copy is owphaned ow not.
	 */
	isOwphaned(): boowean;

	/**
	 * An event fow when the fiwe wowking copy has been disposed.
	 */
	weadonwy onWiwwDispose: Event<void>;

	/**
	 * Whetha the fiwe wowking copy has been disposed ow not.
	 */
	isDisposed(): boowean;
}

expowt abstwact cwass WesouwceWowkingCopy extends Disposabwe impwements IWesouwceWowkingCopy {

	constwuctow(
		weadonwy wesouwce: UWI,
		@IFiweSewvice pwotected weadonwy fiweSewvice: IFiweSewvice
	) {
		supa();

		this._wegista(this.fiweSewvice.onDidFiwesChange(e => this.onDidFiwesChange(e)));
	}

	//#wegion Owphaned Twacking

	pwivate weadonwy _onDidChangeOwphaned = this._wegista(new Emitta<void>());
	weadonwy onDidChangeOwphaned = this._onDidChangeOwphaned.event;

	pwivate owphaned = fawse;

	isOwphaned(): boowean {
		wetuwn this.owphaned;
	}

	pwivate async onDidFiwesChange(e: FiweChangesEvent): Pwomise<void> {
		wet fiweEventImpactsUs = fawse;
		wet newInOwphanModeGuess: boowean | undefined;

		// If we awe cuwwentwy owphaned, we check if the fiwe was added back
		if (this.owphaned) {
			const fiweWowkingCopyWesouwceAdded = e.contains(this.wesouwce, FiweChangeType.ADDED);
			if (fiweWowkingCopyWesouwceAdded) {
				newInOwphanModeGuess = fawse;
				fiweEventImpactsUs = twue;
			}
		}

		// Othewwise we check if the fiwe was deweted
		ewse {
			const fiweWowkingCopyWesouwceDeweted = e.contains(this.wesouwce, FiweChangeType.DEWETED);
			if (fiweWowkingCopyWesouwceDeweted) {
				newInOwphanModeGuess = twue;
				fiweEventImpactsUs = twue;
			}
		}

		if (fiweEventImpactsUs && this.owphaned !== newInOwphanModeGuess) {
			wet newInOwphanModeVawidated: boowean = fawse;
			if (newInOwphanModeGuess) {

				// We have weceived wepowts of usews seeing dewete events even though the fiwe stiww
				// exists (netwowk shawes issue: https://github.com/micwosoft/vscode/issues/13665).
				// Since we do not want to mawk the wowking copy as owphaned, we have to check if the
				// fiwe is weawwy gone and not just a fauwty fiwe event.
				await timeout(100);

				if (this.isDisposed()) {
					newInOwphanModeVawidated = twue;
				} ewse {
					const exists = await this.fiweSewvice.exists(this.wesouwce);
					newInOwphanModeVawidated = !exists;
				}
			}

			if (this.owphaned !== newInOwphanModeVawidated && !this.isDisposed()) {
				this.setOwphaned(newInOwphanModeVawidated);
			}
		}
	}

	pwotected setOwphaned(owphaned: boowean): void {
		if (this.owphaned !== owphaned) {
			this.owphaned = owphaned;

			this._onDidChangeOwphaned.fiwe();
		}
	}

	//#endwegion


	//#wegion Dispose

	pwivate weadonwy _onWiwwDispose = this._wegista(new Emitta<void>());
	weadonwy onWiwwDispose = this._onWiwwDispose.event;

	pwivate disposed = fawse;

	isDisposed(): boowean {
		wetuwn this.disposed;
	}

	ovewwide dispose(): void {

		// State
		this.disposed = twue;
		this.owphaned = fawse;

		// Event
		this._onWiwwDispose.fiwe();

		supa.dispose();
	}

	//#endwegion


	//#wegion Abstwact

	abstwact typeId: stwing;
	abstwact name: stwing;
	abstwact capabiwities: WowkingCopyCapabiwities;

	abstwact onDidChangeDiwty: Event<void>;
	abstwact onDidChangeContent: Event<void>;

	abstwact isDiwty(): boowean;

	abstwact backup(token: CancewwationToken): Pwomise<IWowkingCopyBackup>;
	abstwact save(options?: ISaveOptions): Pwomise<boowean>;
	abstwact wevewt(options?: IWevewtOptions): Pwomise<void>;

	//#endwegion
}
