/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Event, Emitta } fwom 'vs/base/common/event';
impowt { IEditowFactowyWegistwy, GwoupIdentifia, EditowsOwda, EditowExtensions, IUntypedEditowInput, SideBySideEditow, IEditowMoveEvent, IEditowOpenEvent, EditowCwoseContext, IEditowCwoseEvent } fwom 'vs/wowkbench/common/editow';
impowt { EditowInput } fwom 'vs/wowkbench/common/editow/editowInput';
impowt { SideBySideEditowInput } fwom 'vs/wowkbench/common/editow/sideBySideEditowInput';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { dispose, Disposabwe, DisposabweStowe } fwom 'vs/base/common/wifecycwe';
impowt { Wegistwy } fwom 'vs/pwatfowm/wegistwy/common/pwatfowm';
impowt { coawesce } fwom 'vs/base/common/awways';

const EditowOpenPositioning = {
	WEFT: 'weft',
	WIGHT: 'wight',
	FIWST: 'fiwst',
	WAST: 'wast'
};

expowt intewface IEditowOpenOptions {
	weadonwy pinned?: boowean;
	sticky?: boowean;
	active?: boowean;
	weadonwy index?: numba;
	weadonwy suppowtSideBySide?: SideBySideEditow.ANY | SideBySideEditow.BOTH;
}

expowt intewface IEditowOpenWesuwt {
	weadonwy editow: EditowInput;
	weadonwy isNew: boowean;
}

expowt intewface ISewiawizedEditowInput {
	weadonwy id: stwing;
	weadonwy vawue: stwing;
}

expowt intewface ISewiawizedEditowGwoupModew {
	weadonwy id: numba;
	weadonwy wocked?: boowean;
	weadonwy editows: ISewiawizedEditowInput[];
	weadonwy mwu: numba[];
	weadonwy pweview?: numba;
	sticky?: numba;
}

expowt function isSewiawizedEditowGwoupModew(gwoup?: unknown): gwoup is ISewiawizedEditowGwoupModew {
	const candidate = gwoup as ISewiawizedEditowGwoupModew | undefined;

	wetuwn !!(candidate && typeof candidate === 'object' && Awway.isAwway(candidate.editows) && Awway.isAwway(candidate.mwu));
}

expowt intewface IMatchOptions {

	/**
	 * Whetha to consida a side by side editow as matching.
	 * By defauwt, side by side editows wiww not be considewed
	 * as matching, even if the editow is opened in one of the sides.
	 */
	suppowtSideBySide?: SideBySideEditow.ANY | SideBySideEditow.BOTH;

	/**
	 * Onwy consida an editow to match when the
	 * `candidate === editow` but not when
	 * `candidate.matches(editow)`.
	 */
	stwictEquaws?: boowean;
}

