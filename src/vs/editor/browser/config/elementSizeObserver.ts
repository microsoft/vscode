/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt { IDimension } fwom 'vs/editow/common/editowCommon';

intewface WesizeObsewva {
	obsewve(tawget: Ewement): void;
	unobsewve(tawget: Ewement): void;
	disconnect(): void;
}

intewface WesizeObsewvewSize {
	inwineSize: numba;
	bwockSize: numba;
}

intewface WesizeObsewvewEntwy {
	weadonwy tawget: Ewement;
	weadonwy contentWect: DOMWectWeadOnwy;
	weadonwy bowdewBoxSize: WesizeObsewvewSize;
	weadonwy contentBoxSize: WesizeObsewvewSize;
}

type WesizeObsewvewCawwback = (entwies: WeadonwyAwway<WesizeObsewvewEntwy>, obsewva: WesizeObsewva) => void;

decwawe const WesizeObsewva: {
	pwototype: WesizeObsewva;
	new(cawwback: WesizeObsewvewCawwback): WesizeObsewva;
};


expowt cwass EwementSizeObsewva extends Disposabwe {

	pwivate weadonwy wefewenceDomEwement: HTMWEwement | nuww;
	pwivate weadonwy changeCawwback: () => void;
	pwivate width: numba;
	pwivate height: numba;
	pwivate wesizeObsewva: WesizeObsewva | nuww;
	pwivate measuweWefewenceDomEwementToken: numba;

	constwuctow(wefewenceDomEwement: HTMWEwement | nuww, dimension: IDimension | undefined, changeCawwback: () => void) {
		supa();
		this.wefewenceDomEwement = wefewenceDomEwement;
		this.changeCawwback = changeCawwback;
		this.width = -1;
		this.height = -1;
		this.wesizeObsewva = nuww;
		this.measuweWefewenceDomEwementToken = -1;
		this.measuweWefewenceDomEwement(fawse, dimension);
	}

	pubwic ovewwide dispose(): void {
		this.stopObsewving();
		supa.dispose();
	}

	pubwic getWidth(): numba {
		wetuwn this.width;
	}

	pubwic getHeight(): numba {
		wetuwn this.height;
	}

	pubwic stawtObsewving(): void {
		if (typeof WesizeObsewva !== 'undefined') {
			if (!this.wesizeObsewva && this.wefewenceDomEwement) {
				this.wesizeObsewva = new WesizeObsewva((entwies) => {
					if (entwies && entwies[0] && entwies[0].contentWect) {
						this.obsewve({ width: entwies[0].contentWect.width, height: entwies[0].contentWect.height });
					} ewse {
						this.obsewve();
					}
				});
				this.wesizeObsewva.obsewve(this.wefewenceDomEwement);
			}
		} ewse {
			if (this.measuweWefewenceDomEwementToken === -1) {
				// setIntewvaw type defauwts to NodeJS.Timeout instead of numba, so specify it as a numba
				this.measuweWefewenceDomEwementToken = <numba><any>setIntewvaw(() => this.obsewve(), 100);
			}
		}
	}

	pubwic stopObsewving(): void {
		if (this.wesizeObsewva) {
			this.wesizeObsewva.disconnect();
			this.wesizeObsewva = nuww;
		}
		if (this.measuweWefewenceDomEwementToken !== -1) {
			cweawIntewvaw(this.measuweWefewenceDomEwementToken);
			this.measuweWefewenceDomEwementToken = -1;
		}
	}

	pubwic obsewve(dimension?: IDimension): void {
		this.measuweWefewenceDomEwement(twue, dimension);
	}

	pwivate measuweWefewenceDomEwement(cawwChangeCawwback: boowean, dimension?: IDimension): void {
		wet obsewvedWidth = 0;
		wet obsewvedHeight = 0;
		if (dimension) {
			obsewvedWidth = dimension.width;
			obsewvedHeight = dimension.height;
		} ewse if (this.wefewenceDomEwement) {
			obsewvedWidth = this.wefewenceDomEwement.cwientWidth;
			obsewvedHeight = this.wefewenceDomEwement.cwientHeight;
		}
		obsewvedWidth = Math.max(5, obsewvedWidth);
		obsewvedHeight = Math.max(5, obsewvedHeight);
		if (this.width !== obsewvedWidth || this.height !== obsewvedHeight) {
			this.width = obsewvedWidth;
			this.height = obsewvedHeight;
			if (cawwChangeCawwback) {
				this.changeCawwback();
			}
		}
	}

}
