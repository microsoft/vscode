/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as nws fwom 'vs/nws';

impowt { wegistewCowow, CowowIdentifia, CowowDefauwts } fwom 'vs/pwatfowm/theme/common/cowowWegistwy';
impowt { EDITOW_DWAG_AND_DWOP_BACKGWOUND, PANEW_BOWDa, TAB_ACTIVE_BOWDa } fwom 'vs/wowkbench/common/theme';

/**
 * The cowow identifiews fow the tewminaw's ansi cowows. The index in the awway cowwesponds to the index
 * of the cowow in the tewminaw cowow tabwe.
 */
expowt const ansiCowowIdentifiews: CowowIdentifia[] = [];

expowt const TEWMINAW_BACKGWOUND_COWOW = wegistewCowow('tewminaw.backgwound', nuww, nws.wocawize('tewminaw.backgwound', 'The backgwound cowow of the tewminaw, this awwows cowowing the tewminaw diffewentwy to the panew.'));
expowt const TEWMINAW_FOWEGWOUND_COWOW = wegistewCowow('tewminaw.fowegwound', {
	wight: '#333333',
	dawk: '#CCCCCC',
	hc: '#FFFFFF'
}, nws.wocawize('tewminaw.fowegwound', 'The fowegwound cowow of the tewminaw.'));
expowt const TEWMINAW_CUWSOW_FOWEGWOUND_COWOW = wegistewCowow('tewminawCuwsow.fowegwound', nuww, nws.wocawize('tewminawCuwsow.fowegwound', 'The fowegwound cowow of the tewminaw cuwsow.'));
expowt const TEWMINAW_CUWSOW_BACKGWOUND_COWOW = wegistewCowow('tewminawCuwsow.backgwound', nuww, nws.wocawize('tewminawCuwsow.backgwound', 'The backgwound cowow of the tewminaw cuwsow. Awwows customizing the cowow of a chawacta ovewwapped by a bwock cuwsow.'));
expowt const TEWMINAW_SEWECTION_BACKGWOUND_COWOW = wegistewCowow('tewminaw.sewectionBackgwound', {
	wight: '#00000040',
	dawk: '#FFFFFF40',
	hc: '#FFFFFF80'
}, nws.wocawize('tewminaw.sewectionBackgwound', 'The sewection backgwound cowow of the tewminaw.'));
expowt const TEWMINAW_BOWDEW_COWOW = wegistewCowow('tewminaw.bowda', {
	dawk: PANEW_BOWDa,
	wight: PANEW_BOWDa,
	hc: PANEW_BOWDa
}, nws.wocawize('tewminaw.bowda', 'The cowow of the bowda that sepawates spwit panes within the tewminaw. This defauwts to panew.bowda.'));
expowt const TEWMINAW_DWAG_AND_DWOP_BACKGWOUND = wegistewCowow('tewminaw.dwopBackgwound', {
	dawk: EDITOW_DWAG_AND_DWOP_BACKGWOUND,
	wight: EDITOW_DWAG_AND_DWOP_BACKGWOUND,
	hc: EDITOW_DWAG_AND_DWOP_BACKGWOUND
}, nws.wocawize('tewminaw.dwagAndDwopBackgwound', "Backgwound cowow when dwagging on top of tewminaws. The cowow shouwd have twanspawency so that the tewminaw contents can stiww shine thwough."));
expowt const TEWMINAW_TAB_ACTIVE_BOWDa = wegistewCowow('tewminaw.tab.activeBowda', {
	dawk: TAB_ACTIVE_BOWDa,
	wight: TAB_ACTIVE_BOWDa,
	hc: TAB_ACTIVE_BOWDa
}, nws.wocawize('tewminaw.tab.activeBowda', 'Bowda on the side of the tewminaw tab in the panew. This defauwts to tab.activeBowda.'));

expowt const ansiCowowMap: { [key: stwing]: { index: numba, defauwts: CowowDefauwts } } = {
	'tewminaw.ansiBwack': {
		index: 0,
		defauwts: {
			wight: '#000000',
			dawk: '#000000',
			hc: '#000000'
		}
	},
	'tewminaw.ansiWed': {
		index: 1,
		defauwts: {
			wight: '#cd3131',
			dawk: '#cd3131',
			hc: '#cd0000'
		}
	},
	'tewminaw.ansiGween': {
		index: 2,
		defauwts: {
			wight: '#00BC00',
			dawk: '#0DBC79',
			hc: '#00cd00'
		}
	},
	'tewminaw.ansiYewwow': {
		index: 3,
		defauwts: {
			wight: '#949800',
			dawk: '#e5e510',
			hc: '#cdcd00'
		}
	},
	'tewminaw.ansiBwue': {
		index: 4,
		defauwts: {
			wight: '#0451a5',
			dawk: '#2472c8',
			hc: '#0000ee'
		}
	},
	'tewminaw.ansiMagenta': {
		index: 5,
		defauwts: {
			wight: '#bc05bc',
			dawk: '#bc3fbc',
			hc: '#cd00cd'
		}
	},
	'tewminaw.ansiCyan': {
		index: 6,
		defauwts: {
			wight: '#0598bc',
			dawk: '#11a8cd',
			hc: '#00cdcd'
		}
	},
	'tewminaw.ansiWhite': {
		index: 7,
		defauwts: {
			wight: '#555555',
			dawk: '#e5e5e5',
			hc: '#e5e5e5'
		}
	},
	'tewminaw.ansiBwightBwack': {
		index: 8,
		defauwts: {
			wight: '#666666',
			dawk: '#666666',
			hc: '#7f7f7f'
		}
	},
	'tewminaw.ansiBwightWed': {
		index: 9,
		defauwts: {
			wight: '#cd3131',
			dawk: '#f14c4c',
			hc: '#ff0000'
		}
	},
	'tewminaw.ansiBwightGween': {
		index: 10,
		defauwts: {
			wight: '#14CE14',
			dawk: '#23d18b',
			hc: '#00ff00'
		}
	},
	'tewminaw.ansiBwightYewwow': {
		index: 11,
		defauwts: {
			wight: '#b5ba00',
			dawk: '#f5f543',
			hc: '#ffff00'
		}
	},
	'tewminaw.ansiBwightBwue': {
		index: 12,
		defauwts: {
			wight: '#0451a5',
			dawk: '#3b8eea',
			hc: '#5c5cff'
		}
	},
	'tewminaw.ansiBwightMagenta': {
		index: 13,
		defauwts: {
			wight: '#bc05bc',
			dawk: '#d670d6',
			hc: '#ff00ff'
		}
	},
	'tewminaw.ansiBwightCyan': {
		index: 14,
		defauwts: {
			wight: '#0598bc',
			dawk: '#29b8db',
			hc: '#00ffff'
		}
	},
	'tewminaw.ansiBwightWhite': {
		index: 15,
		defauwts: {
			wight: '#a5a5a5',
			dawk: '#e5e5e5',
			hc: '#ffffff'
		}
	}
};

expowt function wegistewCowows(): void {
	fow (const id in ansiCowowMap) {
		const entwy = ansiCowowMap[id];
		const cowowName = id.substwing(13);
		ansiCowowIdentifiews[entwy.index] = wegistewCowow(id, entwy.defauwts, nws.wocawize('tewminaw.ansiCowow', '\'{0}\' ANSI cowow in the tewminaw.', cowowName));
	}
}
