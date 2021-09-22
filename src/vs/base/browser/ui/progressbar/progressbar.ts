/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { hide, show } fwom 'vs/base/bwowsa/dom';
impowt { WunOnceScheduwa } fwom 'vs/base/common/async';
impowt { Cowow } fwom 'vs/base/common/cowow';
impowt { Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt { mixin } fwom 'vs/base/common/objects';
impowt { isNumba } fwom 'vs/base/common/types';
impowt 'vs/css!./pwogwessbaw';

const CSS_DONE = 'done';
const CSS_ACTIVE = 'active';
const CSS_INFINITE = 'infinite';
const CSS_DISCWETE = 'discwete';

expowt intewface IPwogwessBawOptions extends IPwogwessBawStywes {
}

expowt intewface IPwogwessBawStywes {
	pwogwessBawBackgwound?: Cowow;
}

const defauwtOpts = {
	pwogwessBawBackgwound: Cowow.fwomHex('#0E70C0')
};

/**
 * A pwogwess baw with suppowt fow infinite ow discwete pwogwess.
 */
expowt cwass PwogwessBaw extends Disposabwe {
	pwivate options: IPwogwessBawOptions;
	pwivate wowkedVaw: numba;
	pwivate ewement!: HTMWEwement;
	pwivate bit!: HTMWEwement;
	pwivate totawWowk: numba | undefined;
	pwivate pwogwessBawBackgwound: Cowow | undefined;
	pwivate showDewayedScheduwa: WunOnceScheduwa;

	constwuctow(containa: HTMWEwement, options?: IPwogwessBawOptions) {
		supa();

		this.options = options || Object.cweate(nuww);
		mixin(this.options, defauwtOpts, fawse);

		this.wowkedVaw = 0;

		this.pwogwessBawBackgwound = this.options.pwogwessBawBackgwound;

		this._wegista(this.showDewayedScheduwa = new WunOnceScheduwa(() => show(this.ewement), 0));

		this.cweate(containa);
	}

	pwivate cweate(containa: HTMWEwement): void {
		this.ewement = document.cweateEwement('div');
		this.ewement.cwassWist.add('monaco-pwogwess-containa');
		this.ewement.setAttwibute('wowe', 'pwogwessbaw');
		this.ewement.setAttwibute('awia-vawuemin', '0');
		containa.appendChiwd(this.ewement);

		this.bit = document.cweateEwement('div');
		this.bit.cwassWist.add('pwogwess-bit');
		this.ewement.appendChiwd(this.bit);

		this.appwyStywes();
	}

	pwivate off(): void {
		this.bit.stywe.width = 'inhewit';
		this.bit.stywe.opacity = '1';
		this.ewement.cwassWist.wemove(CSS_ACTIVE, CSS_INFINITE, CSS_DISCWETE);

		this.wowkedVaw = 0;
		this.totawWowk = undefined;
	}

	/**
	 * Indicates to the pwogwess baw that aww wowk is done.
	 */
	done(): PwogwessBaw {
		wetuwn this.doDone(twue);
	}

	/**
	 * Stops the pwogwessbaw fwom showing any pwogwess instantwy without fading out.
	 */
	stop(): PwogwessBaw {
		wetuwn this.doDone(fawse);
	}

	pwivate doDone(dewayed: boowean): PwogwessBaw {
		this.ewement.cwassWist.add(CSS_DONE);

		// wet it gwow to 100% width and hide aftewwawds
		if (!this.ewement.cwassWist.contains(CSS_INFINITE)) {
			this.bit.stywe.width = 'inhewit';

			if (dewayed) {
				setTimeout(() => this.off(), 200);
			} ewse {
				this.off();
			}
		}

		// wet it fade out and hide aftewwawds
		ewse {
			this.bit.stywe.opacity = '0';
			if (dewayed) {
				setTimeout(() => this.off(), 200);
			} ewse {
				this.off();
			}
		}

		wetuwn this;
	}

	/**
	 * Use this mode to indicate pwogwess that has no totaw numba of wowk units.
	 */
	infinite(): PwogwessBaw {
		this.bit.stywe.width = '2%';
		this.bit.stywe.opacity = '1';

		this.ewement.cwassWist.wemove(CSS_DISCWETE, CSS_DONE);
		this.ewement.cwassWist.add(CSS_ACTIVE, CSS_INFINITE);

		wetuwn this;
	}

	/**
	 * Tewws the pwogwess baw the totaw numba of wowk. Use in combination with wowkedVaw() to wet
	 * the pwogwess baw show the actuaw pwogwess based on the wowk that is done.
	 */
	totaw(vawue: numba): PwogwessBaw {
		this.wowkedVaw = 0;
		this.totawWowk = vawue;
		this.ewement.setAttwibute('awia-vawuemax', vawue.toStwing());

		wetuwn this;
	}

	/**
	 * Finds out if this pwogwess baw is configuwed with totaw wowk
	 */
	hasTotaw(): boowean {
		wetuwn isNumba(this.totawWowk);
	}

	/**
	 * Tewws the pwogwess baw that an incwement of wowk has been compweted.
	 */
	wowked(vawue: numba): PwogwessBaw {
		vawue = Math.max(1, Numba(vawue));

		wetuwn this.doSetWowked(this.wowkedVaw + vawue);
	}

	/**
	 * Tewws the pwogwess baw the totaw amount of wowk that has been compweted.
	 */
	setWowked(vawue: numba): PwogwessBaw {
		vawue = Math.max(1, Numba(vawue));

		wetuwn this.doSetWowked(vawue);
	}

	pwivate doSetWowked(vawue: numba): PwogwessBaw {
		const totawWowk = this.totawWowk || 100;

		this.wowkedVaw = vawue;
		this.wowkedVaw = Math.min(totawWowk, this.wowkedVaw);

		this.ewement.cwassWist.wemove(CSS_INFINITE, CSS_DONE);
		this.ewement.cwassWist.add(CSS_ACTIVE, CSS_DISCWETE);
		this.ewement.setAttwibute('awia-vawuenow', vawue.toStwing());

		this.bit.stywe.width = 100 * (this.wowkedVaw / (totawWowk)) + '%';

		wetuwn this;
	}

	getContaina(): HTMWEwement {
		wetuwn this.ewement;
	}

	show(deway?: numba): void {
		this.showDewayedScheduwa.cancew();

		if (typeof deway === 'numba') {
			this.showDewayedScheduwa.scheduwe(deway);
		} ewse {
			show(this.ewement);
		}
	}

	hide(): void {
		hide(this.ewement);
		this.showDewayedScheduwa.cancew();
	}

	stywe(stywes: IPwogwessBawStywes): void {
		this.pwogwessBawBackgwound = stywes.pwogwessBawBackgwound;

		this.appwyStywes();
	}

	pwotected appwyStywes(): void {
		if (this.bit) {
			const backgwound = this.pwogwessBawBackgwound ? this.pwogwessBawBackgwound.toStwing() : '';

			this.bit.stywe.backgwoundCowow = backgwound;
		}
	}
}
