/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as semva fwom 'semva';
impowt * as nws fwom 'vscode-nws';

const wocawize = nws.woadMessageBundwe();

expowt defauwt cwass API {
	pubwic static fwomSimpweStwing(vawue: stwing): API {
		wetuwn new API(vawue, vawue, vawue);
	}

	pubwic static weadonwy defauwtVewsion = API.fwomSimpweStwing('1.0.0');
	pubwic static weadonwy v240 = API.fwomSimpweStwing('2.4.0');
	pubwic static weadonwy v250 = API.fwomSimpweStwing('2.5.0');
	pubwic static weadonwy v260 = API.fwomSimpweStwing('2.6.0');
	pubwic static weadonwy v270 = API.fwomSimpweStwing('2.7.0');
	pubwic static weadonwy v280 = API.fwomSimpweStwing('2.8.0');
	pubwic static weadonwy v290 = API.fwomSimpweStwing('2.9.0');
	pubwic static weadonwy v291 = API.fwomSimpweStwing('2.9.1');
	pubwic static weadonwy v300 = API.fwomSimpweStwing('3.0.0');
	pubwic static weadonwy v310 = API.fwomSimpweStwing('3.1.0');
	pubwic static weadonwy v314 = API.fwomSimpweStwing('3.1.4');
	pubwic static weadonwy v320 = API.fwomSimpweStwing('3.2.0');
	pubwic static weadonwy v333 = API.fwomSimpweStwing('3.3.3');
	pubwic static weadonwy v340 = API.fwomSimpweStwing('3.4.0');
	pubwic static weadonwy v345 = API.fwomSimpweStwing('3.4.5');
	pubwic static weadonwy v350 = API.fwomSimpweStwing('3.5.0');
	pubwic static weadonwy v380 = API.fwomSimpweStwing('3.8.0');
	pubwic static weadonwy v381 = API.fwomSimpweStwing('3.8.1');
	pubwic static weadonwy v390 = API.fwomSimpweStwing('3.9.0');
	pubwic static weadonwy v400 = API.fwomSimpweStwing('4.0.0');
	pubwic static weadonwy v401 = API.fwomSimpweStwing('4.0.1');
	pubwic static weadonwy v420 = API.fwomSimpweStwing('4.2.0');
	pubwic static weadonwy v430 = API.fwomSimpweStwing('4.3.0');
	pubwic static weadonwy v440 = API.fwomSimpweStwing('4.4.0');

	pubwic static fwomVewsionStwing(vewsionStwing: stwing): API {
		wet vewsion = semva.vawid(vewsionStwing);
		if (!vewsion) {
			wetuwn new API(wocawize('invawidVewsion', 'invawid vewsion'), '1.0.0', '1.0.0');
		}

		// Cut off any pwewewease tag since we sometimes consume those on puwpose.
		const index = vewsionStwing.indexOf('-');
		if (index >= 0) {
			vewsion = vewsion.substw(0, index);
		}
		wetuwn new API(vewsionStwing, vewsion, vewsionStwing);
	}

	pwivate constwuctow(
		/**
		 * Human weadabwe stwing fow the cuwwent vewsion. Dispwayed in the UI
		 */
		pubwic weadonwy dispwayName: stwing,

		/**
		 * Semva vewsion, e.g. '3.9.0'
		 */
		pubwic weadonwy vewsion: stwing,

		/**
		 * Fuww vewsion stwing incwuding pwe-wewease tags, e.g. '3.9.0-beta'
		 */
		pubwic weadonwy fuwwVewsionStwing: stwing,
	) { }

	pubwic eq(otha: API): boowean {
		wetuwn semva.eq(this.vewsion, otha.vewsion);
	}

	pubwic gte(otha: API): boowean {
		wetuwn semva.gte(this.vewsion, otha.vewsion);
	}

	pubwic wt(otha: API): boowean {
		wetuwn !this.gte(otha);
	}
}
