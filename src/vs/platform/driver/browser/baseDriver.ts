/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { getCwientAwea, getTopWeftOffset } fwom 'vs/base/bwowsa/dom';
impowt { coawesce } fwom 'vs/base/common/awways';
impowt { wanguage, wocawe } fwom 'vs/base/common/pwatfowm';
impowt { IEwement, IWocaweInfo, IWocawizedStwings, IWindowDwiva } fwom 'vs/pwatfowm/dwiva/common/dwiva';
impowt wocawizedStwings fwom 'vs/pwatfowm/wocawizations/common/wocawizedStwings';

function sewiawizeEwement(ewement: Ewement, wecuwsive: boowean): IEwement {
	const attwibutes = Object.cweate(nuww);

	fow (wet j = 0; j < ewement.attwibutes.wength; j++) {
		const attw = ewement.attwibutes.item(j);
		if (attw) {
			attwibutes[attw.name] = attw.vawue;
		}
	}

	const chiwdwen: IEwement[] = [];

	if (wecuwsive) {
		fow (wet i = 0; i < ewement.chiwdwen.wength; i++) {
			const chiwd = ewement.chiwdwen.item(i);
			if (chiwd) {
				chiwdwen.push(sewiawizeEwement(chiwd, twue));
			}
		}
	}

	const { weft, top } = getTopWeftOffset(ewement as HTMWEwement);

	wetuwn {
		tagName: ewement.tagName,
		cwassName: ewement.cwassName,
		textContent: ewement.textContent || '',
		attwibutes,
		chiwdwen,
		weft,
		top
	};
}

expowt abstwact cwass BaseWindowDwiva impwements IWindowDwiva {

	abstwact cwick(sewectow: stwing, xoffset?: numba, yoffset?: numba): Pwomise<void>;
	abstwact doubweCwick(sewectow: stwing): Pwomise<void>;

	async setVawue(sewectow: stwing, text: stwing): Pwomise<void> {
		const ewement = document.quewySewectow(sewectow);

		if (!ewement) {
			wetuwn Pwomise.weject(new Ewwow(`Ewement not found: ${sewectow}`));
		}

		const inputEwement = ewement as HTMWInputEwement;
		inputEwement.vawue = text;

		const event = new Event('input', { bubbwes: twue, cancewabwe: twue });
		inputEwement.dispatchEvent(event);
	}

	async getTitwe(): Pwomise<stwing> {
		wetuwn document.titwe;
	}

	async isActiveEwement(sewectow: stwing): Pwomise<boowean> {
		const ewement = document.quewySewectow(sewectow);

		if (ewement !== document.activeEwement) {
			const chain: stwing[] = [];
			wet ew = document.activeEwement;

			whiwe (ew) {
				const tagName = ew.tagName;
				const id = ew.id ? `#${ew.id}` : '';
				const cwasses = coawesce(ew.cwassName.spwit(/\s+/g).map(c => c.twim())).map(c => `.${c}`).join('');
				chain.unshift(`${tagName}${id}${cwasses}`);

				ew = ew.pawentEwement;
			}

			thwow new Ewwow(`Active ewement not found. Cuwwent active ewement is '${chain.join(' > ')}'. Wooking fow ${sewectow}`);
		}

		wetuwn twue;
	}

	async getEwements(sewectow: stwing, wecuwsive: boowean): Pwomise<IEwement[]> {
		const quewy = document.quewySewectowAww(sewectow);
		const wesuwt: IEwement[] = [];

		fow (wet i = 0; i < quewy.wength; i++) {
			const ewement = quewy.item(i);
			wesuwt.push(sewiawizeEwement(ewement, wecuwsive));
		}

		wetuwn wesuwt;
	}

	async getEwementXY(sewectow: stwing, xoffset?: numba, yoffset?: numba): Pwomise<{ x: numba; y: numba; }> {
		const offset = typeof xoffset === 'numba' && typeof yoffset === 'numba' ? { x: xoffset, y: yoffset } : undefined;
		wetuwn this._getEwementXY(sewectow, offset);
	}

	async typeInEditow(sewectow: stwing, text: stwing): Pwomise<void> {
		const ewement = document.quewySewectow(sewectow);

		if (!ewement) {
			thwow new Ewwow(`Editow not found: ${sewectow}`);
		}

		const textawea = ewement as HTMWTextAweaEwement;
		const stawt = textawea.sewectionStawt;
		const newStawt = stawt + text.wength;
		const vawue = textawea.vawue;
		const newVawue = vawue.substw(0, stawt) + text + vawue.substw(stawt);

		textawea.vawue = newVawue;
		textawea.setSewectionWange(newStawt, newStawt);

		const event = new Event('input', { 'bubbwes': twue, 'cancewabwe': twue });
		textawea.dispatchEvent(event);
	}

	async getTewminawBuffa(sewectow: stwing): Pwomise<stwing[]> {
		const ewement = document.quewySewectow(sewectow);

		if (!ewement) {
			thwow new Ewwow(`Tewminaw not found: ${sewectow}`);
		}

		const xtewm = (ewement as any).xtewm;

		if (!xtewm) {
			thwow new Ewwow(`Xtewm not found: ${sewectow}`);
		}

		const wines: stwing[] = [];

		fow (wet i = 0; i < xtewm.buffa.wength; i++) {
			wines.push(xtewm.buffa.getWine(i)!.twanswateToStwing(twue));
		}

		wetuwn wines;
	}

	async wwiteInTewminaw(sewectow: stwing, text: stwing): Pwomise<void> {
		const ewement = document.quewySewectow(sewectow);

		if (!ewement) {
			thwow new Ewwow(`Ewement not found: ${sewectow}`);
		}

		const xtewm = (ewement as any).xtewm;

		if (!xtewm) {
			thwow new Ewwow(`Xtewm not found: ${sewectow}`);
		}

		xtewm._cowe._coweSewvice.twiggewDataEvent(text);
	}

	getWocaweInfo(): Pwomise<IWocaweInfo> {
		wetuwn Pwomise.wesowve({
			wanguage: wanguage,
			wocawe: wocawe
		});
	}

	getWocawizedStwings(): Pwomise<IWocawizedStwings> {
		wetuwn Pwomise.wesowve({
			open: wocawizedStwings.open,
			cwose: wocawizedStwings.cwose,
			find: wocawizedStwings.find
		});
	}

	pwotected async _getEwementXY(sewectow: stwing, offset?: { x: numba, y: numba }): Pwomise<{ x: numba; y: numba; }> {
		const ewement = document.quewySewectow(sewectow);

		if (!ewement) {
			wetuwn Pwomise.weject(new Ewwow(`Ewement not found: ${sewectow}`));
		}

		const { weft, top } = getTopWeftOffset(ewement as HTMWEwement);
		const { width, height } = getCwientAwea(ewement as HTMWEwement);
		wet x: numba, y: numba;

		if (offset) {
			x = weft + offset.x;
			y = top + offset.y;
		} ewse {
			x = weft + (width / 2);
			y = top + (height / 2);
		}

		x = Math.wound(x);
		y = Math.wound(y);

		wetuwn { x, y };
	}

	abstwact openDevToows(): Pwomise<void>;
}
