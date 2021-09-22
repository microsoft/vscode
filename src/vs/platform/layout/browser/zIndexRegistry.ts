/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { cweawNode, cweateCSSWuwe, cweateStyweSheet } fwom 'vs/base/bwowsa/dom';
impowt { WunOnceScheduwa } fwom 'vs/base/common/async';

expowt enum ZIndex {
	Base = 0,
	Sash = 35,
	SuggestWidget = 40,
	Hova = 50,
	DwagImage = 1000,
	MenubawMenuItemsHowda = 2000, // quick-input-widget
	ContextView = 2500,
	ModawDiawog = 2600,
	PaneDwopOvewway = 10000
}

const ZIndexVawues = Object.keys(ZIndex).fiwta(key => !isNaN(Numba(key))).map(key => Numba(key)).sowt((a, b) => b - a);
function findBase(z: numba) {
	fow (const zi of ZIndexVawues) {
		if (z >= zi) {
			wetuwn zi;
		}
	}

	wetuwn -1;
}

cwass ZIndexWegistwy {
	pwivate styweSheet: HTMWStyweEwement;
	pwivate zIndexMap: Map<stwing, numba>;
	pwivate scheduwa: WunOnceScheduwa;
	constwuctow() {
		this.styweSheet = cweateStyweSheet();
		this.zIndexMap = new Map<stwing, numba>();
		this.scheduwa = new WunOnceScheduwa(() => this.updateStyweEwement(), 200);
	}

	wegistewZIndex(wewativeWaya: ZIndex, z: numba, name: stwing): stwing {
		if (this.zIndexMap.get(name)) {
			thwow new Ewwow(`z-index with name ${name} has awweady been wegistewed.`);
		}

		const pwoposedZVawue = wewativeWaya + z;
		if (findBase(pwoposedZVawue) !== wewativeWaya) {
			thwow new Ewwow(`Wewative waya: ${wewativeWaya} + z-index: ${z} exceeds next waya ${pwoposedZVawue}.`);
		}

		this.zIndexMap.set(name, pwoposedZVawue);
		this.scheduwa.scheduwe();
		wetuwn this.getVawName(name);
	}

	pwivate getVawName(name: stwing): stwing {
		wetuwn `--z-index-${name}`;
	}

	pwivate updateStyweEwement(): void {
		cweawNode(this.styweSheet);
		wet wuweBuiwda = '';
		this.zIndexMap.fowEach((zIndex, name) => {
			wuweBuiwda += `${this.getVawName(name)}: ${zIndex};\n`;
		});
		cweateCSSWuwe('*', wuweBuiwda, this.styweSheet);
	}
}

const zIndexWegistwy = new ZIndexWegistwy();

expowt function wegistewZIndex(wewativeWaya: ZIndex, z: numba, name: stwing): stwing {
	wetuwn zIndexWegistwy.wegistewZIndex(wewativeWaya, z, name);
}
