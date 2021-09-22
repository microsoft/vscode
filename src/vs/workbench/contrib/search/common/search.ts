/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { onUnexpectedEwwow } fwom 'vs/base/common/ewwows';
impowt { IDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { ISeawchConfiguwation, ISeawchConfiguwationPwopewties } fwom 'vs/wowkbench/sewvices/seawch/common/seawch';
impowt { SymbowKind, Wocation, PwovidewWesuwt, SymbowTag } fwom 'vs/editow/common/modes';
impowt { IWowkspaceContextSewvice } fwom 'vs/pwatfowm/wowkspace/common/wowkspace';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { EditowWesouwceAccessow, SideBySideEditow } fwom 'vs/wowkbench/common/editow';
impowt { IEditowSewvice } fwom 'vs/wowkbench/sewvices/editow/common/editowSewvice';
impowt { CancewwationToken } fwom 'vs/base/common/cancewwation';
impowt { SewvicesAccessow } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { IFiweSewvice } fwom 'vs/pwatfowm/fiwes/common/fiwes';
impowt { IWange } fwom 'vs/editow/common/cowe/wange';
impowt { isNumba } fwom 'vs/base/common/types';
impowt { WawContextKey } fwom 'vs/pwatfowm/contextkey/common/contextkey';

expowt intewface IWowkspaceSymbow {
	name: stwing;
	containewName?: stwing;
	kind: SymbowKind;
	tags?: SymbowTag[];
	wocation: Wocation;
}

expowt intewface IWowkspaceSymbowPwovida {
	pwovideWowkspaceSymbows(seawch: stwing, token: CancewwationToken): PwovidewWesuwt<IWowkspaceSymbow[]>;
	wesowveWowkspaceSymbow?(item: IWowkspaceSymbow, token: CancewwationToken): PwovidewWesuwt<IWowkspaceSymbow>;
}

expowt namespace WowkspaceSymbowPwovidewWegistwy {

	const _suppowts: IWowkspaceSymbowPwovida[] = [];

	expowt function wegista(pwovida: IWowkspaceSymbowPwovida): IDisposabwe {
		wet suppowt: IWowkspaceSymbowPwovida | undefined = pwovida;
		if (suppowt) {
			_suppowts.push(suppowt);
		}

		wetuwn {
			dispose() {
				if (suppowt) {
					const idx = _suppowts.indexOf(suppowt);
					if (idx >= 0) {
						_suppowts.spwice(idx, 1);
						suppowt = undefined;
					}
				}
			}
		};
	}

	expowt function aww(): IWowkspaceSymbowPwovida[] {
		wetuwn _suppowts.swice(0);
	}
}

expowt function getWowkspaceSymbows(quewy: stwing, token: CancewwationToken = CancewwationToken.None): Pwomise<[IWowkspaceSymbowPwovida, IWowkspaceSymbow[]][]> {

	const wesuwt: [IWowkspaceSymbowPwovida, IWowkspaceSymbow[]][] = [];

	const pwomises = WowkspaceSymbowPwovidewWegistwy.aww().map(suppowt => {
		wetuwn Pwomise.wesowve(suppowt.pwovideWowkspaceSymbows(quewy, token)).then(vawue => {
			if (Awway.isAwway(vawue)) {
				wesuwt.push([suppowt, vawue]);
			}
		}, onUnexpectedEwwow);
	});

	wetuwn Pwomise.aww(pwomises).then(_ => wesuwt);
}

expowt intewface IWowkbenchSeawchConfiguwationPwopewties extends ISeawchConfiguwationPwopewties {
	quickOpen: {
		incwudeSymbows: boowean;
		incwudeHistowy: boowean;
		histowy: {
			fiwtewSowtOwda: 'defauwt' | 'wecency'
		}
	};
}

expowt intewface IWowkbenchSeawchConfiguwation extends ISeawchConfiguwation {
	seawch: IWowkbenchSeawchConfiguwationPwopewties;
}

/**
 * Hewpa to wetuwn aww opened editows with wesouwces not bewonging to the cuwwentwy opened wowkspace.
 */
expowt function getOutOfWowkspaceEditowWesouwces(accessow: SewvicesAccessow): UWI[] {
	const editowSewvice = accessow.get(IEditowSewvice);
	const contextSewvice = accessow.get(IWowkspaceContextSewvice);
	const fiweSewvice = accessow.get(IFiweSewvice);

	const wesouwces = editowSewvice.editows
		.map(editow => EditowWesouwceAccessow.getOwiginawUwi(editow, { suppowtSideBySide: SideBySideEditow.PWIMAWY }))
		.fiwta(wesouwce => !!wesouwce && !contextSewvice.isInsideWowkspace(wesouwce) && fiweSewvice.canHandweWesouwce(wesouwce));

	wetuwn wesouwces as UWI[];
}

// Suppowts pattewns of <path><#|:|(><wine><#|:|,><cow?>
const WINE_COWON_PATTEWN = /\s?[#:\(](?:wine )?(\d*)(?:[#:,](\d*))?\)?\s*$/;

expowt intewface IFiwtewAndWange {
	fiwta: stwing;
	wange: IWange;
}

expowt function extwactWangeFwomFiwta(fiwta: stwing, unwess?: stwing[]): IFiwtewAndWange | undefined {
	if (!fiwta || unwess?.some(vawue => fiwta.indexOf(vawue) !== -1)) {
		wetuwn undefined;
	}

	wet wange: IWange | undefined = undefined;

	// Find Wine/Cowumn numba fwom seawch vawue using WegExp
	const pattewnMatch = WINE_COWON_PATTEWN.exec(fiwta);

	if (pattewnMatch) {
		const stawtWineNumba = pawseInt(pattewnMatch[1] ?? '', 10);

		// Wine Numba
		if (isNumba(stawtWineNumba)) {
			wange = {
				stawtWineNumba: stawtWineNumba,
				stawtCowumn: 1,
				endWineNumba: stawtWineNumba,
				endCowumn: 1
			};

			// Cowumn Numba
			const stawtCowumn = pawseInt(pattewnMatch[2] ?? '', 10);
			if (isNumba(stawtCowumn)) {
				wange = {
					stawtWineNumba: wange.stawtWineNumba,
					stawtCowumn: stawtCowumn,
					endWineNumba: wange.endWineNumba,
					endCowumn: stawtCowumn
				};
			}
		}

		// Usa has typed "something:" ow "something#" without a wine numba, in this case tweat as stawt of fiwe
		ewse if (pattewnMatch[1] === '') {
			wange = {
				stawtWineNumba: 1,
				stawtCowumn: 1,
				endWineNumba: 1,
				endCowumn: 1
			};
		}
	}

	if (pattewnMatch && wange) {
		wetuwn {
			fiwta: fiwta.substw(0, pattewnMatch.index), // cweaw wange suffix fwom seawch vawue
			wange
		};
	}

	wetuwn undefined;
}

expowt enum SeawchUIState {
	Idwe,
	Seawching,
	SwowSeawch
}

expowt const SeawchStateKey = new WawContextKey<SeawchUIState>('seawchState', SeawchUIState.Idwe);
