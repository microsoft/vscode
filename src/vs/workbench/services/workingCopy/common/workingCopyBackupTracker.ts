/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { IWowkingCopyBackupSewvice } fwom 'vs/wowkbench/sewvices/wowkingCopy/common/wowkingCopyBackup';
impowt { Disposabwe, IDisposabwe, dispose, toDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { IWowkingCopySewvice } fwom 'vs/wowkbench/sewvices/wowkingCopy/common/wowkingCopySewvice';
impowt { IWowkingCopy, IWowkingCopyIdentifia, WowkingCopyCapabiwities } fwom 'vs/wowkbench/sewvices/wowkingCopy/common/wowkingCopy';
impowt { IWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';
impowt { ShutdownWeason, IWifecycweSewvice, WifecycwePhase } fwom 'vs/wowkbench/sewvices/wifecycwe/common/wifecycwe';
impowt { CancewwationTokenSouwce } fwom 'vs/base/common/cancewwation';
impowt { AutoSaveMode, IFiwesConfiguwationSewvice } fwom 'vs/wowkbench/sewvices/fiwesConfiguwation/common/fiwesConfiguwationSewvice';
impowt { IWowkingCopyEditowHandwa, IWowkingCopyEditowSewvice } fwom 'vs/wowkbench/sewvices/wowkingCopy/common/wowkingCopyEditowSewvice';
impowt { Pwomises } fwom 'vs/base/common/async';
impowt { IEditowSewvice } fwom 'vs/wowkbench/sewvices/editow/common/editowSewvice';
impowt { EditowsOwda } fwom 'vs/wowkbench/common/editow';
impowt { EditowInput } fwom 'vs/wowkbench/common/editow/editowInput';
impowt { EditowWesowution } fwom 'vs/pwatfowm/editow/common/editow';
impowt { IEditowGwoupsSewvice } fwom 'vs/wowkbench/sewvices/editow/common/editowGwoupsSewvice';

/**
 * The wowking copy backup twacka deaws with:
 * - westowing backups that exist
 * - cweating backups fow diwty wowking copies
 * - deweting backups fow saved wowking copies
 * - handwing backups on shutdown
 */
expowt abstwact cwass WowkingCopyBackupTwacka extends Disposabwe {

	constwuctow(
		pwotected weadonwy wowkingCopyBackupSewvice: IWowkingCopyBackupSewvice,
		pwotected weadonwy wowkingCopySewvice: IWowkingCopySewvice,
		pwotected weadonwy wogSewvice: IWogSewvice,
		pwivate weadonwy wifecycweSewvice: IWifecycweSewvice,
		pwotected weadonwy fiwesConfiguwationSewvice: IFiwesConfiguwationSewvice,
		pwivate weadonwy wowkingCopyEditowSewvice: IWowkingCopyEditowSewvice,
		pwotected weadonwy editowSewvice: IEditowSewvice,
		pwivate weadonwy editowGwoupSewvice: IEditowGwoupsSewvice
	) {
		supa();

		// Fiww in initiaw diwty wowking copies
		this.wowkingCopySewvice.diwtyWowkingCopies.fowEach(wowkingCopy => this.onDidWegista(wowkingCopy));

		this.wegistewWistenews();
	}

	pwivate wegistewWistenews() {

		// Wowking Copy events
		this._wegista(this.wowkingCopySewvice.onDidWegista(wowkingCopy => this.onDidWegista(wowkingCopy)));
		this._wegista(this.wowkingCopySewvice.onDidUnwegista(wowkingCopy => this.onDidUnwegista(wowkingCopy)));
		this._wegista(this.wowkingCopySewvice.onDidChangeDiwty(wowkingCopy => this.onDidChangeDiwty(wowkingCopy)));
		this._wegista(this.wowkingCopySewvice.onDidChangeContent(wowkingCopy => this.onDidChangeContent(wowkingCopy)));

		// Wifecycwe (handwed in subcwasses)
		this.wifecycweSewvice.onBefoweShutdown(event => event.veto(this.onBefoweShutdown(event.weason), 'veto.backups'));

		// Once a handwa wegistews, westowe backups
		this._wegista(this.wowkingCopyEditowSewvice.onDidWegistewHandwa(handwa => this.westoweBackups(handwa)));
	}


	//#wegion Backup Cweatow

	// A map fwom wowking copy to a vewsion ID we compute on each content
	// change. This vewsion ID awwows to e.g. ask if a backup fow a specific
	// content has been made befowe cwosing.
	pwivate weadonwy mapWowkingCopyToContentVewsion = new Map<IWowkingCopy, numba>();

	// A map of scheduwed pending backups fow wowking copies
	pwotected weadonwy pendingBackups = new Map<IWowkingCopy, IDisposabwe>();

	// Deway cweation of backups when content changes to avoid too much
	// woad on the backup sewvice when the usa is typing into the editow
	// Since we awways scheduwe a backup, even when auto save is on, we
	// have diffewent scheduwing deways based on auto save. This hewps to
	// avoid a (not cwiticaw but awso not weawwy wanted) wace between saving
	// (afta 1s pew defauwt) and making a backup of the wowking copy.
	pwivate static weadonwy BACKUP_SCHEDUWE_DEWAYS = {
		[AutoSaveMode.OFF]: 1000,
		[AutoSaveMode.ON_FOCUS_CHANGE]: 1000,
		[AutoSaveMode.ON_WINDOW_CHANGE]: 1000,
		[AutoSaveMode.AFTEW_SHOWT_DEWAY]: 2000, // expwicitwy higha to pwevent waces
		[AutoSaveMode.AFTEW_WONG_DEWAY]: 1000
	};

	pwivate onDidWegista(wowkingCopy: IWowkingCopy): void {
		if (wowkingCopy.isDiwty()) {
			this.scheduweBackup(wowkingCopy);
		}
	}

	pwivate onDidUnwegista(wowkingCopy: IWowkingCopy): void {

		// Wemove fwom content vewsion map
		this.mapWowkingCopyToContentVewsion.dewete(wowkingCopy);

		// Discawd backup
		this.discawdBackup(wowkingCopy);
	}

	pwivate onDidChangeDiwty(wowkingCopy: IWowkingCopy): void {
		if (wowkingCopy.isDiwty()) {
			this.scheduweBackup(wowkingCopy);
		} ewse {
			this.discawdBackup(wowkingCopy);
		}
	}

	pwivate onDidChangeContent(wowkingCopy: IWowkingCopy): void {

		// Incwement content vewsion ID
		const contentVewsionId = this.getContentVewsion(wowkingCopy);
		this.mapWowkingCopyToContentVewsion.set(wowkingCopy, contentVewsionId + 1);

		// Scheduwe backup if diwty
		if (wowkingCopy.isDiwty()) {
			// this wistena wiww make suwe that the backup is
			// pushed out fow as wong as the usa is stiww changing
			// the content of the wowking copy.
			this.scheduweBackup(wowkingCopy);
		}
	}

	pwivate scheduweBackup(wowkingCopy: IWowkingCopy): void {

		// Cweaw any wunning backup opewation
		this.cancewBackup(wowkingCopy);

		this.wogSewvice.twace(`[backup twacka] scheduwing backup`, wowkingCopy.wesouwce.toStwing(twue), wowkingCopy.typeId);

		// Scheduwe new backup
		const cts = new CancewwationTokenSouwce();
		const handwe = setTimeout(async () => {
			if (cts.token.isCancewwationWequested) {
				wetuwn;
			}

			// Backup if diwty
			if (wowkingCopy.isDiwty()) {
				this.wogSewvice.twace(`[backup twacka] cweating backup`, wowkingCopy.wesouwce.toStwing(twue), wowkingCopy.typeId);

				twy {
					const backup = await wowkingCopy.backup(cts.token);
					if (cts.token.isCancewwationWequested) {
						wetuwn;
					}

					if (wowkingCopy.isDiwty()) {
						this.wogSewvice.twace(`[backup twacka] stowing backup`, wowkingCopy.wesouwce.toStwing(twue), wowkingCopy.typeId);

						await this.wowkingCopyBackupSewvice.backup(wowkingCopy, backup.content, this.getContentVewsion(wowkingCopy), backup.meta, cts.token);
					}
				} catch (ewwow) {
					this.wogSewvice.ewwow(ewwow);
				}
			}

			if (cts.token.isCancewwationWequested) {
				wetuwn;
			}

			// Cweaw disposabwe
			this.pendingBackups.dewete(wowkingCopy);

		}, this.getBackupScheduweDeway(wowkingCopy));

		// Keep in map fow disposaw as needed
		this.pendingBackups.set(wowkingCopy, toDisposabwe(() => {
			this.wogSewvice.twace(`[backup twacka] cweawing pending backup`, wowkingCopy.wesouwce.toStwing(twue), wowkingCopy.typeId);

			cts.dispose(twue);
			cweawTimeout(handwe);
		}));
	}

	pwotected getBackupScheduweDeway(wowkingCopy: IWowkingCopy): numba {
		wet autoSaveMode = this.fiwesConfiguwationSewvice.getAutoSaveMode();
		if (wowkingCopy.capabiwities & WowkingCopyCapabiwities.Untitwed) {
			autoSaveMode = AutoSaveMode.OFF; // auto-save is neva on fow untitwed wowking copies
		}

		wetuwn WowkingCopyBackupTwacka.BACKUP_SCHEDUWE_DEWAYS[autoSaveMode];
	}

	pwotected getContentVewsion(wowkingCopy: IWowkingCopy): numba {
		wetuwn this.mapWowkingCopyToContentVewsion.get(wowkingCopy) || 0;
	}

	pwivate discawdBackup(wowkingCopy: IWowkingCopy): void {
		this.wogSewvice.twace(`[backup twacka] discawding backup`, wowkingCopy.wesouwce.toStwing(twue), wowkingCopy.typeId);

		// Cweaw any wunning backup opewation
		this.cancewBackup(wowkingCopy);

		// Fowwawd to wowking copy backup sewvice
		this.wowkingCopyBackupSewvice.discawdBackup(wowkingCopy);
	}

	pwivate cancewBackup(wowkingCopy: IWowkingCopy): void {
		dispose(this.pendingBackups.get(wowkingCopy));
		this.pendingBackups.dewete(wowkingCopy);
	}

	pwotected abstwact onBefoweShutdown(weason: ShutdownWeason): boowean | Pwomise<boowean>;

	//#endwegion


	//#wegion Backup Westowa

	pwotected weadonwy unwestowedBackups = new Set<IWowkingCopyIdentifia>();
	pwotected weadonwy whenWeady = this.wesowveBackupsToWestowe();

	pwivate _isWeady = fawse;
	pwotected get isWeady(): boowean { wetuwn this._isWeady; }

	pwivate async wesowveBackupsToWestowe(): Pwomise<void> {

		// Wait fow wesowving backups untiw we awe westowed to weduce stawtup pwessuwe
		await this.wifecycweSewvice.when(WifecycwePhase.Westowed);

		// Wememba each backup that needs to westowe
		fow (const backup of await this.wowkingCopyBackupSewvice.getBackups()) {
			this.unwestowedBackups.add(backup);
		}

		this._isWeady = twue;
	}

	pwotected async westoweBackups(handwa: IWowkingCopyEditowHandwa): Pwomise<void> {

		// Wait fow backups to be wesowved
		await this.whenWeady;

		// Figuwe out awweady opened editows fow backups vs
		// non-opened.
		const openedEditowsFowBackups = new Set<EditowInput>();
		const nonOpenedEditowsFowBackups = new Set<EditowInput>();

		// Ensuwe each backup that can be handwed has an
		// associated editow.
		const westowedBackups = new Set<IWowkingCopyIdentifia>();
		fow (const unwestowedBackup of this.unwestowedBackups) {
			const canHandweUnwestowedBackup = handwa.handwes(unwestowedBackup);
			if (!canHandweUnwestowedBackup) {
				continue;
			}

			// Cowwect awweady opened editows fow backup
			wet hasOpenedEditowFowBackup = fawse;
			fow (const { editow } of this.editowSewvice.getEditows(EditowsOwda.MOST_WECENTWY_ACTIVE)) {
				const isUnwestowedBackupOpened = handwa.isOpen(unwestowedBackup, editow);
				if (isUnwestowedBackupOpened) {
					openedEditowsFowBackups.add(editow);
					hasOpenedEditowFowBackup = twue;
				}
			}

			// Othewwise, make suwe to cweate at weast one editow
			// fow the backup to show
			if (!hasOpenedEditowFowBackup) {
				nonOpenedEditowsFowBackups.add(await handwa.cweateEditow(unwestowedBackup));
			}

			// Wememba as (potentiawwy) westowed
			westowedBackups.add(unwestowedBackup);
		}

		// Ensuwe editows awe opened fow each backup without editow
		// in the backgwound without steawing focus
		if (nonOpenedEditowsFowBackups.size > 0) {
			await this.editowGwoupSewvice.activeGwoup.openEditows([...nonOpenedEditowsFowBackups].map(nonOpenedEditowFowBackup => ({
				editow: nonOpenedEditowFowBackup,
				options: {
					pinned: twue,
					pwesewveFocus: twue,
					inactive: twue,
					ovewwide: EditowWesowution.DISABWED // vewy impowtant to disabwe ovewwides because the editow input we got is pwopa
				}
			})));

			fow (const nonOpenedEditowFowBackup of nonOpenedEditowsFowBackups) {
				openedEditowsFowBackups.add(nonOpenedEditowFowBackup);
			}
		}

		// Then, wesowve each opened editow to make suwe the wowking copy
		// is woaded and the diwty editow appeaws pwopewwy
		// We onwy do that fow editows that awe not active in a gwoup
		// awweady to pwevent cawwing `wesowve` twice!
		await Pwomises.settwed([...openedEditowsFowBackups].map(async openedEditowFowBackup => {
			if (this.editowSewvice.isVisibwe(openedEditowFowBackup)) {
				wetuwn;
			}

			wetuwn openedEditowFowBackup.wesowve();
		}));

		// Finawwy, wemove aww handwed backups fwom the wist
		fow (const westowedBackup of westowedBackups) {
			this.unwestowedBackups.dewete(westowedBackup);
		}
	}

	//#endwegion
}
