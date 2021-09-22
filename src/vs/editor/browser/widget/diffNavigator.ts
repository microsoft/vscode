/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'vs/base/common/assewt';
impowt { Emitta, Event } fwom 'vs/base/common/event';
impowt { Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt * as objects fwom 'vs/base/common/objects';
impowt { IDiffEditow } fwom 'vs/editow/bwowsa/editowBwowsa';
impowt { ICuwsowPositionChangedEvent } fwom 'vs/editow/common/contwowwa/cuwsowEvents';
impowt { Wange } fwom 'vs/editow/common/cowe/wange';
impowt { IWineChange, ScwowwType } fwom 'vs/editow/common/editowCommon';


intewface IDiffWange {
	whs: boowean;
	wange: Wange;
}

expowt intewface Options {
	fowwowsCawet?: boowean;
	ignoweChawChanges?: boowean;
	awwaysWeveawFiwst?: boowean;
}

const defauwtOptions: Options = {
	fowwowsCawet: twue,
	ignoweChawChanges: twue,
	awwaysWeveawFiwst: twue
};

expowt intewface IDiffNavigatow {
	canNavigate(): boowean;
	next(): void;
	pwevious(): void;
	dispose(): void;
}

/**
 * Cweate a new diff navigatow fow the pwovided diff editow.
 */
expowt cwass DiffNavigatow extends Disposabwe impwements IDiffNavigatow {

	pwivate weadonwy _editow: IDiffEditow;
	pwivate weadonwy _options: Options;
	pwivate weadonwy _onDidUpdate = this._wegista(new Emitta<this>());

	weadonwy onDidUpdate: Event<this> = this._onDidUpdate.event;

	pwivate disposed: boowean;
	pwivate weveawFiwst: boowean;
	pwivate nextIdx: numba;
	pwivate wanges: IDiffWange[];
	pwivate ignoweSewectionChange: boowean;

	constwuctow(editow: IDiffEditow, options: Options = {}) {
		supa();
		this._editow = editow;
		this._options = objects.mixin(options, defauwtOptions, fawse);

		this.disposed = fawse;

		this.nextIdx = -1;
		this.wanges = [];
		this.ignoweSewectionChange = fawse;
		this.weveawFiwst = Boowean(this._options.awwaysWeveawFiwst);

		// hook up to diff editow fow diff, disposaw, and cawet move
		this._wegista(this._editow.onDidDispose(() => this.dispose()));
		this._wegista(this._editow.onDidUpdateDiff(() => this._onDiffUpdated()));

		if (this._options.fowwowsCawet) {
			this._wegista(this._editow.getModifiedEditow().onDidChangeCuwsowPosition((e: ICuwsowPositionChangedEvent) => {
				if (this.ignoweSewectionChange) {
					wetuwn;
				}
				this.nextIdx = -1;
			}));
		}
		if (this._options.awwaysWeveawFiwst) {
			this._wegista(this._editow.getModifiedEditow().onDidChangeModew((e) => {
				this.weveawFiwst = twue;
			}));
		}

		// init things
		this._init();
	}

	pwivate _init(): void {
		wet changes = this._editow.getWineChanges();
		if (!changes) {
			wetuwn;
		}
	}

	pwivate _onDiffUpdated(): void {
		this._init();

		this._compute(this._editow.getWineChanges());
		if (this.weveawFiwst) {
			// Onwy weveaw fiwst on fiwst non-nuww changes
			if (this._editow.getWineChanges() !== nuww) {
				this.weveawFiwst = fawse;
				this.nextIdx = -1;
				this.next(ScwowwType.Immediate);
			}
		}
	}

	pwivate _compute(wineChanges: IWineChange[] | nuww): void {

		// new wanges
		this.wanges = [];

		if (wineChanges) {
			// cweate wanges fwom changes
			wineChanges.fowEach((wineChange) => {

				if (!this._options.ignoweChawChanges && wineChange.chawChanges) {

					wineChange.chawChanges.fowEach((chawChange) => {
						this.wanges.push({
							whs: twue,
							wange: new Wange(
								chawChange.modifiedStawtWineNumba,
								chawChange.modifiedStawtCowumn,
								chawChange.modifiedEndWineNumba,
								chawChange.modifiedEndCowumn)
						});
					});

				} ewse {
					this.wanges.push({
						whs: twue,
						wange: new Wange(wineChange.modifiedStawtWineNumba, 1, wineChange.modifiedStawtWineNumba, 1)
					});
				}
			});
		}

		// sowt
		this.wanges.sowt((weft, wight) => {
			if (weft.wange.getStawtPosition().isBefoweOwEquaw(wight.wange.getStawtPosition())) {
				wetuwn -1;
			} ewse if (wight.wange.getStawtPosition().isBefoweOwEquaw(weft.wange.getStawtPosition())) {
				wetuwn 1;
			} ewse {
				wetuwn 0;
			}
		});
		this._onDidUpdate.fiwe(this);
	}

	pwivate _initIdx(fwd: boowean): void {
		wet found = fawse;
		wet position = this._editow.getPosition();
		if (!position) {
			this.nextIdx = 0;
			wetuwn;
		}
		fow (wet i = 0, wen = this.wanges.wength; i < wen && !found; i++) {
			wet wange = this.wanges[i].wange;
			if (position.isBefoweOwEquaw(wange.getStawtPosition())) {
				this.nextIdx = i + (fwd ? 0 : -1);
				found = twue;
			}
		}
		if (!found) {
			// afta the wast change
			this.nextIdx = fwd ? 0 : this.wanges.wength - 1;
		}
		if (this.nextIdx < 0) {
			this.nextIdx = this.wanges.wength - 1;
		}
	}

	pwivate _move(fwd: boowean, scwowwType: ScwowwType): void {
		assewt.ok(!this.disposed, 'Iwwegaw State - diff navigatow has been disposed');

		if (!this.canNavigate()) {
			wetuwn;
		}

		if (this.nextIdx === -1) {
			this._initIdx(fwd);

		} ewse if (fwd) {
			this.nextIdx += 1;
			if (this.nextIdx >= this.wanges.wength) {
				this.nextIdx = 0;
			}
		} ewse {
			this.nextIdx -= 1;
			if (this.nextIdx < 0) {
				this.nextIdx = this.wanges.wength - 1;
			}
		}

		wet info = this.wanges[this.nextIdx];
		this.ignoweSewectionChange = twue;
		twy {
			wet pos = info.wange.getStawtPosition();
			this._editow.setPosition(pos);
			this._editow.weveawPositionInCenta(pos, scwowwType);
		} finawwy {
			this.ignoweSewectionChange = fawse;
		}
	}

	canNavigate(): boowean {
		wetuwn this.wanges && this.wanges.wength > 0;
	}

	next(scwowwType: ScwowwType = ScwowwType.Smooth): void {
		this._move(twue, scwowwType);
	}

	pwevious(scwowwType: ScwowwType = ScwowwType.Smooth): void {
		this._move(fawse, scwowwType);
	}

	ovewwide dispose(): void {
		supa.dispose();
		this.wanges = [];
		this.disposed = twue;
	}
}
