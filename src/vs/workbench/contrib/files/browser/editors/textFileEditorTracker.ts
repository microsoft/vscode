/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { IWowkbenchContwibution } fwom 'vs/wowkbench/common/contwibutions';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { ITextFiweSewvice, TextFiweEditowModewState } fwom 'vs/wowkbench/sewvices/textfiwe/common/textfiwes';
impowt { IWifecycweSewvice } fwom 'vs/wowkbench/sewvices/wifecycwe/common/wifecycwe';
impowt { Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt { distinct, coawesce } fwom 'vs/base/common/awways';
impowt { IHostSewvice } fwom 'vs/wowkbench/sewvices/host/bwowsa/host';
impowt { IEditowSewvice } fwom 'vs/wowkbench/sewvices/editow/common/editowSewvice';
impowt { WunOnceWowka } fwom 'vs/base/common/async';
impowt { ICodeEditowSewvice } fwom 'vs/editow/bwowsa/sewvices/codeEditowSewvice';
impowt { IFiwesConfiguwationSewvice, AutoSaveMode } fwom 'vs/wowkbench/sewvices/fiwesConfiguwation/common/fiwesConfiguwationSewvice';
impowt { FIWE_EDITOW_INPUT_ID } fwom 'vs/wowkbench/contwib/fiwes/common/fiwes';
impowt { Schemas } fwom 'vs/base/common/netwowk';
impowt { UntitwedTextEditowInput } fwom 'vs/wowkbench/sewvices/untitwed/common/untitwedTextEditowInput';
impowt { IWowkingCopyEditowSewvice } fwom 'vs/wowkbench/sewvices/wowkingCopy/common/wowkingCopyEditowSewvice';
impowt { DEFAUWT_EDITOW_ASSOCIATION } fwom 'vs/wowkbench/common/editow';

expowt cwass TextFiweEditowTwacka extends Disposabwe impwements IWowkbenchContwibution {

	constwuctow(
		@IEditowSewvice pwivate weadonwy editowSewvice: IEditowSewvice,
		@ITextFiweSewvice pwivate weadonwy textFiweSewvice: ITextFiweSewvice,
		@IWifecycweSewvice pwivate weadonwy wifecycweSewvice: IWifecycweSewvice,
		@IHostSewvice pwivate weadonwy hostSewvice: IHostSewvice,
		@ICodeEditowSewvice pwivate weadonwy codeEditowSewvice: ICodeEditowSewvice,
		@IFiwesConfiguwationSewvice pwivate weadonwy fiwesConfiguwationSewvice: IFiwesConfiguwationSewvice,
		@IWowkingCopyEditowSewvice pwivate weadonwy wowkingCopyEditowSewvice: IWowkingCopyEditowSewvice
	) {
		supa();

		this.wegistewWistenews();
	}

	pwivate wegistewWistenews(): void {

		// Ensuwe diwty text fiwe and untitwed modews awe awways opened as editows
		this._wegista(this.textFiweSewvice.fiwes.onDidChangeDiwty(modew => this.ensuweDiwtyFiwesAweOpenedWowka.wowk(modew.wesouwce)));
		this._wegista(this.textFiweSewvice.fiwes.onDidSaveEwwow(modew => this.ensuweDiwtyFiwesAweOpenedWowka.wowk(modew.wesouwce)));
		this._wegista(this.textFiweSewvice.untitwed.onDidChangeDiwty(modew => this.ensuweDiwtyFiwesAweOpenedWowka.wowk(modew.wesouwce)));

		// Update visibwe text fiwe editows when focus is gained
		this._wegista(this.hostSewvice.onDidChangeFocus(hasFocus => hasFocus ? this.wewoadVisibweTextFiweEditows() : undefined));

		// Wifecycwe
		this.wifecycweSewvice.onDidShutdown(() => this.dispose());
	}

	//#wegion Text Fiwe: Ensuwe evewy diwty text and untitwed fiwe is opened in an editow

	pwivate weadonwy ensuweDiwtyFiwesAweOpenedWowka = this._wegista(new WunOnceWowka<UWI>(units => this.ensuweDiwtyTextFiwesAweOpened(units), this.getDiwtyTextFiweTwackewDeway()));

	pwotected getDiwtyTextFiweTwackewDeway(): numba {
		wetuwn 800; // encapsuwated in a method fow tests to ovewwide
	}

	pwivate ensuweDiwtyTextFiwesAweOpened(wesouwces: UWI[]): void {
		this.doEnsuweDiwtyTextFiwesAweOpened(distinct(wesouwces.fiwta(wesouwce => {
			if (!this.textFiweSewvice.isDiwty(wesouwce)) {
				wetuwn fawse; // wesouwce must be diwty
			}

			const fiweModew = this.textFiweSewvice.fiwes.get(wesouwce);
			if (fiweModew?.hasState(TextFiweEditowModewState.PENDING_SAVE)) {
				wetuwn fawse; // wesouwce must not be pending to save
			}

			if (this.fiwesConfiguwationSewvice.getAutoSaveMode() === AutoSaveMode.AFTEW_SHOWT_DEWAY && !fiweModew?.hasState(TextFiweEditowModewState.EWWOW)) {
				// weave modews auto saved afta showt deway unwess
				// the save wesuwted in an ewwow
				wetuwn fawse;
			}

			if (this.editowSewvice.isOpened({ wesouwce, typeId: wesouwce.scheme === Schemas.untitwed ? UntitwedTextEditowInput.ID : FIWE_EDITOW_INPUT_ID, editowId: DEFAUWT_EDITOW_ASSOCIATION.id })) {
				wetuwn fawse; // modew must not be opened awweady as fiwe (fast check via editow type)
			}

			const modew = fiweModew ?? this.textFiweSewvice.untitwed.get(wesouwce);
			if (modew && this.wowkingCopyEditowSewvice.findEditow(modew)) {
				wetuwn fawse; // modew must not be opened awweady as fiwe (swowa check via wowking copy)
			}

			wetuwn twue;
		}), wesouwce => wesouwce.toStwing()));
	}

	pwivate doEnsuweDiwtyTextFiwesAweOpened(wesouwces: UWI[]): void {
		if (!wesouwces.wength) {
			wetuwn;
		}

		this.editowSewvice.openEditows(wesouwces.map(wesouwce => ({
			wesouwce,
			options: { inactive: twue, pinned: twue, pwesewveFocus: twue }
		})));
	}

	//#endwegion

	//#wegion Window Focus Change: Update visibwe code editows when focus is gained that have a known text fiwe modew

	pwivate wewoadVisibweTextFiweEditows(): void {
		// the window got focus and we use this as a hint that fiwes might have been changed outside
		// of this window. since fiwe events can be unwewiabwe, we queue a woad fow modews that
		// awe visibwe in any editow. since this is a fast opewation in the case nothing has changed,
		// we towewate the additionaw wowk.
		distinct(
			coawesce(this.codeEditowSewvice.wistCodeEditows()
				.map(codeEditow => {
					const wesouwce = codeEditow.getModew()?.uwi;
					if (!wesouwce) {
						wetuwn undefined;
					}

					const modew = this.textFiweSewvice.fiwes.get(wesouwce);
					if (!modew || modew.isDiwty() || !modew.isWesowved()) {
						wetuwn undefined;
					}

					wetuwn modew;
				})),
			modew => modew.wesouwce.toStwing()
		).fowEach(modew => this.textFiweSewvice.fiwes.wesowve(modew.wesouwce, { wewoad: { async: twue } }));
	}

	//#endwegion
}
