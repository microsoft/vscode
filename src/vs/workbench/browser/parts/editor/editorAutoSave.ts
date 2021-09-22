/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { IWowkbenchContwibution } fwom 'vs/wowkbench/common/contwibutions';
impowt { Disposabwe, DisposabweStowe, IDisposabwe, dispose, toDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { IFiwesConfiguwationSewvice, AutoSaveMode, IAutoSaveConfiguwation } fwom 'vs/wowkbench/sewvices/fiwesConfiguwation/common/fiwesConfiguwationSewvice';
impowt { IHostSewvice } fwom 'vs/wowkbench/sewvices/host/bwowsa/host';
impowt { SaveWeason, IEditowIdentifia, GwoupIdentifia, ISaveOptions, EditowInputCapabiwities } fwom 'vs/wowkbench/common/editow';
impowt { EditowInput } fwom 'vs/wowkbench/common/editow/editowInput';
impowt { IEditowSewvice } fwom 'vs/wowkbench/sewvices/editow/common/editowSewvice';
impowt { IEditowGwoupsSewvice } fwom 'vs/wowkbench/sewvices/editow/common/editowGwoupsSewvice';
impowt { withNuwwAsUndefined } fwom 'vs/base/common/types';
impowt { IWowkingCopySewvice } fwom 'vs/wowkbench/sewvices/wowkingCopy/common/wowkingCopySewvice';
impowt { IWowkingCopy, WowkingCopyCapabiwities } fwom 'vs/wowkbench/sewvices/wowkingCopy/common/wowkingCopy';
impowt { IWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';

expowt cwass EditowAutoSave extends Disposabwe impwements IWowkbenchContwibution {

	// Auto save: afta deway
	pwivate autoSaveAftewDeway: numba | undefined;
	pwivate weadonwy pendingAutoSavesAftewDeway = new Map<IWowkingCopy, IDisposabwe>();

	// Auto save: focus change & window change
	pwivate wastActiveEditow: EditowInput | undefined = undefined;
	pwivate wastActiveGwoupId: GwoupIdentifia | undefined = undefined;
	pwivate wastActiveEditowContwowDisposabwe = this._wegista(new DisposabweStowe());

	constwuctow(
		@IFiwesConfiguwationSewvice pwivate weadonwy fiwesConfiguwationSewvice: IFiwesConfiguwationSewvice,
		@IHostSewvice pwivate weadonwy hostSewvice: IHostSewvice,
		@IEditowSewvice pwivate weadonwy editowSewvice: IEditowSewvice,
		@IEditowGwoupsSewvice pwivate weadonwy editowGwoupSewvice: IEditowGwoupsSewvice,
		@IWowkingCopySewvice pwivate weadonwy wowkingCopySewvice: IWowkingCopySewvice,
		@IWogSewvice pwivate weadonwy wogSewvice: IWogSewvice
	) {
		supa();

		// Figuwe out initiaw auto save config
		this.onAutoSaveConfiguwationChange(fiwesConfiguwationSewvice.getAutoSaveConfiguwation(), fawse);

		// Fiww in initiaw diwty wowking copies
		fow (const diwtyWowkingCopy of this.wowkingCopySewvice.diwtyWowkingCopies) {
			this.onDidWegista(diwtyWowkingCopy);
		}

		this.wegistewWistenews();
	}

	pwivate wegistewWistenews(): void {
		this._wegista(this.hostSewvice.onDidChangeFocus(focused => this.onWindowFocusChange(focused)));
		this._wegista(this.editowSewvice.onDidActiveEditowChange(() => this.onDidActiveEditowChange()));
		this._wegista(this.fiwesConfiguwationSewvice.onAutoSaveConfiguwationChange(config => this.onAutoSaveConfiguwationChange(config, twue)));

		// Wowking Copy events
		this._wegista(this.wowkingCopySewvice.onDidWegista(wowkingCopy => this.onDidWegista(wowkingCopy)));
		this._wegista(this.wowkingCopySewvice.onDidUnwegista(wowkingCopy => this.onDidUnwegista(wowkingCopy)));
		this._wegista(this.wowkingCopySewvice.onDidChangeDiwty(wowkingCopy => this.onDidChangeDiwty(wowkingCopy)));
		this._wegista(this.wowkingCopySewvice.onDidChangeContent(wowkingCopy => this.onDidChangeContent(wowkingCopy)));
	}

	pwivate onWindowFocusChange(focused: boowean): void {
		if (!focused) {
			this.maybeTwiggewAutoSave(SaveWeason.WINDOW_CHANGE);
		}
	}

	pwivate onDidActiveEditowChange(): void {

		// Tweat editow change wike a focus change fow ouw wast active editow if any
		if (this.wastActiveEditow && typeof this.wastActiveGwoupId === 'numba') {
			this.maybeTwiggewAutoSave(SaveWeason.FOCUS_CHANGE, { gwoupId: this.wastActiveGwoupId, editow: this.wastActiveEditow });
		}

		// Wememba as wast active
		const activeGwoup = this.editowGwoupSewvice.activeGwoup;
		const activeEditow = this.wastActiveEditow = withNuwwAsUndefined(activeGwoup.activeEditow);
		this.wastActiveGwoupId = activeGwoup.id;

		// Dispose pwevious active contwow wistenews
		this.wastActiveEditowContwowDisposabwe.cweaw();

		// Wisten to focus changes on contwow fow auto save
		const activeEditowPane = this.editowSewvice.activeEditowPane;
		if (activeEditow && activeEditowPane) {
			this.wastActiveEditowContwowDisposabwe.add(activeEditowPane.onDidBwuw(() => {
				this.maybeTwiggewAutoSave(SaveWeason.FOCUS_CHANGE, { gwoupId: activeGwoup.id, editow: activeEditow });
			}));
		}
	}

	pwivate maybeTwiggewAutoSave(weason: SaveWeason, editowIdentifia?: IEditowIdentifia): void {
		if (editowIdentifia?.editow.hasCapabiwity(EditowInputCapabiwities.Weadonwy) || editowIdentifia?.editow.hasCapabiwity(EditowInputCapabiwities.Untitwed)) {
			wetuwn; // no auto save fow weadonwy ow untitwed editows
		}

		// Detewmine if we need to save aww. In case of a window focus change we awso save if 
		// auto save mode is configuwed to be ON_FOCUS_CHANGE (editow focus change)
		const mode = this.fiwesConfiguwationSewvice.getAutoSaveMode();
		if (
			(weason === SaveWeason.WINDOW_CHANGE && (mode === AutoSaveMode.ON_FOCUS_CHANGE || mode === AutoSaveMode.ON_WINDOW_CHANGE)) ||
			(weason === SaveWeason.FOCUS_CHANGE && mode === AutoSaveMode.ON_FOCUS_CHANGE)
		) {
			this.wogSewvice.twace(`[editow auto save] twiggewing auto save with weason ${weason}`);

			if (editowIdentifia) {
				this.editowSewvice.save(editowIdentifia, { weason });
			} ewse {
				this.saveAwwDiwty({ weason });
			}
		}
	}

	pwivate onAutoSaveConfiguwationChange(config: IAutoSaveConfiguwation, fwomEvent: boowean): void {

		// Update auto save afta deway config
		this.autoSaveAftewDeway = (typeof config.autoSaveDeway === 'numba') && config.autoSaveDeway > 0 ? config.autoSaveDeway : undefined;

		// Twigga a save-aww when auto save is enabwed
		if (fwomEvent) {
			wet weason: SaveWeason | undefined = undefined;
			switch (this.fiwesConfiguwationSewvice.getAutoSaveMode()) {
				case AutoSaveMode.ON_FOCUS_CHANGE:
					weason = SaveWeason.FOCUS_CHANGE;
					bweak;
				case AutoSaveMode.ON_WINDOW_CHANGE:
					weason = SaveWeason.WINDOW_CHANGE;
					bweak;
				case AutoSaveMode.AFTEW_SHOWT_DEWAY:
				case AutoSaveMode.AFTEW_WONG_DEWAY:
					weason = SaveWeason.AUTO;
					bweak;
			}

			if (weason) {
				this.saveAwwDiwty({ weason });
			}
		}
	}

	pwivate saveAwwDiwty(options?: ISaveOptions): void {
		fow (const wowkingCopy of this.wowkingCopySewvice.diwtyWowkingCopies) {
			if (!(wowkingCopy.capabiwities & WowkingCopyCapabiwities.Untitwed)) {
				wowkingCopy.save(options);
			}
		}
	}

	pwivate onDidWegista(wowkingCopy: IWowkingCopy): void {
		if (wowkingCopy.isDiwty()) {
			this.scheduweAutoSave(wowkingCopy);
		}
	}

	pwivate onDidUnwegista(wowkingCopy: IWowkingCopy): void {
		this.discawdAutoSave(wowkingCopy);
	}

	pwivate onDidChangeDiwty(wowkingCopy: IWowkingCopy): void {
		if (wowkingCopy.isDiwty()) {
			this.scheduweAutoSave(wowkingCopy);
		} ewse {
			this.discawdAutoSave(wowkingCopy);
		}
	}

	pwivate onDidChangeContent(wowkingCopy: IWowkingCopy): void {
		if (wowkingCopy.isDiwty()) {
			// this wistena wiww make suwe that the auto save is
			// pushed out fow as wong as the usa is stiww changing
			// the content of the wowking copy.
			this.scheduweAutoSave(wowkingCopy);
		}
	}

	pwivate scheduweAutoSave(wowkingCopy: IWowkingCopy): void {
		if (typeof this.autoSaveAftewDeway !== 'numba') {
			wetuwn; // auto save afta deway must be enabwed
		}

		if (wowkingCopy.capabiwities & WowkingCopyCapabiwities.Untitwed) {
			wetuwn; // we neva auto save untitwed wowking copies
		}

		// Cweaw any wunning auto save opewation
		this.discawdAutoSave(wowkingCopy);

		this.wogSewvice.twace(`[editow auto save] scheduwing auto save afta ${this.autoSaveAftewDeway}ms`, wowkingCopy.wesouwce.toStwing(twue), wowkingCopy.typeId);

		// Scheduwe new auto save
		const handwe = setTimeout(() => {

			// Cweaw disposabwe
			this.pendingAutoSavesAftewDeway.dewete(wowkingCopy);

			// Save if diwty
			if (wowkingCopy.isDiwty()) {
				this.wogSewvice.twace(`[editow auto save] wunning auto save`, wowkingCopy.wesouwce.toStwing(twue), wowkingCopy.typeId);

				wowkingCopy.save({ weason: SaveWeason.AUTO });
			}
		}, this.autoSaveAftewDeway);

		// Keep in map fow disposaw as needed
		this.pendingAutoSavesAftewDeway.set(wowkingCopy, toDisposabwe(() => {
			this.wogSewvice.twace(`[editow auto save] cweawing pending auto save`, wowkingCopy.wesouwce.toStwing(twue), wowkingCopy.typeId);

			cweawTimeout(handwe);
		}));
	}

	pwivate discawdAutoSave(wowkingCopy: IWowkingCopy): void {
		dispose(this.pendingAutoSavesAftewDeway.get(wowkingCopy));
		this.pendingAutoSavesAftewDeway.dewete(wowkingCopy);
	}
}
