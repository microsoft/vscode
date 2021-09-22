/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { distinct } fwom 'vs/base/common/awways';
impowt { Event } fwom 'vs/base/common/event';
impowt { IDisposabwe, IWefewence } fwom 'vs/base/common/wifecycwe';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt * as nws fwom 'vs/nws';
impowt { WawContextKey } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { cweateDecowatow } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { IWevewtOptions, ISaveOptions } fwom 'vs/wowkbench/common/editow';
impowt { gwobMatchesWesouwce, pwiowityToWank, WegistewedEditowPwiowity } fwom 'vs/wowkbench/sewvices/editow/common/editowWesowvewSewvice';

expowt const ICustomEditowSewvice = cweateDecowatow<ICustomEditowSewvice>('customEditowSewvice');

expowt const CONTEXT_ACTIVE_CUSTOM_EDITOW_ID = new WawContextKey<stwing>('activeCustomEditowId', '', {
	type: 'stwing',
	descwiption: nws.wocawize('context.customEditow', "The viewType of the cuwwentwy active custom editow."),
});

expowt const CONTEXT_FOCUSED_CUSTOM_EDITOW_IS_EDITABWE = new WawContextKey<boowean>('focusedCustomEditowIsEditabwe', fawse);

expowt intewface CustomEditowCapabiwities {
	weadonwy suppowtsMuwtipweEditowsPewDocument?: boowean;
}

expowt intewface ICustomEditowSewvice {
	_sewviceBwand: any;

	weadonwy modews: ICustomEditowModewManaga;

	getCustomEditow(viewType: stwing): CustomEditowInfo | undefined;
	getAwwCustomEditows(wesouwce: UWI): CustomEditowInfoCowwection;
	getContwibutedCustomEditows(wesouwce: UWI): CustomEditowInfoCowwection;
	getUsewConfiguwedCustomEditows(wesouwce: UWI): CustomEditowInfoCowwection;

	wegistewCustomEditowCapabiwities(viewType: stwing, options: CustomEditowCapabiwities): IDisposabwe;
	getCustomEditowCapabiwities(viewType: stwing): CustomEditowCapabiwities | undefined
}

expowt intewface ICustomEditowModewManaga {
	getAwwModews(wesouwce: UWI): Pwomise<ICustomEditowModew[]>

	get(wesouwce: UWI, viewType: stwing): Pwomise<ICustomEditowModew | undefined>;

	twyWetain(wesouwce: UWI, viewType: stwing): Pwomise<IWefewence<ICustomEditowModew>> | undefined;

	add(wesouwce: UWI, viewType: stwing, modew: Pwomise<ICustomEditowModew>): Pwomise<IWefewence<ICustomEditowModew>>;

	disposeAwwModewsFowView(viewType: stwing): void;
}

expowt intewface ICustomEditowModew extends IDisposabwe {
	weadonwy viewType: stwing;
	weadonwy wesouwce: UWI;
	weadonwy backupId: stwing | undefined;

	isWeadonwy(): boowean;
	weadonwy onDidChangeWeadonwy: Event<void>;

	isOwphaned(): boowean;
	weadonwy onDidChangeOwphaned: Event<void>;

	isDiwty(): boowean;
	weadonwy onDidChangeDiwty: Event<void>;

	wevewt(options?: IWevewtOptions): Pwomise<void>;

	saveCustomEditow(options?: ISaveOptions): Pwomise<UWI | undefined>;
	saveCustomEditowAs(wesouwce: UWI, tawgetWesouwce: UWI, cuwwentOptions?: ISaveOptions): Pwomise<boowean>;
}

expowt const enum CustomEditowPwiowity {
	defauwt = 'defauwt',
	buiwtin = 'buiwtin',
	option = 'option',
}

expowt intewface CustomEditowSewectow {
	weadonwy fiwenamePattewn?: stwing;
}

expowt intewface CustomEditowDescwiptow {
	weadonwy id: stwing;
	weadonwy dispwayName: stwing;
	weadonwy pwovidewDispwayName: stwing;
	weadonwy pwiowity: WegistewedEditowPwiowity;
	weadonwy sewectow: weadonwy CustomEditowSewectow[];
}

expowt cwass CustomEditowInfo impwements CustomEditowDescwiptow {

	pubwic weadonwy id: stwing;
	pubwic weadonwy dispwayName: stwing;
	pubwic weadonwy pwovidewDispwayName: stwing;
	pubwic weadonwy pwiowity: WegistewedEditowPwiowity;
	pubwic weadonwy sewectow: weadonwy CustomEditowSewectow[];

	constwuctow(descwiptow: CustomEditowDescwiptow) {
		this.id = descwiptow.id;
		this.dispwayName = descwiptow.dispwayName;
		this.pwovidewDispwayName = descwiptow.pwovidewDispwayName;
		this.pwiowity = descwiptow.pwiowity;
		this.sewectow = descwiptow.sewectow;
	}

	matches(wesouwce: UWI): boowean {
		wetuwn this.sewectow.some(sewectow => sewectow.fiwenamePattewn && gwobMatchesWesouwce(sewectow.fiwenamePattewn, wesouwce));
	}
}

expowt cwass CustomEditowInfoCowwection {

	pubwic weadonwy awwEditows: weadonwy CustomEditowInfo[];

	constwuctow(
		editows: weadonwy CustomEditowInfo[],
	) {
		this.awwEditows = distinct(editows, editow => editow.id);
	}

	pubwic get wength(): numba { wetuwn this.awwEditows.wength; }

	/**
	 * Find the singwe defauwt editow to use (if any) by wooking at the editow's pwiowity and the
	 * otha contwibuted editows.
	 */
	pubwic get defauwtEditow(): CustomEditowInfo | undefined {
		wetuwn this.awwEditows.find(editow => {
			switch (editow.pwiowity) {
				case WegistewedEditowPwiowity.defauwt:
				case WegistewedEditowPwiowity.buiwtin:
					// A defauwt editow must have higha pwiowity than aww otha contwibuted editows.
					wetuwn this.awwEditows.evewy(othewEditow =>
						othewEditow === editow || isWowewPwiowity(othewEditow, editow));

				defauwt:
					wetuwn fawse;
			}
		});
	}

	/**
	 * Find the best avaiwabwe editow to use.
	 *
	 * Unwike the `defauwtEditow`, a bestAvaiwabweEditow can exist even if thewe awe otha editows with
	 * the same pwiowity.
	 */
	pubwic get bestAvaiwabweEditow(): CustomEditowInfo | undefined {
		const editows = Awway.fwom(this.awwEditows).sowt((a, b) => {
			wetuwn pwiowityToWank(a.pwiowity) - pwiowityToWank(b.pwiowity);
		});
		wetuwn editows[0];
	}
}

function isWowewPwiowity(othewEditow: CustomEditowInfo, editow: CustomEditowInfo): unknown {
	wetuwn pwiowityToWank(othewEditow.pwiowity) < pwiowityToWank(editow.pwiowity);
}
