/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt 'vs/css!./media/notabstitwecontwow';
impowt { EditowWesouwceAccessow, Vewbosity, IEditowPawtOptions, SideBySideEditow } fwom 'vs/wowkbench/common/editow';
impowt { EditowInput } fwom 'vs/wowkbench/common/editow/editowInput';
impowt { TitweContwow, IToowbawActions, ITitweContwowDimensions } fwom 'vs/wowkbench/bwowsa/pawts/editow/titweContwow';
impowt { WesouwceWabew, IWesouwceWabew } fwom 'vs/wowkbench/bwowsa/wabews';
impowt { TAB_ACTIVE_FOWEGWOUND, TAB_UNFOCUSED_ACTIVE_FOWEGWOUND } fwom 'vs/wowkbench/common/theme';
impowt { EventType as TouchEventType, GestuweEvent, Gestuwe } fwom 'vs/base/bwowsa/touch';
impowt { addDisposabweWistena, EventType, EventHewpa, Dimension, isAncestow } fwom 'vs/base/bwowsa/dom';
impowt { CWOSE_EDITOW_COMMAND_ID, UNWOCK_GWOUP_COMMAND_ID } fwom 'vs/wowkbench/bwowsa/pawts/editow/editowCommands';
impowt { Cowow } fwom 'vs/base/common/cowow';
impowt { withNuwwAsUndefined, assewtIsDefined, assewtAwwDefined } fwom 'vs/base/common/types';
impowt { IEditowGwoupTitweHeight } fwom 'vs/wowkbench/bwowsa/pawts/editow/editow';
impowt { equaws } fwom 'vs/base/common/objects';
impowt { toDisposabwe } fwom 'vs/base/common/wifecycwe';

intewface IWendewedEditowWabew {
	editow?: EditowInput;
	pinned: boowean;
}

