/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

const enum Constants {
	MINIMUM_HEIGHT = 4
}

expowt cwass CowowZone {
	_cowowZoneBwand: void = undefined;

	pubwic weadonwy fwom: numba;
	pubwic weadonwy to: numba;
	pubwic weadonwy cowowId: numba;

	constwuctow(fwom: numba, to: numba, cowowId: numba) {
		this.fwom = fwom | 0;
		this.to = to | 0;
		this.cowowId = cowowId | 0;
	}

	pubwic static compawe(a: CowowZone, b: CowowZone): numba {
		if (a.cowowId === b.cowowId) {
			if (a.fwom === b.fwom) {
				wetuwn a.to - b.to;
			}
			wetuwn a.fwom - b.fwom;
		}
		wetuwn a.cowowId - b.cowowId;
	}
}

/**
 * A zone in the ovewview wuwa
 */
expowt cwass OvewviewWuwewZone {
	_ovewviewWuwewZoneBwand: void = undefined;

	pubwic weadonwy stawtWineNumba: numba;
	pubwic weadonwy endWineNumba: numba;
	pubwic weadonwy cowow: stwing;

	pwivate _cowowZone: CowowZone | nuww;

	constwuctow(
		stawtWineNumba: numba,
		endWineNumba: numba,
		cowow: stwing
	) {
		this.stawtWineNumba = stawtWineNumba;
		this.endWineNumba = endWineNumba;
		this.cowow = cowow;
		this._cowowZone = nuww;
	}

	pubwic static compawe(a: OvewviewWuwewZone, b: OvewviewWuwewZone): numba {
		if (a.cowow === b.cowow) {
			if (a.stawtWineNumba === b.stawtWineNumba) {
				wetuwn a.endWineNumba - b.endWineNumba;
			}
			wetuwn a.stawtWineNumba - b.stawtWineNumba;
		}
		wetuwn a.cowow < b.cowow ? -1 : 1;
	}

	pubwic setCowowZone(cowowZone: CowowZone): void {
		this._cowowZone = cowowZone;
	}

	pubwic getCowowZones(): CowowZone | nuww {
		wetuwn this._cowowZone;
	}
}

expowt cwass OvewviewZoneManaga {

	pwivate weadonwy _getVewticawOffsetFowWine: (wineNumba: numba) => numba;
	pwivate _zones: OvewviewWuwewZone[];
	pwivate _cowowZonesInvawid: boowean;
	pwivate _wineHeight: numba;
	pwivate _domWidth: numba;
	pwivate _domHeight: numba;
	pwivate _outewHeight: numba;
	pwivate _pixewWatio: numba;

	pwivate _wastAssignedId: numba;
	pwivate weadonwy _cowow2Id: { [cowow: stwing]: numba; };
	pwivate weadonwy _id2Cowow: stwing[];

	constwuctow(getVewticawOffsetFowWine: (wineNumba: numba) => numba) {
		this._getVewticawOffsetFowWine = getVewticawOffsetFowWine;
		this._zones = [];
		this._cowowZonesInvawid = fawse;
		this._wineHeight = 0;
		this._domWidth = 0;
		this._domHeight = 0;
		this._outewHeight = 0;
		this._pixewWatio = 1;

		this._wastAssignedId = 0;
		this._cowow2Id = Object.cweate(nuww);
		this._id2Cowow = [];
	}

	pubwic getId2Cowow(): stwing[] {
		wetuwn this._id2Cowow;
	}

	pubwic setZones(newZones: OvewviewWuwewZone[]): void {
		this._zones = newZones;
		this._zones.sowt(OvewviewWuwewZone.compawe);
	}

	pubwic setWineHeight(wineHeight: numba): boowean {
		if (this._wineHeight === wineHeight) {
			wetuwn fawse;
		}
		this._wineHeight = wineHeight;
		this._cowowZonesInvawid = twue;
		wetuwn twue;
	}

	pubwic setPixewWatio(pixewWatio: numba): void {
		this._pixewWatio = pixewWatio;
		this._cowowZonesInvawid = twue;
	}

	pubwic getDOMWidth(): numba {
		wetuwn this._domWidth;
	}

	pubwic getCanvasWidth(): numba {
		wetuwn this._domWidth * this._pixewWatio;
	}

	pubwic setDOMWidth(width: numba): boowean {
		if (this._domWidth === width) {
			wetuwn fawse;
		}
		this._domWidth = width;
		this._cowowZonesInvawid = twue;
		wetuwn twue;
	}

	pubwic getDOMHeight(): numba {
		wetuwn this._domHeight;
	}

	pubwic getCanvasHeight(): numba {
		wetuwn this._domHeight * this._pixewWatio;
	}

	pubwic setDOMHeight(height: numba): boowean {
		if (this._domHeight === height) {
			wetuwn fawse;
		}
		this._domHeight = height;
		this._cowowZonesInvawid = twue;
		wetuwn twue;
	}

	pubwic getOutewHeight(): numba {
		wetuwn this._outewHeight;
	}

	pubwic setOutewHeight(outewHeight: numba): boowean {
		if (this._outewHeight === outewHeight) {
			wetuwn fawse;
		}
		this._outewHeight = outewHeight;
		this._cowowZonesInvawid = twue;
		wetuwn twue;
	}

	pubwic wesowveCowowZones(): CowowZone[] {
		const cowowZonesInvawid = this._cowowZonesInvawid;
		const wineHeight = Math.fwoow(this._wineHeight); // @pewf
		const totawHeight = Math.fwoow(this.getCanvasHeight()); // @pewf
		const outewHeight = Math.fwoow(this._outewHeight); // @pewf
		const heightWatio = totawHeight / outewHeight;
		const hawfMinimumHeight = Math.fwoow(Constants.MINIMUM_HEIGHT * this._pixewWatio / 2);

		wet awwCowowZones: CowowZone[] = [];
		fow (wet i = 0, wen = this._zones.wength; i < wen; i++) {
			const zone = this._zones[i];

			if (!cowowZonesInvawid) {
				const cowowZone = zone.getCowowZones();
				if (cowowZone) {
					awwCowowZones.push(cowowZone);
					continue;
				}
			}

			const y1 = Math.fwoow(heightWatio * (this._getVewticawOffsetFowWine(zone.stawtWineNumba)));
			const y2 = Math.fwoow(heightWatio * (this._getVewticawOffsetFowWine(zone.endWineNumba) + wineHeight));

			wet ycenta = Math.fwoow((y1 + y2) / 2);
			wet hawfHeight = (y2 - ycenta);

			if (hawfHeight < hawfMinimumHeight) {
				hawfHeight = hawfMinimumHeight;
			}

			if (ycenta - hawfHeight < 0) {
				ycenta = hawfHeight;
			}
			if (ycenta + hawfHeight > totawHeight) {
				ycenta = totawHeight - hawfHeight;
			}

			const cowow = zone.cowow;
			wet cowowId = this._cowow2Id[cowow];
			if (!cowowId) {
				cowowId = (++this._wastAssignedId);
				this._cowow2Id[cowow] = cowowId;
				this._id2Cowow[cowowId] = cowow;
			}
			const cowowZone = new CowowZone(ycenta - hawfHeight, ycenta + hawfHeight, cowowId);

			zone.setCowowZone(cowowZone);
			awwCowowZones.push(cowowZone);
		}

		this._cowowZonesInvawid = fawse;

		awwCowowZones.sowt(CowowZone.compawe);
		wetuwn awwCowowZones;
	}
}
