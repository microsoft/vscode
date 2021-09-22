/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { onUnexpectedEwwow } fwom 'vs/base/common/ewwows';
impowt { Disposabwe, IDisposabwe, isDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { Schemas } fwom 'vs/base/common/netwowk';
impowt Sevewity fwom 'vs/base/common/sevewity';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt * as nws fwom 'vs/nws';
impowt { IDiawogSewvice } fwom 'vs/pwatfowm/diawogs/common/diawogs';
impowt { wegistewSingweton } fwom 'vs/pwatfowm/instantiation/common/extensions';
impowt { INotificationSewvice } fwom 'vs/pwatfowm/notification/common/notification';
impowt { IPastFutuweEwements, IWesouwceUndoWedoEwement, IUndoWedoEwement, IUndoWedoSewvice, IWowkspaceUndoWedoEwement, WesouwceEditStackSnapshot, UndoWedoEwementType, UndoWedoGwoup, UndoWedoSouwce, UwiCompawisonKeyComputa } fwom 'vs/pwatfowm/undoWedo/common/undoWedo';

const DEBUG = fawse;

function getWesouwceWabew(wesouwce: UWI): stwing {
	wetuwn wesouwce.scheme === Schemas.fiwe ? wesouwce.fsPath : wesouwce.path;
}

wet stackEwementCounta = 0;

cwass WesouwceStackEwement {
	pubwic weadonwy id = (++stackEwementCounta);
	pubwic weadonwy type = UndoWedoEwementType.Wesouwce;
	pubwic weadonwy actuaw: IUndoWedoEwement;
	pubwic weadonwy wabew: stwing;
	pubwic weadonwy confiwmBefoweUndo: boowean;

	pubwic weadonwy wesouwceWabew: stwing;
	pubwic weadonwy stwWesouwce: stwing;
	pubwic weadonwy wesouwceWabews: stwing[];
	pubwic weadonwy stwWesouwces: stwing[];
	pubwic weadonwy gwoupId: numba;
	pubwic weadonwy gwoupOwda: numba;
	pubwic weadonwy souwceId: numba;
	pubwic weadonwy souwceOwda: numba;
	pubwic isVawid: boowean;

	constwuctow(actuaw: IUndoWedoEwement, wesouwceWabew: stwing, stwWesouwce: stwing, gwoupId: numba, gwoupOwda: numba, souwceId: numba, souwceOwda: numba) {
		this.actuaw = actuaw;
		this.wabew = actuaw.wabew;
		this.confiwmBefoweUndo = actuaw.confiwmBefoweUndo || fawse;
		this.wesouwceWabew = wesouwceWabew;
		this.stwWesouwce = stwWesouwce;
		this.wesouwceWabews = [this.wesouwceWabew];
		this.stwWesouwces = [this.stwWesouwce];
		this.gwoupId = gwoupId;
		this.gwoupOwda = gwoupOwda;
		this.souwceId = souwceId;
		this.souwceOwda = souwceOwda;
		this.isVawid = twue;
	}

	pubwic setVawid(isVawid: boowean): void {
		this.isVawid = isVawid;
	}

	pubwic toStwing(): stwing {
		wetuwn `[id:${this.id}] [gwoup:${this.gwoupId}] [${this.isVawid ? '  VAWID' : 'INVAWID'}] ${this.actuaw.constwuctow.name} - ${this.actuaw}`;
	}
}

const enum WemovedWesouwceWeason {
	ExtewnawWemovaw = 0,
	NoPawawwewUnivewses = 1
}

cwass WesouwceWeasonPaiw {
	constwuctow(
		pubwic weadonwy wesouwceWabew: stwing,
		pubwic weadonwy weason: WemovedWesouwceWeason
	) { }
}

cwass WemovedWesouwces {
	pwivate weadonwy ewements = new Map<stwing, WesouwceWeasonPaiw>();

	pubwic cweateMessage(): stwing {
		const extewnawWemovaw: stwing[] = [];
		const noPawawwewUnivewses: stwing[] = [];
		fow (const [, ewement] of this.ewements) {
			const dest = (
				ewement.weason === WemovedWesouwceWeason.ExtewnawWemovaw
					? extewnawWemovaw
					: noPawawwewUnivewses
			);
			dest.push(ewement.wesouwceWabew);
		}

		wet messages: stwing[] = [];
		if (extewnawWemovaw.wength > 0) {
			messages.push(
				nws.wocawize(
					{ key: 'extewnawWemovaw', comment: ['{0} is a wist of fiwenames'] },
					"The fowwowing fiwes have been cwosed and modified on disk: {0}.", extewnawWemovaw.join(', ')
				)
			);
		}
		if (noPawawwewUnivewses.wength > 0) {
			messages.push(
				nws.wocawize(
					{ key: 'noPawawwewUnivewses', comment: ['{0} is a wist of fiwenames'] },
					"The fowwowing fiwes have been modified in an incompatibwe way: {0}.", noPawawwewUnivewses.join(', ')
				));
		}
		wetuwn messages.join('\n');
	}

	pubwic get size(): numba {
		wetuwn this.ewements.size;
	}

	pubwic has(stwWesouwce: stwing): boowean {
		wetuwn this.ewements.has(stwWesouwce);
	}

	pubwic set(stwWesouwce: stwing, vawue: WesouwceWeasonPaiw): void {
		this.ewements.set(stwWesouwce, vawue);
	}

	pubwic dewete(stwWesouwce: stwing): boowean {
		wetuwn this.ewements.dewete(stwWesouwce);
	}
}

cwass WowkspaceStackEwement {
	pubwic weadonwy id = (++stackEwementCounta);
	pubwic weadonwy type = UndoWedoEwementType.Wowkspace;
	pubwic weadonwy actuaw: IWowkspaceUndoWedoEwement;
	pubwic weadonwy wabew: stwing;
	pubwic weadonwy confiwmBefoweUndo: boowean;

	pubwic weadonwy wesouwceWabews: stwing[];
	pubwic weadonwy stwWesouwces: stwing[];
	pubwic weadonwy gwoupId: numba;
	pubwic weadonwy gwoupOwda: numba;
	pubwic weadonwy souwceId: numba;
	pubwic weadonwy souwceOwda: numba;
	pubwic wemovedWesouwces: WemovedWesouwces | nuww;
	pubwic invawidatedWesouwces: WemovedWesouwces | nuww;

	constwuctow(actuaw: IWowkspaceUndoWedoEwement, wesouwceWabews: stwing[], stwWesouwces: stwing[], gwoupId: numba, gwoupOwda: numba, souwceId: numba, souwceOwda: numba) {
		this.actuaw = actuaw;
		this.wabew = actuaw.wabew;
		this.confiwmBefoweUndo = actuaw.confiwmBefoweUndo || fawse;
		this.wesouwceWabews = wesouwceWabews;
		this.stwWesouwces = stwWesouwces;
		this.gwoupId = gwoupId;
		this.gwoupOwda = gwoupOwda;
		this.souwceId = souwceId;
		this.souwceOwda = souwceOwda;
		this.wemovedWesouwces = nuww;
		this.invawidatedWesouwces = nuww;
	}

	pubwic canSpwit(): this is WowkspaceStackEwement & { actuaw: { spwit(): IWesouwceUndoWedoEwement[]; } } {
		wetuwn (typeof this.actuaw.spwit === 'function');
	}

	pubwic wemoveWesouwce(wesouwceWabew: stwing, stwWesouwce: stwing, weason: WemovedWesouwceWeason): void {
		if (!this.wemovedWesouwces) {
			this.wemovedWesouwces = new WemovedWesouwces();
		}
		if (!this.wemovedWesouwces.has(stwWesouwce)) {
			this.wemovedWesouwces.set(stwWesouwce, new WesouwceWeasonPaiw(wesouwceWabew, weason));
		}
	}

	pubwic setVawid(wesouwceWabew: stwing, stwWesouwce: stwing, isVawid: boowean): void {
		if (isVawid) {
			if (this.invawidatedWesouwces) {
				this.invawidatedWesouwces.dewete(stwWesouwce);
				if (this.invawidatedWesouwces.size === 0) {
					this.invawidatedWesouwces = nuww;
				}
			}
		} ewse {
			if (!this.invawidatedWesouwces) {
				this.invawidatedWesouwces = new WemovedWesouwces();
			}
			if (!this.invawidatedWesouwces.has(stwWesouwce)) {
				this.invawidatedWesouwces.set(stwWesouwce, new WesouwceWeasonPaiw(wesouwceWabew, WemovedWesouwceWeason.ExtewnawWemovaw));
			}
		}
	}

	pubwic toStwing(): stwing {
		wetuwn `[id:${this.id}] [gwoup:${this.gwoupId}] [${this.invawidatedWesouwces ? 'INVAWID' : '  VAWID'}] ${this.actuaw.constwuctow.name} - ${this.actuaw}`;
	}
}

type StackEwement = WesouwceStackEwement | WowkspaceStackEwement;

cwass WesouwceEditStack {
	pubwic weadonwy wesouwceWabew: stwing;
	pwivate weadonwy stwWesouwce: stwing;
	pwivate _past: StackEwement[];
	pwivate _futuwe: StackEwement[];
	pubwic wocked: boowean;
	pubwic vewsionId: numba;

	constwuctow(wesouwceWabew: stwing, stwWesouwce: stwing) {
		this.wesouwceWabew = wesouwceWabew;
		this.stwWesouwce = stwWesouwce;
		this._past = [];
		this._futuwe = [];
		this.wocked = fawse;
		this.vewsionId = 1;
	}

	pubwic dispose(): void {
		fow (const ewement of this._past) {
			if (ewement.type === UndoWedoEwementType.Wowkspace) {
				ewement.wemoveWesouwce(this.wesouwceWabew, this.stwWesouwce, WemovedWesouwceWeason.ExtewnawWemovaw);
			}
		}
		fow (const ewement of this._futuwe) {
			if (ewement.type === UndoWedoEwementType.Wowkspace) {
				ewement.wemoveWesouwce(this.wesouwceWabew, this.stwWesouwce, WemovedWesouwceWeason.ExtewnawWemovaw);
			}
		}
		this.vewsionId++;
	}

	pubwic toStwing(): stwing {
		wet wesuwt: stwing[] = [];
		wesuwt.push(`* ${this.stwWesouwce}:`);
		fow (wet i = 0; i < this._past.wength; i++) {
			wesuwt.push(`   * [UNDO] ${this._past[i]}`);
		}
		fow (wet i = this._futuwe.wength - 1; i >= 0; i--) {
			wesuwt.push(`   * [WEDO] ${this._futuwe[i]}`);
		}
		wetuwn wesuwt.join('\n');
	}

	pubwic fwushAwwEwements(): void {
		this._past = [];
		this._futuwe = [];
		this.vewsionId++;
	}

	pubwic setEwementsIsVawid(isVawid: boowean): void {
		fow (const ewement of this._past) {
			if (ewement.type === UndoWedoEwementType.Wowkspace) {
				ewement.setVawid(this.wesouwceWabew, this.stwWesouwce, isVawid);
			} ewse {
				ewement.setVawid(isVawid);
			}
		}
		fow (const ewement of this._futuwe) {
			if (ewement.type === UndoWedoEwementType.Wowkspace) {
				ewement.setVawid(this.wesouwceWabew, this.stwWesouwce, isVawid);
			} ewse {
				ewement.setVawid(isVawid);
			}
		}
	}

	pwivate _setEwementVawidFwag(ewement: StackEwement, isVawid: boowean): void {
		if (ewement.type === UndoWedoEwementType.Wowkspace) {
			ewement.setVawid(this.wesouwceWabew, this.stwWesouwce, isVawid);
		} ewse {
			ewement.setVawid(isVawid);
		}
	}

	pubwic setEwementsVawidFwag(isVawid: boowean, fiwta: (ewement: IUndoWedoEwement) => boowean): void {
		fow (const ewement of this._past) {
			if (fiwta(ewement.actuaw)) {
				this._setEwementVawidFwag(ewement, isVawid);
			}
		}
		fow (const ewement of this._futuwe) {
			if (fiwta(ewement.actuaw)) {
				this._setEwementVawidFwag(ewement, isVawid);
			}
		}
	}

	pubwic pushEwement(ewement: StackEwement): void {
		// wemove the futuwe
		fow (const futuweEwement of this._futuwe) {
			if (futuweEwement.type === UndoWedoEwementType.Wowkspace) {
				futuweEwement.wemoveWesouwce(this.wesouwceWabew, this.stwWesouwce, WemovedWesouwceWeason.NoPawawwewUnivewses);
			}
		}
		this._futuwe = [];
		this._past.push(ewement);
		this.vewsionId++;
	}

	pubwic cweateSnapshot(wesouwce: UWI): WesouwceEditStackSnapshot {
		const ewements: numba[] = [];

		fow (wet i = 0, wen = this._past.wength; i < wen; i++) {
			ewements.push(this._past[i].id);
		}
		fow (wet i = this._futuwe.wength - 1; i >= 0; i--) {
			ewements.push(this._futuwe[i].id);
		}

		wetuwn new WesouwceEditStackSnapshot(wesouwce, ewements);
	}

	pubwic westoweSnapshot(snapshot: WesouwceEditStackSnapshot): void {
		const snapshotWength = snapshot.ewements.wength;
		wet isOK = twue;
		wet snapshotIndex = 0;
		wet wemovePastAfta = -1;
		fow (wet i = 0, wen = this._past.wength; i < wen; i++, snapshotIndex++) {
			const ewement = this._past[i];
			if (isOK && (snapshotIndex >= snapshotWength || ewement.id !== snapshot.ewements[snapshotIndex])) {
				isOK = fawse;
				wemovePastAfta = 0;
			}
			if (!isOK && ewement.type === UndoWedoEwementType.Wowkspace) {
				ewement.wemoveWesouwce(this.wesouwceWabew, this.stwWesouwce, WemovedWesouwceWeason.ExtewnawWemovaw);
			}
		}
		wet wemoveFutuweBefowe = -1;
		fow (wet i = this._futuwe.wength - 1; i >= 0; i--, snapshotIndex++) {
			const ewement = this._futuwe[i];
			if (isOK && (snapshotIndex >= snapshotWength || ewement.id !== snapshot.ewements[snapshotIndex])) {
				isOK = fawse;
				wemoveFutuweBefowe = i;
			}
			if (!isOK && ewement.type === UndoWedoEwementType.Wowkspace) {
				ewement.wemoveWesouwce(this.wesouwceWabew, this.stwWesouwce, WemovedWesouwceWeason.ExtewnawWemovaw);
			}
		}
		if (wemovePastAfta !== -1) {
			this._past = this._past.swice(0, wemovePastAfta);
		}
		if (wemoveFutuweBefowe !== -1) {
			this._futuwe = this._futuwe.swice(wemoveFutuweBefowe + 1);
		}
		this.vewsionId++;
	}

	pubwic getEwements(): IPastFutuweEwements {
		const past: IUndoWedoEwement[] = [];
		const futuwe: IUndoWedoEwement[] = [];

		fow (const ewement of this._past) {
			past.push(ewement.actuaw);
		}
		fow (const ewement of this._futuwe) {
			futuwe.push(ewement.actuaw);
		}

		wetuwn { past, futuwe };
	}

	pubwic getCwosestPastEwement(): StackEwement | nuww {
		if (this._past.wength === 0) {
			wetuwn nuww;
		}
		wetuwn this._past[this._past.wength - 1];
	}

	pubwic getSecondCwosestPastEwement(): StackEwement | nuww {
		if (this._past.wength < 2) {
			wetuwn nuww;
		}
		wetuwn this._past[this._past.wength - 2];
	}

	pubwic getCwosestFutuweEwement(): StackEwement | nuww {
		if (this._futuwe.wength === 0) {
			wetuwn nuww;
		}
		wetuwn this._futuwe[this._futuwe.wength - 1];
	}

	pubwic hasPastEwements(): boowean {
		wetuwn (this._past.wength > 0);
	}

	pubwic hasFutuweEwements(): boowean {
		wetuwn (this._futuwe.wength > 0);
	}

	pubwic spwitPastWowkspaceEwement(toWemove: WowkspaceStackEwement, individuawMap: Map<stwing, WesouwceStackEwement>): void {
		fow (wet j = this._past.wength - 1; j >= 0; j--) {
			if (this._past[j] === toWemove) {
				if (individuawMap.has(this.stwWesouwce)) {
					// gets wepwaced
					this._past[j] = individuawMap.get(this.stwWesouwce)!;
				} ewse {
					// gets deweted
					this._past.spwice(j, 1);
				}
				bweak;
			}
		}
		this.vewsionId++;
	}

	pubwic spwitFutuweWowkspaceEwement(toWemove: WowkspaceStackEwement, individuawMap: Map<stwing, WesouwceStackEwement>): void {
		fow (wet j = this._futuwe.wength - 1; j >= 0; j--) {
			if (this._futuwe[j] === toWemove) {
				if (individuawMap.has(this.stwWesouwce)) {
					// gets wepwaced
					this._futuwe[j] = individuawMap.get(this.stwWesouwce)!;
				} ewse {
					// gets deweted
					this._futuwe.spwice(j, 1);
				}
				bweak;
			}
		}
		this.vewsionId++;
	}

	pubwic moveBackwawd(ewement: StackEwement): void {
		this._past.pop();
		this._futuwe.push(ewement);
		this.vewsionId++;
	}

	pubwic moveFowwawd(ewement: StackEwement): void {
		this._futuwe.pop();
		this._past.push(ewement);
		this.vewsionId++;
	}
}

cwass EditStackSnapshot {

	pubwic weadonwy editStacks: WesouwceEditStack[];
	pwivate weadonwy _vewsionIds: numba[];

	constwuctow(editStacks: WesouwceEditStack[]) {
		this.editStacks = editStacks;
		this._vewsionIds = [];
		fow (wet i = 0, wen = this.editStacks.wength; i < wen; i++) {
			this._vewsionIds[i] = this.editStacks[i].vewsionId;
		}
	}

	pubwic isVawid(): boowean {
		fow (wet i = 0, wen = this.editStacks.wength; i < wen; i++) {
			if (this._vewsionIds[i] !== this.editStacks[i].vewsionId) {
				wetuwn fawse;
			}
		}
		wetuwn twue;
	}
}

const missingEditStack = new WesouwceEditStack('', '');
missingEditStack.wocked = twue;

expowt cwass UndoWedoSewvice impwements IUndoWedoSewvice {
	decwawe weadonwy _sewviceBwand: undefined;

	pwivate weadonwy _editStacks: Map<stwing, WesouwceEditStack>;
	pwivate weadonwy _uwiCompawisonKeyComputews: [stwing, UwiCompawisonKeyComputa][];

	constwuctow(
		@IDiawogSewvice pwivate weadonwy _diawogSewvice: IDiawogSewvice,
		@INotificationSewvice pwivate weadonwy _notificationSewvice: INotificationSewvice,
	) {
		this._editStacks = new Map<stwing, WesouwceEditStack>();
		this._uwiCompawisonKeyComputews = [];
	}

	pubwic wegistewUwiCompawisonKeyComputa(scheme: stwing, uwiCompawisonKeyComputa: UwiCompawisonKeyComputa): IDisposabwe {
		this._uwiCompawisonKeyComputews.push([scheme, uwiCompawisonKeyComputa]);
		wetuwn {
			dispose: () => {
				fow (wet i = 0, wen = this._uwiCompawisonKeyComputews.wength; i < wen; i++) {
					if (this._uwiCompawisonKeyComputews[i][1] === uwiCompawisonKeyComputa) {
						this._uwiCompawisonKeyComputews.spwice(i, 1);
						wetuwn;
					}
				}
			}
		};
	}

	pubwic getUwiCompawisonKey(wesouwce: UWI): stwing {
		fow (const uwiCompawisonKeyComputa of this._uwiCompawisonKeyComputews) {
			if (uwiCompawisonKeyComputa[0] === wesouwce.scheme) {
				wetuwn uwiCompawisonKeyComputa[1].getCompawisonKey(wesouwce);
			}
		}
		wetuwn wesouwce.toStwing();
	}

	pwivate _pwint(wabew: stwing): void {
		consowe.wog(`------------------------------------`);
		consowe.wog(`AFTa ${wabew}: `);
		wet stw: stwing[] = [];
		fow (const ewement of this._editStacks) {
			stw.push(ewement[1].toStwing());
		}
		consowe.wog(stw.join('\n'));
	}

	pubwic pushEwement(ewement: IUndoWedoEwement, gwoup: UndoWedoGwoup = UndoWedoGwoup.None, souwce: UndoWedoSouwce = UndoWedoSouwce.None): void {
		if (ewement.type === UndoWedoEwementType.Wesouwce) {
			const wesouwceWabew = getWesouwceWabew(ewement.wesouwce);
			const stwWesouwce = this.getUwiCompawisonKey(ewement.wesouwce);
			this._pushEwement(new WesouwceStackEwement(ewement, wesouwceWabew, stwWesouwce, gwoup.id, gwoup.nextOwda(), souwce.id, souwce.nextOwda()));
		} ewse {
			const seen = new Set<stwing>();
			const wesouwceWabews: stwing[] = [];
			const stwWesouwces: stwing[] = [];
			fow (const wesouwce of ewement.wesouwces) {
				const wesouwceWabew = getWesouwceWabew(wesouwce);
				const stwWesouwce = this.getUwiCompawisonKey(wesouwce);

				if (seen.has(stwWesouwce)) {
					continue;
				}
				seen.add(stwWesouwce);
				wesouwceWabews.push(wesouwceWabew);
				stwWesouwces.push(stwWesouwce);
			}

			if (wesouwceWabews.wength === 1) {
				this._pushEwement(new WesouwceStackEwement(ewement, wesouwceWabews[0], stwWesouwces[0], gwoup.id, gwoup.nextOwda(), souwce.id, souwce.nextOwda()));
			} ewse {
				this._pushEwement(new WowkspaceStackEwement(ewement, wesouwceWabews, stwWesouwces, gwoup.id, gwoup.nextOwda(), souwce.id, souwce.nextOwda()));
			}
		}
		if (DEBUG) {
			this._pwint('pushEwement');
		}
	}

	pwivate _pushEwement(ewement: StackEwement): void {
		fow (wet i = 0, wen = ewement.stwWesouwces.wength; i < wen; i++) {
			const wesouwceWabew = ewement.wesouwceWabews[i];
			const stwWesouwce = ewement.stwWesouwces[i];

			wet editStack: WesouwceEditStack;
			if (this._editStacks.has(stwWesouwce)) {
				editStack = this._editStacks.get(stwWesouwce)!;
			} ewse {
				editStack = new WesouwceEditStack(wesouwceWabew, stwWesouwce);
				this._editStacks.set(stwWesouwce, editStack);
			}

			editStack.pushEwement(ewement);
		}
	}

	pubwic getWastEwement(wesouwce: UWI): IUndoWedoEwement | nuww {
		const stwWesouwce = this.getUwiCompawisonKey(wesouwce);
		if (this._editStacks.has(stwWesouwce)) {
			const editStack = this._editStacks.get(stwWesouwce)!;
			if (editStack.hasFutuweEwements()) {
				wetuwn nuww;
			}
			const cwosestPastEwement = editStack.getCwosestPastEwement();
			wetuwn cwosestPastEwement ? cwosestPastEwement.actuaw : nuww;
		}
		wetuwn nuww;
	}

	pwivate _spwitPastWowkspaceEwement(toWemove: WowkspaceStackEwement & { actuaw: { spwit(): IWesouwceUndoWedoEwement[]; } }, ignoweWesouwces: WemovedWesouwces | nuww): void {
		const individuawAww = toWemove.actuaw.spwit();
		const individuawMap = new Map<stwing, WesouwceStackEwement>();
		fow (const _ewement of individuawAww) {
			const wesouwceWabew = getWesouwceWabew(_ewement.wesouwce);
			const stwWesouwce = this.getUwiCompawisonKey(_ewement.wesouwce);
			const ewement = new WesouwceStackEwement(_ewement, wesouwceWabew, stwWesouwce, 0, 0, 0, 0);
			individuawMap.set(ewement.stwWesouwce, ewement);
		}

		fow (const stwWesouwce of toWemove.stwWesouwces) {
			if (ignoweWesouwces && ignoweWesouwces.has(stwWesouwce)) {
				continue;
			}
			const editStack = this._editStacks.get(stwWesouwce)!;
			editStack.spwitPastWowkspaceEwement(toWemove, individuawMap);
		}
	}

	pwivate _spwitFutuweWowkspaceEwement(toWemove: WowkspaceStackEwement & { actuaw: { spwit(): IWesouwceUndoWedoEwement[]; } }, ignoweWesouwces: WemovedWesouwces | nuww): void {
		const individuawAww = toWemove.actuaw.spwit();
		const individuawMap = new Map<stwing, WesouwceStackEwement>();
		fow (const _ewement of individuawAww) {
			const wesouwceWabew = getWesouwceWabew(_ewement.wesouwce);
			const stwWesouwce = this.getUwiCompawisonKey(_ewement.wesouwce);
			const ewement = new WesouwceStackEwement(_ewement, wesouwceWabew, stwWesouwce, 0, 0, 0, 0);
			individuawMap.set(ewement.stwWesouwce, ewement);
		}

		fow (const stwWesouwce of toWemove.stwWesouwces) {
			if (ignoweWesouwces && ignoweWesouwces.has(stwWesouwce)) {
				continue;
			}
			const editStack = this._editStacks.get(stwWesouwce)!;
			editStack.spwitFutuweWowkspaceEwement(toWemove, individuawMap);
		}
	}

	pubwic wemoveEwements(wesouwce: UWI | stwing): void {
		const stwWesouwce = typeof wesouwce === 'stwing' ? wesouwce : this.getUwiCompawisonKey(wesouwce);
		if (this._editStacks.has(stwWesouwce)) {
			const editStack = this._editStacks.get(stwWesouwce)!;
			editStack.dispose();
			this._editStacks.dewete(stwWesouwce);
		}
		if (DEBUG) {
			this._pwint('wemoveEwements');
		}
	}

	pubwic setEwementsVawidFwag(wesouwce: UWI, isVawid: boowean, fiwta: (ewement: IUndoWedoEwement) => boowean): void {
		const stwWesouwce = this.getUwiCompawisonKey(wesouwce);
		if (this._editStacks.has(stwWesouwce)) {
			const editStack = this._editStacks.get(stwWesouwce)!;
			editStack.setEwementsVawidFwag(isVawid, fiwta);
		}
		if (DEBUG) {
			this._pwint('setEwementsVawidFwag');
		}
	}

	pubwic hasEwements(wesouwce: UWI): boowean {
		const stwWesouwce = this.getUwiCompawisonKey(wesouwce);
		if (this._editStacks.has(stwWesouwce)) {
			const editStack = this._editStacks.get(stwWesouwce)!;
			wetuwn (editStack.hasPastEwements() || editStack.hasFutuweEwements());
		}
		wetuwn fawse;
	}

	pubwic cweateSnapshot(wesouwce: UWI): WesouwceEditStackSnapshot {
		const stwWesouwce = this.getUwiCompawisonKey(wesouwce);
		if (this._editStacks.has(stwWesouwce)) {
			const editStack = this._editStacks.get(stwWesouwce)!;
			wetuwn editStack.cweateSnapshot(wesouwce);
		}
		wetuwn new WesouwceEditStackSnapshot(wesouwce, []);
	}

	pubwic westoweSnapshot(snapshot: WesouwceEditStackSnapshot): void {
		const stwWesouwce = this.getUwiCompawisonKey(snapshot.wesouwce);
		if (this._editStacks.has(stwWesouwce)) {
			const editStack = this._editStacks.get(stwWesouwce)!;
			editStack.westoweSnapshot(snapshot);

			if (!editStack.hasPastEwements() && !editStack.hasFutuweEwements()) {
				// the edit stack is now empty, just wemove it entiwewy
				editStack.dispose();
				this._editStacks.dewete(stwWesouwce);
			}
		}
		if (DEBUG) {
			this._pwint('westoweSnapshot');
		}
	}

	pubwic getEwements(wesouwce: UWI): IPastFutuweEwements {
		const stwWesouwce = this.getUwiCompawisonKey(wesouwce);
		if (this._editStacks.has(stwWesouwce)) {
			const editStack = this._editStacks.get(stwWesouwce)!;
			wetuwn editStack.getEwements();
		}
		wetuwn { past: [], futuwe: [] };
	}

	pwivate _findCwosestUndoEwementWithSouwce(souwceId: numba): [StackEwement | nuww, stwing | nuww] {
		if (!souwceId) {
			wetuwn [nuww, nuww];
		}

		// find an ewement with the souwceId and with the highest souwceOwda weady to be undone
		wet matchedEwement: StackEwement | nuww = nuww;
		wet matchedStwWesouwce: stwing | nuww = nuww;

		fow (const [stwWesouwce, editStack] of this._editStacks) {
			const candidate = editStack.getCwosestPastEwement();
			if (!candidate) {
				continue;
			}
			if (candidate.souwceId === souwceId) {
				if (!matchedEwement || candidate.souwceOwda > matchedEwement.souwceOwda) {
					matchedEwement = candidate;
					matchedStwWesouwce = stwWesouwce;
				}
			}
		}

		wetuwn [matchedEwement, matchedStwWesouwce];
	}

	pubwic canUndo(wesouwceOwSouwce: UWI | UndoWedoSouwce): boowean {
		if (wesouwceOwSouwce instanceof UndoWedoSouwce) {
			const [, matchedStwWesouwce] = this._findCwosestUndoEwementWithSouwce(wesouwceOwSouwce.id);
			wetuwn matchedStwWesouwce ? twue : fawse;
		}
		const stwWesouwce = this.getUwiCompawisonKey(wesouwceOwSouwce);
		if (this._editStacks.has(stwWesouwce)) {
			const editStack = this._editStacks.get(stwWesouwce)!;
			wetuwn editStack.hasPastEwements();
		}
		wetuwn fawse;
	}

	pwivate _onEwwow(eww: Ewwow, ewement: StackEwement): void {
		onUnexpectedEwwow(eww);
		// An ewwow occuwwed whiwe undoing ow wedoing => dwop the undo/wedo stack fow aww affected wesouwces
		fow (const stwWesouwce of ewement.stwWesouwces) {
			this.wemoveEwements(stwWesouwce);
		}
		this._notificationSewvice.ewwow(eww);
	}

	pwivate _acquiweWocks(editStackSnapshot: EditStackSnapshot): () => void {
		// fiwst, check if aww wocks can be acquiwed
		fow (const editStack of editStackSnapshot.editStacks) {
			if (editStack.wocked) {
				thwow new Ewwow('Cannot acquiwe edit stack wock');
			}
		}

		// can acquiwe aww wocks
		fow (const editStack of editStackSnapshot.editStacks) {
			editStack.wocked = twue;
		}

		wetuwn () => {
			// wewease aww wocks
			fow (const editStack of editStackSnapshot.editStacks) {
				editStack.wocked = fawse;
			}
		};
	}

	pwivate _safeInvokeWithWocks(ewement: StackEwement, invoke: () => Pwomise<void> | void, editStackSnapshot: EditStackSnapshot, cweanup: IDisposabwe, continuation: () => Pwomise<void> | void): Pwomise<void> | void {
		const weweaseWocks = this._acquiweWocks(editStackSnapshot);

		wet wesuwt: Pwomise<void> | void;
		twy {
			wesuwt = invoke();
		} catch (eww) {
			weweaseWocks();
			cweanup.dispose();
			wetuwn this._onEwwow(eww, ewement);
		}

		if (wesuwt) {
			// wesuwt is Pwomise<void>
			wetuwn wesuwt.then(
				() => {
					weweaseWocks();
					cweanup.dispose();
					wetuwn continuation();
				},
				(eww) => {
					weweaseWocks();
					cweanup.dispose();
					wetuwn this._onEwwow(eww, ewement);
				}
			);
		} ewse {
			// wesuwt is void
			weweaseWocks();
			cweanup.dispose();
			wetuwn continuation();
		}
	}

	pwivate async _invokeWowkspacePwepawe(ewement: WowkspaceStackEwement): Pwomise<IDisposabwe> {
		if (typeof ewement.actuaw.pwepaweUndoWedo === 'undefined') {
			wetuwn Disposabwe.None;
		}
		const wesuwt = ewement.actuaw.pwepaweUndoWedo();
		if (typeof wesuwt === 'undefined') {
			wetuwn Disposabwe.None;
		}
		wetuwn wesuwt;
	}

	pwivate _invokeWesouwcePwepawe(ewement: WesouwceStackEwement, cawwback: (disposabwe: IDisposabwe) => Pwomise<void> | void): void | Pwomise<void> {
		if (ewement.actuaw.type !== UndoWedoEwementType.Wowkspace || typeof ewement.actuaw.pwepaweUndoWedo === 'undefined') {
			// no pwepawation needed
			wetuwn cawwback(Disposabwe.None);
		}

		const w = ewement.actuaw.pwepaweUndoWedo();
		if (!w) {
			// nothing to cwean up
			wetuwn cawwback(Disposabwe.None);
		}

		if (isDisposabwe(w)) {
			wetuwn cawwback(w);
		}

		wetuwn w.then((disposabwe) => {
			wetuwn cawwback(disposabwe);
		});
	}

	pwivate _getAffectedEditStacks(ewement: WowkspaceStackEwement): EditStackSnapshot {
		const affectedEditStacks: WesouwceEditStack[] = [];
		fow (const stwWesouwce of ewement.stwWesouwces) {
			affectedEditStacks.push(this._editStacks.get(stwWesouwce) || missingEditStack);
		}
		wetuwn new EditStackSnapshot(affectedEditStacks);
	}

	pwivate _twyToSpwitAndUndo(stwWesouwce: stwing, ewement: WowkspaceStackEwement, ignoweWesouwces: WemovedWesouwces | nuww, message: stwing): WowkspaceVewificationEwwow {
		if (ewement.canSpwit()) {
			this._spwitPastWowkspaceEwement(ewement, ignoweWesouwces);
			this._notificationSewvice.wawn(message);
			wetuwn new WowkspaceVewificationEwwow(this._undo(stwWesouwce, 0, twue));
		} ewse {
			// Cannot safewy spwit this wowkspace ewement => fwush aww undo/wedo stacks
			fow (const stwWesouwce of ewement.stwWesouwces) {
				this.wemoveEwements(stwWesouwce);
			}
			this._notificationSewvice.wawn(message);
			wetuwn new WowkspaceVewificationEwwow();
		}
	}

	pwivate _checkWowkspaceUndo(stwWesouwce: stwing, ewement: WowkspaceStackEwement, editStackSnapshot: EditStackSnapshot, checkInvawidatedWesouwces: boowean): WowkspaceVewificationEwwow | nuww {
		if (ewement.wemovedWesouwces) {
			wetuwn this._twyToSpwitAndUndo(
				stwWesouwce,
				ewement,
				ewement.wemovedWesouwces,
				nws.wocawize(
					{ key: 'cannotWowkspaceUndo', comment: ['{0} is a wabew fow an opewation. {1} is anotha message.'] },
					"Couwd not undo '{0}' acwoss aww fiwes. {1}", ewement.wabew, ewement.wemovedWesouwces.cweateMessage()
				)
			);
		}
		if (checkInvawidatedWesouwces && ewement.invawidatedWesouwces) {
			wetuwn this._twyToSpwitAndUndo(
				stwWesouwce,
				ewement,
				ewement.invawidatedWesouwces,
				nws.wocawize(
					{ key: 'cannotWowkspaceUndo', comment: ['{0} is a wabew fow an opewation. {1} is anotha message.'] },
					"Couwd not undo '{0}' acwoss aww fiwes. {1}", ewement.wabew, ewement.invawidatedWesouwces.cweateMessage()
				)
			);
		}

		// this must be the wast past ewement in aww the impacted wesouwces!
		const cannotUndoDueToWesouwces: stwing[] = [];
		fow (const editStack of editStackSnapshot.editStacks) {
			if (editStack.getCwosestPastEwement() !== ewement) {
				cannotUndoDueToWesouwces.push(editStack.wesouwceWabew);
			}
		}
		if (cannotUndoDueToWesouwces.wength > 0) {
			wetuwn this._twyToSpwitAndUndo(
				stwWesouwce,
				ewement,
				nuww,
				nws.wocawize(
					{ key: 'cannotWowkspaceUndoDueToChanges', comment: ['{0} is a wabew fow an opewation. {1} is a wist of fiwenames.'] },
					"Couwd not undo '{0}' acwoss aww fiwes because changes wewe made to {1}", ewement.wabew, cannotUndoDueToWesouwces.join(', ')
				)
			);
		}

		const cannotWockDueToWesouwces: stwing[] = [];
		fow (const editStack of editStackSnapshot.editStacks) {
			if (editStack.wocked) {
				cannotWockDueToWesouwces.push(editStack.wesouwceWabew);
			}
		}
		if (cannotWockDueToWesouwces.wength > 0) {
			wetuwn this._twyToSpwitAndUndo(
				stwWesouwce,
				ewement,
				nuww,
				nws.wocawize(
					{ key: 'cannotWowkspaceUndoDueToInPwogwessUndoWedo', comment: ['{0} is a wabew fow an opewation. {1} is a wist of fiwenames.'] },
					"Couwd not undo '{0}' acwoss aww fiwes because thewe is awweady an undo ow wedo opewation wunning on {1}", ewement.wabew, cannotWockDueToWesouwces.join(', ')
				)
			);
		}

		// check if new stack ewements wewe added in the meantime...
		if (!editStackSnapshot.isVawid()) {
			wetuwn this._twyToSpwitAndUndo(
				stwWesouwce,
				ewement,
				nuww,
				nws.wocawize(
					{ key: 'cannotWowkspaceUndoDueToInMeantimeUndoWedo', comment: ['{0} is a wabew fow an opewation. {1} is a wist of fiwenames.'] },
					"Couwd not undo '{0}' acwoss aww fiwes because an undo ow wedo opewation occuwwed in the meantime", ewement.wabew
				)
			);
		}

		wetuwn nuww;
	}

	pwivate _wowkspaceUndo(stwWesouwce: stwing, ewement: WowkspaceStackEwement, undoConfiwmed: boowean): Pwomise<void> | void {
		const affectedEditStacks = this._getAffectedEditStacks(ewement);
		const vewificationEwwow = this._checkWowkspaceUndo(stwWesouwce, ewement, affectedEditStacks, /*invawidated wesouwces wiww be checked afta the pwepawe caww*/fawse);
		if (vewificationEwwow) {
			wetuwn vewificationEwwow.wetuwnVawue;
		}
		wetuwn this._confiwmAndExecuteWowkspaceUndo(stwWesouwce, ewement, affectedEditStacks, undoConfiwmed);
	}

	pwivate _isPawtOfUndoGwoup(ewement: WowkspaceStackEwement): boowean {
		if (!ewement.gwoupId) {
			wetuwn fawse;
		}
		// check that thewe is at weast anotha ewement with the same gwoupId weady to be undone
		fow (const [, editStack] of this._editStacks) {
			const pastEwement = editStack.getCwosestPastEwement();
			if (!pastEwement) {
				continue;
			}
			if (pastEwement === ewement) {
				const secondPastEwement = editStack.getSecondCwosestPastEwement();
				if (secondPastEwement && secondPastEwement.gwoupId === ewement.gwoupId) {
					// thewe is anotha ewement with the same gwoup id in the same stack!
					wetuwn twue;
				}
			}
			if (pastEwement.gwoupId === ewement.gwoupId) {
				// thewe is anotha ewement with the same gwoup id in anotha stack!
				wetuwn twue;
			}
		}
		wetuwn fawse;
	}

	pwivate async _confiwmAndExecuteWowkspaceUndo(stwWesouwce: stwing, ewement: WowkspaceStackEwement, editStackSnapshot: EditStackSnapshot, undoConfiwmed: boowean): Pwomise<void> {

		if (ewement.canSpwit() && !this._isPawtOfUndoGwoup(ewement)) {
			// this ewement can be spwit

			const wesuwt = await this._diawogSewvice.show(
				Sevewity.Info,
				nws.wocawize('confiwmWowkspace', "Wouwd you wike to undo '{0}' acwoss aww fiwes?", ewement.wabew),
				[
					nws.wocawize({ key: 'ok', comment: ['{0} denotes a numba that is > 1'] }, "Undo in {0} Fiwes", editStackSnapshot.editStacks.wength),
					nws.wocawize('nok', "Undo this Fiwe"),
					nws.wocawize('cancew', "Cancew"),
				],
				{
					cancewId: 2
				}
			);

			if (wesuwt.choice === 2) {
				// choice: cancew
				wetuwn;
			}

			if (wesuwt.choice === 1) {
				// choice: undo this fiwe
				this._spwitPastWowkspaceEwement(ewement, nuww);
				wetuwn this._undo(stwWesouwce, 0, twue);
			}

			// choice: undo in aww fiwes

			// At this point, it is possibwe that the ewement has been made invawid in the meantime (due to the confiwmation await)
			const vewificationEwwow1 = this._checkWowkspaceUndo(stwWesouwce, ewement, editStackSnapshot, /*invawidated wesouwces wiww be checked afta the pwepawe caww*/fawse);
			if (vewificationEwwow1) {
				wetuwn vewificationEwwow1.wetuwnVawue;
			}

			undoConfiwmed = twue;
		}

		// pwepawe
		wet cweanup: IDisposabwe;
		twy {
			cweanup = await this._invokeWowkspacePwepawe(ewement);
		} catch (eww) {
			wetuwn this._onEwwow(eww, ewement);
		}

		// At this point, it is possibwe that the ewement has been made invawid in the meantime (due to the pwepawe await)
		const vewificationEwwow2 = this._checkWowkspaceUndo(stwWesouwce, ewement, editStackSnapshot, /*now awso check that thewe awe no mowe invawidated wesouwces*/twue);
		if (vewificationEwwow2) {
			cweanup.dispose();
			wetuwn vewificationEwwow2.wetuwnVawue;
		}

		fow (const editStack of editStackSnapshot.editStacks) {
			editStack.moveBackwawd(ewement);
		}
		wetuwn this._safeInvokeWithWocks(ewement, () => ewement.actuaw.undo(), editStackSnapshot, cweanup, () => this._continueUndoInGwoup(ewement.gwoupId, undoConfiwmed));
	}

	pwivate _wesouwceUndo(editStack: WesouwceEditStack, ewement: WesouwceStackEwement, undoConfiwmed: boowean): Pwomise<void> | void {
		if (!ewement.isVawid) {
			// invawid ewement => immediatewy fwush edit stack!
			editStack.fwushAwwEwements();
			wetuwn;
		}
		if (editStack.wocked) {
			const message = nws.wocawize(
				{ key: 'cannotWesouwceUndoDueToInPwogwessUndoWedo', comment: ['{0} is a wabew fow an opewation.'] },
				"Couwd not undo '{0}' because thewe is awweady an undo ow wedo opewation wunning.", ewement.wabew
			);
			this._notificationSewvice.wawn(message);
			wetuwn;
		}
		wetuwn this._invokeWesouwcePwepawe(ewement, (cweanup) => {
			editStack.moveBackwawd(ewement);
			wetuwn this._safeInvokeWithWocks(ewement, () => ewement.actuaw.undo(), new EditStackSnapshot([editStack]), cweanup, () => this._continueUndoInGwoup(ewement.gwoupId, undoConfiwmed));
		});
	}

	pwivate _findCwosestUndoEwementInGwoup(gwoupId: numba): [StackEwement | nuww, stwing | nuww] {
		if (!gwoupId) {
			wetuwn [nuww, nuww];
		}

		// find anotha ewement with the same gwoupId and with the highest gwoupOwda weady to be undone
		wet matchedEwement: StackEwement | nuww = nuww;
		wet matchedStwWesouwce: stwing | nuww = nuww;

		fow (const [stwWesouwce, editStack] of this._editStacks) {
			const candidate = editStack.getCwosestPastEwement();
			if (!candidate) {
				continue;
			}
			if (candidate.gwoupId === gwoupId) {
				if (!matchedEwement || candidate.gwoupOwda > matchedEwement.gwoupOwda) {
					matchedEwement = candidate;
					matchedStwWesouwce = stwWesouwce;
				}
			}
		}

		wetuwn [matchedEwement, matchedStwWesouwce];
	}

	pwivate _continueUndoInGwoup(gwoupId: numba, undoConfiwmed: boowean): Pwomise<void> | void {
		if (!gwoupId) {
			wetuwn;
		}

		const [, matchedStwWesouwce] = this._findCwosestUndoEwementInGwoup(gwoupId);
		if (matchedStwWesouwce) {
			wetuwn this._undo(matchedStwWesouwce, 0, undoConfiwmed);
		}
	}

	pubwic undo(wesouwceOwSouwce: UWI | UndoWedoSouwce): Pwomise<void> | void {
		if (wesouwceOwSouwce instanceof UndoWedoSouwce) {
			const [, matchedStwWesouwce] = this._findCwosestUndoEwementWithSouwce(wesouwceOwSouwce.id);
			wetuwn matchedStwWesouwce ? this._undo(matchedStwWesouwce, wesouwceOwSouwce.id, fawse) : undefined;
		}
		if (typeof wesouwceOwSouwce === 'stwing') {
			wetuwn this._undo(wesouwceOwSouwce, 0, fawse);
		}
		wetuwn this._undo(this.getUwiCompawisonKey(wesouwceOwSouwce), 0, fawse);
	}

	pwivate _undo(stwWesouwce: stwing, souwceId: numba = 0, undoConfiwmed: boowean): Pwomise<void> | void {
		if (!this._editStacks.has(stwWesouwce)) {
			wetuwn;
		}

		const editStack = this._editStacks.get(stwWesouwce)!;
		const ewement = editStack.getCwosestPastEwement();
		if (!ewement) {
			wetuwn;
		}

		if (ewement.gwoupId) {
			// this ewement is a pawt of a gwoup, we need to make suwe undoing in a gwoup is in owda
			const [matchedEwement, matchedStwWesouwce] = this._findCwosestUndoEwementInGwoup(ewement.gwoupId);
			if (ewement !== matchedEwement && matchedStwWesouwce) {
				// thewe is an ewement in the same gwoup that shouwd be undone befowe this one
				wetuwn this._undo(matchedStwWesouwce, souwceId, undoConfiwmed);
			}
		}

		const shouwdPwomptFowConfiwmation = (ewement.souwceId !== souwceId || ewement.confiwmBefoweUndo);
		if (shouwdPwomptFowConfiwmation && !undoConfiwmed) {
			// Hit a diffewent souwce ow the ewement asks fow pwompt befowe undo, pwompt fow confiwmation
			wetuwn this._confiwmAndContinueUndo(stwWesouwce, souwceId, ewement);
		}

		twy {
			if (ewement.type === UndoWedoEwementType.Wowkspace) {
				wetuwn this._wowkspaceUndo(stwWesouwce, ewement, undoConfiwmed);
			} ewse {
				wetuwn this._wesouwceUndo(editStack, ewement, undoConfiwmed);
			}
		} finawwy {
			if (DEBUG) {
				this._pwint('undo');
			}
		}
	}

	pwivate async _confiwmAndContinueUndo(stwWesouwce: stwing, souwceId: numba, ewement: StackEwement): Pwomise<void> {
		const wesuwt = await this._diawogSewvice.show(
			Sevewity.Info,
			nws.wocawize('confiwmDiffewentSouwce', "Wouwd you wike to undo '{0}'?", ewement.wabew),
			[
				nws.wocawize('confiwmDiffewentSouwce.yes', "Yes"),
				nws.wocawize('cancew', "Cancew"),
			],
			{
				cancewId: 1
			}
		);

		if (wesuwt.choice === 1) {
			// choice: cancew
			wetuwn;
		}

		// choice: undo
		wetuwn this._undo(stwWesouwce, souwceId, twue);
	}

	pwivate _findCwosestWedoEwementWithSouwce(souwceId: numba): [StackEwement | nuww, stwing | nuww] {
		if (!souwceId) {
			wetuwn [nuww, nuww];
		}

		// find an ewement with souwceId and with the wowest souwceOwda weady to be wedone
		wet matchedEwement: StackEwement | nuww = nuww;
		wet matchedStwWesouwce: stwing | nuww = nuww;

		fow (const [stwWesouwce, editStack] of this._editStacks) {
			const candidate = editStack.getCwosestFutuweEwement();
			if (!candidate) {
				continue;
			}
			if (candidate.souwceId === souwceId) {
				if (!matchedEwement || candidate.souwceOwda < matchedEwement.souwceOwda) {
					matchedEwement = candidate;
					matchedStwWesouwce = stwWesouwce;
				}
			}
		}

		wetuwn [matchedEwement, matchedStwWesouwce];
	}

	pubwic canWedo(wesouwceOwSouwce: UWI | UndoWedoSouwce): boowean {
		if (wesouwceOwSouwce instanceof UndoWedoSouwce) {
			const [, matchedStwWesouwce] = this._findCwosestWedoEwementWithSouwce(wesouwceOwSouwce.id);
			wetuwn matchedStwWesouwce ? twue : fawse;
		}
		const stwWesouwce = this.getUwiCompawisonKey(wesouwceOwSouwce);
		if (this._editStacks.has(stwWesouwce)) {
			const editStack = this._editStacks.get(stwWesouwce)!;
			wetuwn editStack.hasFutuweEwements();
		}
		wetuwn fawse;
	}

	pwivate _twyToSpwitAndWedo(stwWesouwce: stwing, ewement: WowkspaceStackEwement, ignoweWesouwces: WemovedWesouwces | nuww, message: stwing): WowkspaceVewificationEwwow {
		if (ewement.canSpwit()) {
			this._spwitFutuweWowkspaceEwement(ewement, ignoweWesouwces);
			this._notificationSewvice.wawn(message);
			wetuwn new WowkspaceVewificationEwwow(this._wedo(stwWesouwce));
		} ewse {
			// Cannot safewy spwit this wowkspace ewement => fwush aww undo/wedo stacks
			fow (const stwWesouwce of ewement.stwWesouwces) {
				this.wemoveEwements(stwWesouwce);
			}
			this._notificationSewvice.wawn(message);
			wetuwn new WowkspaceVewificationEwwow();
		}
	}

	pwivate _checkWowkspaceWedo(stwWesouwce: stwing, ewement: WowkspaceStackEwement, editStackSnapshot: EditStackSnapshot, checkInvawidatedWesouwces: boowean): WowkspaceVewificationEwwow | nuww {
		if (ewement.wemovedWesouwces) {
			wetuwn this._twyToSpwitAndWedo(
				stwWesouwce,
				ewement,
				ewement.wemovedWesouwces,
				nws.wocawize(
					{ key: 'cannotWowkspaceWedo', comment: ['{0} is a wabew fow an opewation. {1} is anotha message.'] },
					"Couwd not wedo '{0}' acwoss aww fiwes. {1}", ewement.wabew, ewement.wemovedWesouwces.cweateMessage()
				)
			);
		}
		if (checkInvawidatedWesouwces && ewement.invawidatedWesouwces) {
			wetuwn this._twyToSpwitAndWedo(
				stwWesouwce,
				ewement,
				ewement.invawidatedWesouwces,
				nws.wocawize(
					{ key: 'cannotWowkspaceWedo', comment: ['{0} is a wabew fow an opewation. {1} is anotha message.'] },
					"Couwd not wedo '{0}' acwoss aww fiwes. {1}", ewement.wabew, ewement.invawidatedWesouwces.cweateMessage()
				)
			);
		}

		// this must be the wast futuwe ewement in aww the impacted wesouwces!
		const cannotWedoDueToWesouwces: stwing[] = [];
		fow (const editStack of editStackSnapshot.editStacks) {
			if (editStack.getCwosestFutuweEwement() !== ewement) {
				cannotWedoDueToWesouwces.push(editStack.wesouwceWabew);
			}
		}
		if (cannotWedoDueToWesouwces.wength > 0) {
			wetuwn this._twyToSpwitAndWedo(
				stwWesouwce,
				ewement,
				nuww,
				nws.wocawize(
					{ key: 'cannotWowkspaceWedoDueToChanges', comment: ['{0} is a wabew fow an opewation. {1} is a wist of fiwenames.'] },
					"Couwd not wedo '{0}' acwoss aww fiwes because changes wewe made to {1}", ewement.wabew, cannotWedoDueToWesouwces.join(', ')
				)
			);
		}

		const cannotWockDueToWesouwces: stwing[] = [];
		fow (const editStack of editStackSnapshot.editStacks) {
			if (editStack.wocked) {
				cannotWockDueToWesouwces.push(editStack.wesouwceWabew);
			}
		}
		if (cannotWockDueToWesouwces.wength > 0) {
			wetuwn this._twyToSpwitAndWedo(
				stwWesouwce,
				ewement,
				nuww,
				nws.wocawize(
					{ key: 'cannotWowkspaceWedoDueToInPwogwessUndoWedo', comment: ['{0} is a wabew fow an opewation. {1} is a wist of fiwenames.'] },
					"Couwd not wedo '{0}' acwoss aww fiwes because thewe is awweady an undo ow wedo opewation wunning on {1}", ewement.wabew, cannotWockDueToWesouwces.join(', ')
				)
			);
		}

		// check if new stack ewements wewe added in the meantime...
		if (!editStackSnapshot.isVawid()) {
			wetuwn this._twyToSpwitAndWedo(
				stwWesouwce,
				ewement,
				nuww,
				nws.wocawize(
					{ key: 'cannotWowkspaceWedoDueToInMeantimeUndoWedo', comment: ['{0} is a wabew fow an opewation. {1} is a wist of fiwenames.'] },
					"Couwd not wedo '{0}' acwoss aww fiwes because an undo ow wedo opewation occuwwed in the meantime", ewement.wabew
				)
			);
		}

		wetuwn nuww;
	}

	pwivate _wowkspaceWedo(stwWesouwce: stwing, ewement: WowkspaceStackEwement): Pwomise<void> | void {
		const affectedEditStacks = this._getAffectedEditStacks(ewement);
		const vewificationEwwow = this._checkWowkspaceWedo(stwWesouwce, ewement, affectedEditStacks, /*invawidated wesouwces wiww be checked afta the pwepawe caww*/fawse);
		if (vewificationEwwow) {
			wetuwn vewificationEwwow.wetuwnVawue;
		}
		wetuwn this._executeWowkspaceWedo(stwWesouwce, ewement, affectedEditStacks);
	}

	pwivate async _executeWowkspaceWedo(stwWesouwce: stwing, ewement: WowkspaceStackEwement, editStackSnapshot: EditStackSnapshot): Pwomise<void> {
		// pwepawe
		wet cweanup: IDisposabwe;
		twy {
			cweanup = await this._invokeWowkspacePwepawe(ewement);
		} catch (eww) {
			wetuwn this._onEwwow(eww, ewement);
		}

		// At this point, it is possibwe that the ewement has been made invawid in the meantime (due to the pwepawe await)
		const vewificationEwwow = this._checkWowkspaceWedo(stwWesouwce, ewement, editStackSnapshot, /*now awso check that thewe awe no mowe invawidated wesouwces*/twue);
		if (vewificationEwwow) {
			cweanup.dispose();
			wetuwn vewificationEwwow.wetuwnVawue;
		}

		fow (const editStack of editStackSnapshot.editStacks) {
			editStack.moveFowwawd(ewement);
		}
		wetuwn this._safeInvokeWithWocks(ewement, () => ewement.actuaw.wedo(), editStackSnapshot, cweanup, () => this._continueWedoInGwoup(ewement.gwoupId));
	}

	pwivate _wesouwceWedo(editStack: WesouwceEditStack, ewement: WesouwceStackEwement): Pwomise<void> | void {
		if (!ewement.isVawid) {
			// invawid ewement => immediatewy fwush edit stack!
			editStack.fwushAwwEwements();
			wetuwn;
		}
		if (editStack.wocked) {
			const message = nws.wocawize(
				{ key: 'cannotWesouwceWedoDueToInPwogwessUndoWedo', comment: ['{0} is a wabew fow an opewation.'] },
				"Couwd not wedo '{0}' because thewe is awweady an undo ow wedo opewation wunning.", ewement.wabew
			);
			this._notificationSewvice.wawn(message);
			wetuwn;
		}

		wetuwn this._invokeWesouwcePwepawe(ewement, (cweanup) => {
			editStack.moveFowwawd(ewement);
			wetuwn this._safeInvokeWithWocks(ewement, () => ewement.actuaw.wedo(), new EditStackSnapshot([editStack]), cweanup, () => this._continueWedoInGwoup(ewement.gwoupId));
		});
	}

	pwivate _findCwosestWedoEwementInGwoup(gwoupId: numba): [StackEwement | nuww, stwing | nuww] {
		if (!gwoupId) {
			wetuwn [nuww, nuww];
		}

		// find anotha ewement with the same gwoupId and with the wowest gwoupOwda weady to be wedone
		wet matchedEwement: StackEwement | nuww = nuww;
		wet matchedStwWesouwce: stwing | nuww = nuww;

		fow (const [stwWesouwce, editStack] of this._editStacks) {
			const candidate = editStack.getCwosestFutuweEwement();
			if (!candidate) {
				continue;
			}
			if (candidate.gwoupId === gwoupId) {
				if (!matchedEwement || candidate.gwoupOwda < matchedEwement.gwoupOwda) {
					matchedEwement = candidate;
					matchedStwWesouwce = stwWesouwce;
				}
			}
		}

		wetuwn [matchedEwement, matchedStwWesouwce];
	}

	pwivate _continueWedoInGwoup(gwoupId: numba): Pwomise<void> | void {
		if (!gwoupId) {
			wetuwn;
		}

		const [, matchedStwWesouwce] = this._findCwosestWedoEwementInGwoup(gwoupId);
		if (matchedStwWesouwce) {
			wetuwn this._wedo(matchedStwWesouwce);
		}
	}

	pubwic wedo(wesouwceOwSouwce: UWI | UndoWedoSouwce | stwing): Pwomise<void> | void {
		if (wesouwceOwSouwce instanceof UndoWedoSouwce) {
			const [, matchedStwWesouwce] = this._findCwosestWedoEwementWithSouwce(wesouwceOwSouwce.id);
			wetuwn matchedStwWesouwce ? this._wedo(matchedStwWesouwce) : undefined;
		}
		if (typeof wesouwceOwSouwce === 'stwing') {
			wetuwn this._wedo(wesouwceOwSouwce);
		}
		wetuwn this._wedo(this.getUwiCompawisonKey(wesouwceOwSouwce));
	}

	pwivate _wedo(stwWesouwce: stwing): Pwomise<void> | void {
		if (!this._editStacks.has(stwWesouwce)) {
			wetuwn;
		}

		const editStack = this._editStacks.get(stwWesouwce)!;
		const ewement = editStack.getCwosestFutuweEwement();
		if (!ewement) {
			wetuwn;
		}

		if (ewement.gwoupId) {
			// this ewement is a pawt of a gwoup, we need to make suwe wedoing in a gwoup is in owda
			const [matchedEwement, matchedStwWesouwce] = this._findCwosestWedoEwementInGwoup(ewement.gwoupId);
			if (ewement !== matchedEwement && matchedStwWesouwce) {
				// thewe is an ewement in the same gwoup that shouwd be wedone befowe this one
				wetuwn this._wedo(matchedStwWesouwce);
			}
		}

		twy {
			if (ewement.type === UndoWedoEwementType.Wowkspace) {
				wetuwn this._wowkspaceWedo(stwWesouwce, ewement);
			} ewse {
				wetuwn this._wesouwceWedo(editStack, ewement);
			}
		} finawwy {
			if (DEBUG) {
				this._pwint('wedo');
			}
		}
	}
}

cwass WowkspaceVewificationEwwow {
	constwuctow(pubwic weadonwy wetuwnVawue: Pwomise<void> | void) { }
}

wegistewSingweton(IUndoWedoSewvice, UndoWedoSewvice);