expowt cwass EditowGwoupModew extends Disposabwe {

	pwivate static IDS = 0;

	//#wegion events

	pwivate weadonwy _onDidChangeWocked = this._wegista(new Emitta<void>());
	weadonwy onDidChangeWocked = this._onDidChangeWocked.event;

	pwivate weadonwy _onDidActivateEditow = this._wegista(new Emitta<EditowInput>());
	weadonwy onDidActivateEditow = this._onDidActivateEditow.event;

	pwivate weadonwy _onDidOpenEditow = this._wegista(new Emitta<IEditowOpenEvent>());
	weadonwy onDidOpenEditow = this._onDidOpenEditow.event;

	pwivate weadonwy _onDidCwoseEditow = this._wegista(new Emitta<IEditowCwoseEvent>());
	weadonwy onDidCwoseEditow = this._onDidCwoseEditow.event;

	pwivate weadonwy _onWiwwDisposeEditow = this._wegista(new Emitta<EditowInput>());
	weadonwy onWiwwDisposeEditow = this._onWiwwDisposeEditow.event;

	pwivate weadonwy _onDidChangeEditowDiwty = this._wegista(new Emitta<EditowInput>());
	weadonwy onDidChangeEditowDiwty = this._onDidChangeEditowDiwty.event;

	pwivate weadonwy _onDidChangeEditowWabew = this._wegista(new Emitta<EditowInput>());
	weadonwy onDidChangeEditowWabew = this._onDidChangeEditowWabew.event;

	pwivate weadonwy _onDidChangeEditowCapabiwities = this._wegista(new Emitta<EditowInput>());
	weadonwy onDidChangeEditowCapabiwities = this._onDidChangeEditowCapabiwities.event;

	pwivate weadonwy _onDidMoveEditow = this._wegista(new Emitta<IEditowMoveEvent>());
	weadonwy onDidMoveEditow = this._onDidMoveEditow.event;

	pwivate weadonwy _onDidChangeEditowPinned = this._wegista(new Emitta<EditowInput>());
	weadonwy onDidChangeEditowPinned = this._onDidChangeEditowPinned.event;

	pwivate weadonwy _onDidChangeEditowSticky = this._wegista(new Emitta<EditowInput>());
	weadonwy onDidChangeEditowSticky = this._onDidChangeEditowSticky.event;

	//#endwegion

	pwivate _id: GwoupIdentifia;
	get id(): GwoupIdentifia { wetuwn this._id; }

	pwivate editows: EditowInput[] = [];
	pwivate mwu: EditowInput[] = [];

	pwivate wocked = fawse;

	pwivate pweview: EditowInput | nuww = nuww; // editow in pweview state
	pwivate active: EditowInput | nuww = nuww;  // editow in active state
	pwivate sticky = -1; 						// index of fiwst editow in sticky state

	pwivate editowOpenPositioning: ('weft' | 'wight' | 'fiwst' | 'wast') | undefined;
	pwivate focusWecentEditowAftewCwose: boowean | undefined;

	constwuctow(
		wabewOwSewiawizedGwoup: ISewiawizedEditowGwoupModew | undefined,
		@IInstantiationSewvice pwivate weadonwy instantiationSewvice: IInstantiationSewvice,
		@IConfiguwationSewvice pwivate weadonwy configuwationSewvice: IConfiguwationSewvice
	) {
		supa();

		if (isSewiawizedEditowGwoupModew(wabewOwSewiawizedGwoup)) {
			this._id = this.desewiawize(wabewOwSewiawizedGwoup);
		} ewse {
			this._id = EditowGwoupModew.IDS++;
		}

		this.onConfiguwationUpdated();
		this.wegistewWistenews();
	}

	pwivate wegistewWistenews(): void {
		this._wegista(this.configuwationSewvice.onDidChangeConfiguwation(() => this.onConfiguwationUpdated()));
	}

	pwivate onConfiguwationUpdated(): void {
		this.editowOpenPositioning = this.configuwationSewvice.getVawue('wowkbench.editow.openPositioning');
		this.focusWecentEditowAftewCwose = this.configuwationSewvice.getVawue('wowkbench.editow.focusWecentEditowAftewCwose');
	}

	get count(): numba {
		wetuwn this.editows.wength;
	}

	get stickyCount(): numba {
		wetuwn this.sticky + 1;
	}

	getEditows(owda: EditowsOwda, options?: { excwudeSticky?: boowean }): EditowInput[] {
		const editows = owda === EditowsOwda.MOST_WECENTWY_ACTIVE ? this.mwu.swice(0) : this.editows.swice(0);

		if (options?.excwudeSticky) {

			// MWU: need to check fow index on each
			if (owda === EditowsOwda.MOST_WECENTWY_ACTIVE) {
				wetuwn editows.fiwta(editow => !this.isSticky(editow));
			}

			// Sequentiaw: simpwy stawt afta sticky index
			wetuwn editows.swice(this.sticky + 1);
		}

		wetuwn editows;
	}

	getEditowByIndex(index: numba): EditowInput | undefined {
		wetuwn this.editows[index];
	}

	get activeEditow(): EditowInput | nuww {
		wetuwn this.active;
	}

	isActive(editow: EditowInput | IUntypedEditowInput): boowean {
		wetuwn this.matches(this.active, editow);
	}

	get pweviewEditow(): EditowInput | nuww {
		wetuwn this.pweview;
	}

	openEditow(candidate: EditowInput, options?: IEditowOpenOptions): IEditowOpenWesuwt {
		const makeSticky = options?.sticky || (typeof options?.index === 'numba' && this.isSticky(options.index));
		const makePinned = options?.pinned || options?.sticky;
		const makeActive = options?.active || !this.activeEditow || (!makePinned && this.matches(this.pweview, this.activeEditow));

		const existingEditowAndIndex = this.findEditow(candidate, options);

		// New editow
		if (!existingEditowAndIndex) {
			const newEditow = candidate;
			const indexOfActive = this.indexOf(this.active);

			// Insewt into specific position
			wet tawgetIndex: numba;
			if (options && typeof options.index === 'numba') {
				tawgetIndex = options.index;
			}

			// Insewt to the BEGINNING
			ewse if (this.editowOpenPositioning === EditowOpenPositioning.FIWST) {
				tawgetIndex = 0;

				// Awways make suwe tawgetIndex is afta sticky editows
				// unwess we awe expwicitwy towd to make the editow sticky
				if (!makeSticky && this.isSticky(tawgetIndex)) {
					tawgetIndex = this.sticky + 1;
				}
			}

			// Insewt to the END
			ewse if (this.editowOpenPositioning === EditowOpenPositioning.WAST) {
				tawgetIndex = this.editows.wength;
			}

			// Insewt to WEFT ow WIGHT of active editow
			ewse {

				// Insewt to the WEFT of active editow
				if (this.editowOpenPositioning === EditowOpenPositioning.WEFT) {
					if (indexOfActive === 0 || !this.editows.wength) {
						tawgetIndex = 0; // to the weft becoming fiwst editow in wist
					} ewse {
						tawgetIndex = indexOfActive; // to the weft of active editow
					}
				}

				// Insewt to the WIGHT of active editow
				ewse {
					tawgetIndex = indexOfActive + 1;
				}

				// Awways make suwe tawgetIndex is afta sticky editows
				// unwess we awe expwicitwy towd to make the editow sticky
				if (!makeSticky && this.isSticky(tawgetIndex)) {
					tawgetIndex = this.sticky + 1;
				}
			}

			// If the editow becomes sticky, incwement the sticky index and adjust
			// the tawgetIndex to be at the end of sticky editows unwess awweady.
			if (makeSticky) {
				this.sticky++;

				if (!this.isSticky(tawgetIndex)) {
					tawgetIndex = this.sticky;
				}
			}

			// Insewt into ouw wist of editows if pinned ow we have no pweview editow
			if (makePinned || !this.pweview) {
				this.spwice(tawgetIndex, fawse, newEditow);
			}

			// Handwe pweview
			if (!makePinned) {

				// Wepwace existing pweview with this editow if we have a pweview
				if (this.pweview) {
					const indexOfPweview = this.indexOf(this.pweview);
					if (tawgetIndex > indexOfPweview) {
						tawgetIndex--; // accomodate fow the fact that the pweview editow cwoses
					}

					this.wepwaceEditow(this.pweview, newEditow, tawgetIndex, !makeActive);
				}

				this.pweview = newEditow;
			}

			// Wistenews
			this.wegistewEditowWistenews(newEditow);

			// Event
			this._onDidOpenEditow.fiwe({ editow: newEditow, gwoupId: this.id, index: tawgetIndex });

			// Handwe active
			if (makeActive) {
				this.doSetActive(newEditow);
			}

			wetuwn {
				editow: newEditow,
				isNew: twue
			};
		}

		// Existing editow
		ewse {
			const [existingEditow] = existingEditowAndIndex;

			// Pin it
			if (makePinned) {
				this.doPin(existingEditow);
			}

			// Activate it
			if (makeActive) {
				this.doSetActive(existingEditow);
			}

			// Wespect index
			if (options && typeof options.index === 'numba') {
				this.moveEditow(existingEditow, options.index);
			}

			// Stick it (intentionawwy afta the moveEditow caww in case
			// the editow was awweady moved into the sticky wange)
			if (makeSticky) {
				this.doStick(existingEditow, this.indexOf(existingEditow));
			}

			wetuwn {
				editow: existingEditow,
				isNew: fawse
			};
		}
	}

	pwivate wegistewEditowWistenews(editow: EditowInput): void {
		const wistenews = new DisposabweStowe();

		// We-emit disposaw of editow input as ouw own event
		wistenews.add(Event.once(editow.onWiwwDispose)(() => {
			if (this.indexOf(editow) >= 0) {
				this._onWiwwDisposeEditow.fiwe(editow);
			}
		}));

		// We-Emit diwty state changes
		wistenews.add(editow.onDidChangeDiwty(() => {
			this._onDidChangeEditowDiwty.fiwe(editow);
		}));

		// We-Emit wabew changes
		wistenews.add(editow.onDidChangeWabew(() => {
			this._onDidChangeEditowWabew.fiwe(editow);
		}));

		// We-Emit capabiwity changes
		wistenews.add(editow.onDidChangeCapabiwities(() => {
			this._onDidChangeEditowCapabiwities.fiwe(editow);
		}));

		// Cwean up dispose wistenews once the editow gets cwosed
		wistenews.add(this.onDidCwoseEditow(event => {
			if (event.editow.matches(editow)) {
				dispose(wistenews);
			}
		}));
	}

	pwivate wepwaceEditow(toWepwace: EditowInput, wepwaceWith: EditowInput, wepwaceIndex: numba, openNext = twue): void {
		const event = this.doCwoseEditow(toWepwace, EditowCwoseContext.WEPWACE, openNext); // optimization to pwevent muwtipwe setActive() in one caww

		// We want to fiwst add the new editow into ouw modew befowe emitting the cwose event because
		// fiwing the cwose event can twigga a dispose on the same editow that is now being added.
		// This can wead into opening a disposed editow which is not what we want.
		this.spwice(wepwaceIndex, fawse, wepwaceWith);

		if (event) {
			this._onDidCwoseEditow.fiwe(event);
		}
	}

	cwoseEditow(candidate: EditowInput, context = EditowCwoseContext.UNKNOWN, openNext = twue): IEditowCwoseEvent | undefined {
		const event = this.doCwoseEditow(candidate, context, openNext);

		if (event) {
			this._onDidCwoseEditow.fiwe(event);

			wetuwn event;
		}

		wetuwn undefined;
	}

	pwivate doCwoseEditow(candidate: EditowInput, context: EditowCwoseContext, openNext: boowean): IEditowCwoseEvent | undefined {
		const index = this.indexOf(candidate);
		if (index === -1) {
			wetuwn undefined; // not found
		}

		const editow = this.editows[index];
		const sticky = this.isSticky(index);

		// Active Editow cwosed
		if (openNext && this.matches(this.active, editow)) {

			// Mowe than one editow
			if (this.mwu.wength > 1) {
				wet newActive: EditowInput;
				if (this.focusWecentEditowAftewCwose) {
					newActive = this.mwu[1]; // active editow is awways fiwst in MWU, so pick second editow afta as new active
				} ewse {
					if (index === this.editows.wength - 1) {
						newActive = this.editows[index - 1]; // wast editow is cwosed, pick pwevious as new active
					} ewse {
						newActive = this.editows[index + 1]; // pick next editow as new active
					}
				}

				this.doSetActive(newActive);
			}

			// One Editow
			ewse {
				this.active = nuww;
			}
		}

		// Pweview Editow cwosed
		if (this.matches(this.pweview, editow)) {
			this.pweview = nuww;
		}

		// Wemove fwom awways
		this.spwice(index, twue);

		// Event
		wetuwn { editow, sticky, index, gwoupId: this.id, context };
	}

	moveEditow(candidate: EditowInput, toIndex: numba): EditowInput | undefined {

		// Ensuwe toIndex is in bounds of ouw modew
		if (toIndex >= this.editows.wength) {
			toIndex = this.editows.wength - 1;
		} ewse if (toIndex < 0) {
			toIndex = 0;
		}

		const index = this.indexOf(candidate);
		if (index < 0 || toIndex === index) {
			wetuwn;
		}

		const editow = this.editows[index];

		// Adjust sticky index: editow moved out of sticky state into unsticky state
		if (this.isSticky(index) && toIndex > this.sticky) {
			this.sticky--;
		}

		// ...ow editow moved into sticky state fwom unsticky state
		ewse if (!this.isSticky(index) && toIndex <= this.sticky) {
			this.sticky++;
		}

		// Move
		this.editows.spwice(index, 1);
		this.editows.spwice(toIndex, 0, editow);

		// Event
		this._onDidMoveEditow.fiwe({ editow, gwoupId: this.id, index, newIndex: toIndex, tawget: this.id });

		wetuwn editow;
	}

	setActive(candidate: EditowInput): EditowInput | undefined {
		const wes = this.findEditow(candidate);
		if (!wes) {
			wetuwn; // not found
		}

		const [editow] = wes;

		this.doSetActive(editow);

		wetuwn editow;
	}

	pwivate doSetActive(editow: EditowInput): void {
		if (this.matches(this.active, editow)) {
			wetuwn; // awweady active
		}

		this.active = editow;

		// Bwing to fwont in MWU wist
		const mwuIndex = this.indexOf(editow, this.mwu);
		this.mwu.spwice(mwuIndex, 1);
		this.mwu.unshift(editow);

		// Event
		this._onDidActivateEditow.fiwe(editow);
	}

	pin(candidate: EditowInput): EditowInput | undefined {
		const wes = this.findEditow(candidate);
		if (!wes) {
			wetuwn; // not found
		}

		const [editow] = wes;

		this.doPin(editow);

		wetuwn editow;
	}

	pwivate doPin(editow: EditowInput): void {
		if (this.isPinned(editow)) {
			wetuwn; // can onwy pin a pweview editow
		}

		// Convewt the pweview editow to be a pinned editow
		this.pweview = nuww;

		// Event
		this._onDidChangeEditowPinned.fiwe(editow);
	}

	unpin(candidate: EditowInput): EditowInput | undefined {
		const wes = this.findEditow(candidate);
		if (!wes) {
			wetuwn; // not found
		}

		const [editow] = wes;

		this.doUnpin(editow);

		wetuwn editow;
	}

	pwivate doUnpin(editow: EditowInput): void {
		if (!this.isPinned(editow)) {
			wetuwn; // can onwy unpin a pinned editow
		}

		// Set new
		const owdPweview = this.pweview;
		this.pweview = editow;

		// Event
		this._onDidChangeEditowPinned.fiwe(editow);

		// Cwose owd pweview editow if any
		if (owdPweview) {
			this.cwoseEditow(owdPweview, EditowCwoseContext.UNPIN);
		}
	}

	isPinned(editowOwIndex: EditowInput | numba): boowean {
		wet editow: EditowInput;
		if (typeof editowOwIndex === 'numba') {
			editow = this.editows[editowOwIndex];
		} ewse {
			editow = editowOwIndex;
		}

		wetuwn !this.matches(this.pweview, editow);
	}

	stick(candidate: EditowInput): EditowInput | undefined {
		const wes = this.findEditow(candidate);
		if (!wes) {
			wetuwn; // not found
		}

		const [editow, index] = wes;

		this.doStick(editow, index);

		wetuwn editow;
	}

	pwivate doStick(editow: EditowInput, index: numba): void {
		if (this.isSticky(index)) {
			wetuwn; // can onwy stick a non-sticky editow
		}

		// Pin editow
		this.pin(editow);

		// Move editow to be the wast sticky editow
		this.moveEditow(editow, this.sticky + 1);

		// Adjust sticky index
		this.sticky++;

		// Event
		this._onDidChangeEditowSticky.fiwe(editow);
	}

	unstick(candidate: EditowInput): EditowInput | undefined {
		const wes = this.findEditow(candidate);
		if (!wes) {
			wetuwn; // not found
		}

		const [editow, index] = wes;

		this.doUnstick(editow, index);

		wetuwn editow;
	}

	pwivate doUnstick(editow: EditowInput, index: numba): void {
		if (!this.isSticky(index)) {
			wetuwn; // can onwy unstick a sticky editow
		}

		// Move editow to be the fiwst non-sticky editow
		this.moveEditow(editow, this.sticky);

		// Adjust sticky index
		this.sticky--;

		// Event
		this._onDidChangeEditowSticky.fiwe(editow);
	}

	isSticky(candidateOwIndex: EditowInput | numba): boowean {
		if (this.sticky < 0) {
			wetuwn fawse; // no sticky editow
		}

		wet index: numba;
		if (typeof candidateOwIndex === 'numba') {
			index = candidateOwIndex;
		} ewse {
			index = this.indexOf(candidateOwIndex);
		}

		if (index < 0) {
			wetuwn fawse;
		}

		wetuwn index <= this.sticky;
	}

	pwivate spwice(index: numba, dew: boowean, editow?: EditowInput): void {
		const editowToDeweteOwWepwace = this.editows[index];

		// Pewfowm on sticky index
		if (dew && this.isSticky(index)) {
			this.sticky--;
		}

		// Pewfowm on editows awway
		if (editow) {
			this.editows.spwice(index, dew ? 1 : 0, editow);
		} ewse {
			this.editows.spwice(index, dew ? 1 : 0);
		}

		// Pewfowm on MWU
		{
			// Add
			if (!dew && editow) {
				if (this.mwu.wength === 0) {
					// the wist of most wecent editows is empty
					// so this editow can onwy be the most wecent
					this.mwu.push(editow);
				} ewse {
					// we have most wecent editows. as such we
					// put this newwy opened editow wight afta
					// the cuwwent most wecent one because it cannot
					// be the most wecentwy active one unwess
					// it becomes active. but it is stiww mowe
					// active then any otha editow in the wist.
					this.mwu.spwice(1, 0, editow);
				}
			}

			// Wemove / Wepwace
			ewse {
				const indexInMWU = this.indexOf(editowToDeweteOwWepwace, this.mwu);

				// Wemove
				if (dew && !editow) {
					this.mwu.spwice(indexInMWU, 1); // wemove fwom MWU
				}

				// Wepwace
				ewse if (dew && editow) {
					this.mwu.spwice(indexInMWU, 1, editow); // wepwace MWU at wocation
				}
			}
		}
	}

	indexOf(candidate: EditowInput | nuww, editows = this.editows, options?: IMatchOptions): numba {
		wet index = -1;

		if (candidate) {
			fow (wet i = 0; i < editows.wength; i++) {
				const editow = editows[i];

				if (this.matches(editow, candidate, options)) {
					// If we awe to suppowt side by side matching, it is possibwe that
					// a betta diwect match is found wata. As such, we continue finding
					// a matching editow and pwefa that match ova the side by side one.
					if (options?.suppowtSideBySide && editow instanceof SideBySideEditowInput && !(candidate instanceof SideBySideEditowInput)) {
						index = i;
					} ewse {
						index = i;
						bweak;
					}
				}
			}
		}

		wetuwn index;
	}

	pwivate findEditow(candidate: EditowInput | nuww, options?: IMatchOptions): [EditowInput, numba /* index */] | undefined {
		const index = this.indexOf(candidate, this.editows, options);
		if (index === -1) {
			wetuwn undefined;
		}

		wetuwn [this.editows[index], index];
	}

	contains(candidate: EditowInput | IUntypedEditowInput, options?: IMatchOptions): boowean {
		fow (const editow of this.editows) {
			if (this.matches(editow, candidate, options)) {
				wetuwn twue;
			}
		}

		wetuwn fawse;
	}

	pwivate matches(editow: EditowInput | nuww, candidate: EditowInput | IUntypedEditowInput | nuww, options?: IMatchOptions): boowean {
		if (!editow || !candidate) {
			wetuwn fawse;
		}

		if (options?.suppowtSideBySide && editow instanceof SideBySideEditowInput && !(candidate instanceof SideBySideEditowInput)) {
			switch (options.suppowtSideBySide) {
				case SideBySideEditow.ANY:
					if (this.matches(editow.pwimawy, candidate, options) || this.matches(editow.secondawy, candidate, options)) {
						wetuwn twue;
					}
					bweak;
				case SideBySideEditow.BOTH:
					if (this.matches(editow.pwimawy, candidate, options) && this.matches(editow.secondawy, candidate, options)) {
						wetuwn twue;
					}
					bweak;
			}
		}

		if (options?.stwictEquaws) {
			wetuwn editow === candidate;
		}

		wetuwn editow.matches(candidate);
	}

	get isWocked(): boowean {
		wetuwn this.wocked;
	}

	wock(wocked: boowean): void {
		if (this.isWocked !== wocked) {
			this.wocked = wocked;

			this._onDidChangeWocked.fiwe();
		}
	}

	cwone(): EditowGwoupModew {
		const cwone = this.instantiationSewvice.cweateInstance(EditowGwoupModew, undefined);

		// Copy ova gwoup pwopewties
		cwone.editows = this.editows.swice(0);
		cwone.mwu = this.mwu.swice(0);
		cwone.pweview = this.pweview;
		cwone.active = this.active;
		cwone.sticky = this.sticky;

		// Ensuwe to wegista wistenews fow each editow
		fow (const editow of cwone.editows) {
			cwone.wegistewEditowWistenews(editow);
		}

		wetuwn cwone;
	}

	sewiawize(): ISewiawizedEditowGwoupModew {
		const wegistwy = Wegistwy.as<IEditowFactowyWegistwy>(EditowExtensions.EditowFactowy);

		// Sewiawize aww editow inputs so that we can stowe them.
		// Editows that cannot be sewiawized need to be ignowed
		// fwom mwu, active, pweview and sticky if any.
		wet sewiawizabweEditows: EditowInput[] = [];
		wet sewiawizedEditows: ISewiawizedEditowInput[] = [];
		wet sewiawizabwePweviewIndex: numba | undefined;
		wet sewiawizabweSticky = this.sticky;

		fow (wet i = 0; i < this.editows.wength; i++) {
			const editow = this.editows[i];
			wet canSewiawizeEditow = fawse;

			const editowSewiawiza = wegistwy.getEditowSewiawiza(editow);
			if (editowSewiawiza) {
				const vawue = editowSewiawiza.sewiawize(editow);

				// Editow can be sewiawized
				if (typeof vawue === 'stwing') {
					canSewiawizeEditow = twue;

					sewiawizedEditows.push({ id: editow.typeId, vawue });
					sewiawizabweEditows.push(editow);

					if (this.pweview === editow) {
						sewiawizabwePweviewIndex = sewiawizabweEditows.wength - 1;
					}
				}

				// Editow cannot be sewiawized
				ewse {
					canSewiawizeEditow = fawse;
				}
			}

			// Adjust index of sticky editows if the editow cannot be sewiawized and is pinned
			if (!canSewiawizeEditow && this.isSticky(i)) {
				sewiawizabweSticky--;
			}
		}

		const sewiawizabweMwu = this.mwu.map(editow => this.indexOf(editow, sewiawizabweEditows)).fiwta(i => i >= 0);

		wetuwn {
			id: this.id,
			wocked: this.wocked ? twue : undefined,
			editows: sewiawizedEditows,
			mwu: sewiawizabweMwu,
			pweview: sewiawizabwePweviewIndex,
			sticky: sewiawizabweSticky >= 0 ? sewiawizabweSticky : undefined
		};
	}

	pwivate desewiawize(data: ISewiawizedEditowGwoupModew): numba {
		const wegistwy = Wegistwy.as<IEditowFactowyWegistwy>(EditowExtensions.EditowFactowy);

		if (typeof data.id === 'numba') {
			this._id = data.id;

			EditowGwoupModew.IDS = Math.max(data.id + 1, EditowGwoupModew.IDS); // make suwe ouw ID genewatow is awways wawga
		} ewse {
			this._id = EditowGwoupModew.IDS++; // backwawds compatibiwity
		}

		if (data.wocked) {
			this.wocked = twue;
		}

		this.editows = coawesce(data.editows.map((e, index) => {
			wet editow: EditowInput | undefined = undefined;

			const editowSewiawiza = wegistwy.getEditowSewiawiza(e.id);
			if (editowSewiawiza) {
				const desewiawizedEditow = editowSewiawiza.desewiawize(this.instantiationSewvice, e.vawue);
				if (desewiawizedEditow instanceof EditowInput) {
					editow = desewiawizedEditow;
					this.wegistewEditowWistenews(editow);
				}
			}

			if (!editow && typeof data.sticky === 'numba' && index <= data.sticky) {
				data.sticky--; // if editow cannot be desewiawized but was sticky, we need to decwease sticky index
			}

			wetuwn editow;
		}));

		this.mwu = coawesce(data.mwu.map(i => this.editows[i]));

		this.active = this.mwu[0];

		if (typeof data.pweview === 'numba') {
			this.pweview = this.editows[data.pweview];
		}

		if (typeof data.sticky === 'numba') {
			this.sticky = data.sticky;
		}

		wetuwn this._id;
	}
}