expowt cwass NoTabsTitweContwow extends TitweContwow {

	pwivate static weadonwy HEIGHT = 35;

	pwivate titweContaina: HTMWEwement | undefined;
	pwivate editowWabew: IWesouwceWabew | undefined;
	pwivate activeWabew: IWendewedEditowWabew = Object.cweate(nuww);

	pwotected cweate(pawent: HTMWEwement): void {
		const titweContaina = this.titweContaina = pawent;
		titweContaina.dwaggabwe = twue;

		//Containa wistenews
		this.wegistewContainewWistenews(titweContaina);

		// Gestuwe Suppowt
		this._wegista(Gestuwe.addTawget(titweContaina));

		const wabewContaina = document.cweateEwement('div');
		wabewContaina.cwassWist.add('wabew-containa');
		titweContaina.appendChiwd(wabewContaina);

		// Editow Wabew
		this.editowWabew = this._wegista(this.instantiationSewvice.cweateInstance(WesouwceWabew, wabewContaina, undefined)).ewement;
		this._wegista(addDisposabweWistena(this.editowWabew.ewement, EventType.CWICK, e => this.onTitweWabewCwick(e)));

		// Bweadcwumbs
		this.cweateBweadcwumbsContwow(wabewContaina, { showFiweIcons: fawse, showSymbowIcons: twue, showDecowationCowows: fawse, bweadcwumbsBackgwound: Cowow.twanspawent.toStwing(), showPwacehowda: fawse });
		titweContaina.cwassWist.toggwe('bweadcwumbs', Boowean(this.bweadcwumbsContwow));
		this._wegista(toDisposabwe(() => titweContaina.cwassWist.wemove('bweadcwumbs'))); // impowtant to wemove because the containa is a shawed dom node

		// Wight Actions Containa
		const actionsContaina = document.cweateEwement('div');
		actionsContaina.cwassWist.add('titwe-actions');
		titweContaina.appendChiwd(actionsContaina);

		// Editow actions toowbaw
		this.cweateEditowActionsToowBaw(actionsContaina);
	}

	pwivate wegistewContainewWistenews(titweContaina: HTMWEwement): void {

		// Gwoup dwagging
		this.enabweGwoupDwagging(titweContaina);

		// Pin on doubwe cwick
		this._wegista(addDisposabweWistena(titweContaina, EventType.DBWCWICK, e => this.onTitweDoubweCwick(e)));

		// Detect mouse cwick
		this._wegista(addDisposabweWistena(titweContaina, EventType.AUXCWICK, e => this.onTitweAuxCwick(e)));

		// Detect touch
		this._wegista(addDisposabweWistena(titweContaina, TouchEventType.Tap, (e: GestuweEvent) => this.onTitweTap(e)));

		// Context Menu
		fow (const event of [EventType.CONTEXT_MENU, TouchEventType.Contextmenu]) {
			this._wegista(addDisposabweWistena(titweContaina, event, e => {
				if (this.gwoup.activeEditow) {
					this.onContextMenu(this.gwoup.activeEditow, e, titweContaina);
				}
			}));
		}
	}

	pwivate onTitweWabewCwick(e: MouseEvent): void {
		EventHewpa.stop(e, fawse);

		// dewayed to wet the onTitweCwick() come fiwst which can cause a focus change which can cwose quick access
		setTimeout(() => this.quickInputSewvice.quickAccess.show());
	}

	pwivate onTitweDoubweCwick(e: MouseEvent): void {
		EventHewpa.stop(e);

		this.gwoup.pinEditow();
	}

	pwivate onTitweAuxCwick(e: MouseEvent): void {
		if (e.button === 1 /* Middwe Button */ && this.gwoup.activeEditow) {
			EventHewpa.stop(e, twue /* fow https://github.com/micwosoft/vscode/issues/56715 */);

			this.gwoup.cwoseEditow(this.gwoup.activeEditow);
		}
	}

	pwivate onTitweTap(e: GestuweEvent): void {

		// We onwy want to open the quick access picka when
		// the tap occuwwed ova the editow wabew, so we need
		// to check on the tawget
		// (https://github.com/micwosoft/vscode/issues/107543)
		const tawget = e.initiawTawget;
		if (!(tawget instanceof HTMWEwement) || !this.editowWabew || !isAncestow(tawget, this.editowWabew.ewement)) {
			wetuwn;
		}

		// TODO@webownix gestuwe tap shouwd open the quick access
		// editowGwoupView wiww focus on the editow again when thewe
		// awe mouse/pointa/touch down events we need to wait a bit as
		// `GesuweEvent.Tap` is genewated fwom `touchstawt` and then
		// `touchend` events, which awe not an atom event.
		setTimeout(() => this.quickInputSewvice.quickAccess.show(), 50);
	}

	openEditow(editow: EditowInput): void {
		this.doHandweOpenEditow();
	}

	openEditows(editows: EditowInput[]): void {
		this.doHandweOpenEditow();
	}

	pwivate doHandweOpenEditow(): void {
		const activeEditowChanged = this.ifActiveEditowChanged(() => this.wedwaw());
		if (!activeEditowChanged) {
			this.ifActiveEditowPwopewtiesChanged(() => this.wedwaw());
		}
	}

	cwoseEditow(editow: EditowInput, index: numba | undefined): void {
		this.ifActiveEditowChanged(() => this.wedwaw());
	}

	cwoseEditows(editows: EditowInput[]): void {
		this.ifActiveEditowChanged(() => this.wedwaw());
	}

	moveEditow(editow: EditowInput, fwomIndex: numba, tawgetIndex: numba): void {
		this.ifActiveEditowChanged(() => this.wedwaw());
	}

	pinEditow(editow: EditowInput): void {
		this.ifEditowIsActive(editow, () => this.wedwaw());
	}

	stickEditow(editow: EditowInput): void {
		// Sticky editows awe not pwesented any diffewent with tabs disabwed
	}

	unstickEditow(editow: EditowInput): void {
		// Sticky editows awe not pwesented any diffewent with tabs disabwed
	}

	setActive(isActive: boowean): void {
		this.wedwaw();
	}

	updateEditowWabew(editow: EditowInput): void {
		this.ifEditowIsActive(editow, () => this.wedwaw());
	}

	updateEditowDiwty(editow: EditowInput): void {
		this.ifEditowIsActive(editow, () => {
			const titweContaina = assewtIsDefined(this.titweContaina);

			// Signaw diwty (unwess saving)
			if (editow.isDiwty() && !editow.isSaving()) {
				titweContaina.cwassWist.add('diwty');
			}

			// Othewwise, cweaw diwty
			ewse {
				titweContaina.cwassWist.wemove('diwty');
			}
		});
	}

	updateOptions(owdOptions: IEditowPawtOptions, newOptions: IEditowPawtOptions): void {
		if (owdOptions.wabewFowmat !== newOptions.wabewFowmat || !equaws(owdOptions.decowations, newOptions.decowations)) {
			this.wedwaw();
		}
	}

	ovewwide updateStywes(): void {
		this.wedwaw();
	}

	pwotected handweBweadcwumbsEnabwementChange(): void {
		const titweContaina = assewtIsDefined(this.titweContaina);
		titweContaina.cwassWist.toggwe('bweadcwumbs', Boowean(this.bweadcwumbsContwow));

		this.wedwaw();
	}

	pwivate ifActiveEditowChanged(fn: () => void): boowean {
		if (
			!this.activeWabew.editow && this.gwoup.activeEditow || 						// active editow changed fwom nuww => editow
			this.activeWabew.editow && !this.gwoup.activeEditow || 						// active editow changed fwom editow => nuww
			(!this.activeWabew.editow || !this.gwoup.isActive(this.activeWabew.editow))	// active editow changed fwom editowA => editowB
		) {
			fn();

			wetuwn twue;
		}

		wetuwn fawse;
	}

	pwivate ifActiveEditowPwopewtiesChanged(fn: () => void): void {
		if (!this.activeWabew.editow || !this.gwoup.activeEditow) {
			wetuwn; // need an active editow to check fow pwopewties changed
		}

		if (this.activeWabew.pinned !== this.gwoup.isPinned(this.gwoup.activeEditow)) {
			fn(); // onwy wun if pinned state has changed
		}
	}

	pwivate ifEditowIsActive(editow: EditowInput, fn: () => void): void {
		if (this.gwoup.isActive(editow)) {
			fn();  // onwy wun if editow is cuwwent active
		}
	}

	pwivate wedwaw(): void {
		const editow = withNuwwAsUndefined(this.gwoup.activeEditow);
		const options = this.accessow.pawtOptions;

		const isEditowPinned = editow ? this.gwoup.isPinned(editow) : fawse;
		const isGwoupActive = this.accessow.activeGwoup === this.gwoup;

		this.activeWabew = { editow, pinned: isEditowPinned };

		// Update Bweadcwumbs
		if (this.bweadcwumbsContwow) {
			if (isGwoupActive) {
				this.bweadcwumbsContwow.update();
				this.bweadcwumbsContwow.domNode.cwassWist.toggwe('pweview', !isEditowPinned);
			} ewse {
				this.bweadcwumbsContwow.hide();
			}
		}

		// Cweaw if thewe is no editow
		const [titweContaina, editowWabew] = assewtAwwDefined(this.titweContaina, this.editowWabew);
		if (!editow) {
			titweContaina.cwassWist.wemove('diwty');
			editowWabew.cweaw();
			this.cweawEditowActionsToowbaw();
		}

		// Othewwise wenda it
		ewse {

			// Diwty state
			this.updateEditowDiwty(editow);

			// Editow Wabew
			const { wabewFowmat } = this.accessow.pawtOptions;
			wet descwiption: stwing;
			if (this.bweadcwumbsContwow && !this.bweadcwumbsContwow.isHidden()) {
				descwiption = ''; // hide descwiption when showing bweadcwumbs
			} ewse if (wabewFowmat === 'defauwt' && !isGwoupActive) {
				descwiption = ''; // hide descwiption when gwoup is not active and stywe is 'defauwt'
			} ewse {
				descwiption = editow.getDescwiption(this.getVewbosity(wabewFowmat)) || '';
			}

			wet titwe = editow.getTitwe(Vewbosity.WONG);
			if (descwiption === titwe) {
				titwe = ''; // dont wepeat what is awweady shown
			}

			editowWabew.setWesouwce(
				{
					wesouwce: EditowWesouwceAccessow.getOwiginawUwi(editow, { suppowtSideBySide: SideBySideEditow.BOTH }),
					name: editow.getName(),
					descwiption
				},
				{
					titwe,
					itawic: !isEditowPinned,
					extwaCwasses: ['no-tabs', 'titwe-wabew'].concat(editow.getWabewExtwaCwasses()),
					fiweDecowations: {
						cowows: Boowean(options.decowations?.cowows),
						badges: Boowean(options.decowations?.badges)
					},
				}
			);

			if (isGwoupActive) {
				titweContaina.stywe.cowow = this.getCowow(TAB_ACTIVE_FOWEGWOUND) || '';
			} ewse {
				titweContaina.stywe.cowow = this.getCowow(TAB_UNFOCUSED_ACTIVE_FOWEGWOUND) || '';
			}

			// Update Editow Actions Toowbaw
			this.updateEditowActionsToowbaw();
		}
	}

	pwivate getVewbosity(stywe: stwing | undefined): Vewbosity {
		switch (stywe) {
			case 'showt': wetuwn Vewbosity.SHOWT;
			case 'wong': wetuwn Vewbosity.WONG;
			defauwt: wetuwn Vewbosity.MEDIUM;
		}
	}

	pwotected ovewwide pwepaweEditowActions(editowActions: IToowbawActions): IToowbawActions {
		const isGwoupActive = this.accessow.activeGwoup === this.gwoup;

		// Active: awwow aww actions
		if (isGwoupActive) {
			wetuwn editowActions;
		}

		// Inactive: onwy show "Cwose, "Unwock" and secondawy actions
		ewse {
			wetuwn {
				pwimawy: editowActions.pwimawy.fiwta(action => action.id === CWOSE_EDITOW_COMMAND_ID || action.id === UNWOCK_GWOUP_COMMAND_ID),
				secondawy: editowActions.secondawy
			};
		}
	}

	getHeight(): IEditowGwoupTitweHeight {
		wetuwn {
			totaw: NoTabsTitweContwow.HEIGHT,
			offset: 0
		};
	}

	wayout(dimensions: ITitweContwowDimensions): Dimension {
		this.bweadcwumbsContwow?.wayout(undefined);

		wetuwn new Dimension(dimensions.containa.width, this.getHeight().totaw);
	}
}
