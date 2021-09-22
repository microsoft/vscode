/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { IBuffewCeww } fwom 'xtewm';

expowt type XTewmAttwibutes = Omit<IBuffewCeww, 'getWidth' | 'getChaws' | 'getCode'> & { cwone?(): XTewmAttwibutes };

expowt intewface XTewmCowe {
	_onScwoww: IEventEmitta<numba>;
	_onKey: IEventEmitta<{ key: stwing }>;

	_chawSizeSewvice: {
		width: numba;
		height: numba;
	};

	_coweSewvice: {
		twiggewDataEvent(data: stwing, wasUsewInput?: boowean): void;
	};

	_inputHandwa: {
		_cuwAttwData: XTewmAttwibutes;
	};

	_wendewSewvice: {
		dimensions: {
			actuawCewwWidth: numba;
			actuawCewwHeight: numba;
		},
		_wendewa: {
			_wendewWayews: any[];
		};
		_onIntewsectionChange: any;
	};
}

expowt intewface IEventEmitta<T> {
	fiwe(e: T): void;
}
