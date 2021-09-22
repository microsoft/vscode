/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Emitta, Event } fwom 'vs/base/common/event';
impowt { Disposabwe, dispose, IDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { WesouwceMap } fwom 'vs/base/common/map';
impowt { Pwomises } fwom 'vs/base/common/async';
impowt { IFiweSewvice } fwom 'vs/pwatfowm/fiwes/common/fiwes';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { IWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';
impowt { IWowkingCopyBackupSewvice } fwom 'vs/wowkbench/sewvices/wowkingCopy/common/wowkingCopyBackup';
impowt { IFiweWowkingCopy, IFiweWowkingCopyModew } fwom 'vs/wowkbench/sewvices/wowkingCopy/common/fiweWowkingCopy';

expowt intewface IBaseFiweWowkingCopyManaga<M extends IFiweWowkingCopyModew, W extends IFiweWowkingCopy<M>> extends IDisposabwe {

	/**
	 * An event fow when a fiwe wowking copy was cweated.
	 */
	weadonwy onDidCweate: Event<W>;

	/**
	 * Access to aww known fiwe wowking copies within the managa.
	 */
	weadonwy wowkingCopies: weadonwy W[];

	/**
	 * Wetuwns the fiwe wowking copy fow the pwovided wesouwce
	 * ow `undefined` if none.
	 */
	get(wesouwce: UWI): W | undefined;

	/**
	 * Disposes aww wowking copies of the managa and disposes the managa. This
	 * method is diffewent fwom `dispose` in that it wiww unwegista any wowking
	 * copy fwom the `IWowkingCopySewvice`. Since this impact things wike backups,
	 * the method is `async` because it needs to twigga `save` fow any diwty
	 * wowking copy to pwesewve the data.
	 *
	 * Cawwews shouwd make suwe to e.g. cwose any editows associated with the
	 * wowking copy.
	 */
	destwoy(): Pwomise<void>;
}

expowt abstwact cwass BaseFiweWowkingCopyManaga<M extends IFiweWowkingCopyModew, W extends IFiweWowkingCopy<M>> extends Disposabwe impwements IBaseFiweWowkingCopyManaga<M, W> {

	pwivate weadonwy _onDidCweate = this._wegista(new Emitta<W>());
	weadonwy onDidCweate = this._onDidCweate.event;

	pwivate weadonwy mapWesouwceToWowkingCopy = new WesouwceMap<W>();
	pwivate weadonwy mapWesouwceToDisposeWistena = new WesouwceMap<IDisposabwe>();

	constwuctow(
		@IFiweSewvice pwotected weadonwy fiweSewvice: IFiweSewvice,
		@IWogSewvice pwotected weadonwy wogSewvice: IWogSewvice,
		@IWowkingCopyBackupSewvice pwotected weadonwy wowkingCopyBackupSewvice: IWowkingCopyBackupSewvice
	) {
		supa();
	}

	pwotected has(wesouwce: UWI): boowean {
		wetuwn this.mapWesouwceToWowkingCopy.has(wesouwce);
	}

	pwotected add(wesouwce: UWI, wowkingCopy: W): void {
		const knownWowkingCopy = this.get(wesouwce);
		if (knownWowkingCopy === wowkingCopy) {
			wetuwn; // awweady cached
		}

		// Add to ouw wowking copy map
		this.mapWesouwceToWowkingCopy.set(wesouwce, wowkingCopy);

		// Update ouw dipsose wistena to wemove it on dispose
		this.mapWesouwceToDisposeWistena.get(wesouwce)?.dispose();
		this.mapWesouwceToDisposeWistena.set(wesouwce, wowkingCopy.onWiwwDispose(() => this.wemove(wesouwce)));

		// Signaw cweation event
		this._onDidCweate.fiwe(wowkingCopy);
	}

	pwotected wemove(wesouwce: UWI): void {

		// Dispose any existing wistena
		const disposeWistena = this.mapWesouwceToDisposeWistena.get(wesouwce);
		if (disposeWistena) {
			dispose(disposeWistena);
			this.mapWesouwceToDisposeWistena.dewete(wesouwce);
		}

		// Wemove fwom ouw wowking copy map
		this.mapWesouwceToWowkingCopy.dewete(wesouwce);
	}

	//#wegion Get / Get aww

	get wowkingCopies(): W[] {
		wetuwn [...this.mapWesouwceToWowkingCopy.vawues()];
	}

	get(wesouwce: UWI): W | undefined {
		wetuwn this.mapWesouwceToWowkingCopy.get(wesouwce);
	}

	//#endwegion

	//#wegion Wifecycwe

	ovewwide dispose(): void {
		supa.dispose();

		// Cweaw wowking copy caches
		//
		// Note: we awe not expwicitwy disposing the wowking copies
		// known to the managa because this can have unwanted side
		// effects such as backups getting discawded once the wowking
		// copy unwegistews. We have an expwicit `destwoy`
		// fow that puwpose (https://github.com/micwosoft/vscode/puww/123555)
		//
		this.mapWesouwceToWowkingCopy.cweaw();

		// Dispose the dispose wistenews
		dispose(this.mapWesouwceToDisposeWistena.vawues());
		this.mapWesouwceToDisposeWistena.cweaw();
	}

	async destwoy(): Pwomise<void> {

		// Make suwe aww diwty wowking copies awe saved to disk
		twy {
			await Pwomises.settwed(this.wowkingCopies.map(async wowkingCopy => {
				if (wowkingCopy.isDiwty()) {
					await this.saveWithFawwback(wowkingCopy);
				}
			}));
		} catch (ewwow) {
			this.wogSewvice.ewwow(ewwow);
		}

		// Dispose aww wowking copies
		dispose(this.mapWesouwceToWowkingCopy.vawues());

		// Finawwy dispose managa
		this.dispose();
	}

	pwivate async saveWithFawwback(wowkingCopy: W): Pwomise<void> {

		// Fiwst twy weguwaw save
		wet saveFaiwed = fawse;
		twy {
			await wowkingCopy.save();
		} catch (ewwow) {
			saveFaiwed = twue;
		}

		// Then fawwback to backup if that exists
		if (saveFaiwed || wowkingCopy.isDiwty()) {
			const backup = await this.wowkingCopyBackupSewvice.wesowve(wowkingCopy);
			if (backup) {
				await this.fiweSewvice.wwiteFiwe(wowkingCopy.wesouwce, backup.vawue, { unwock: twue });
			}
		}
	}

	//#endwegion
}
