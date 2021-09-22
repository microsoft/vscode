/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as spdwog fwom 'spdwog';
impowt { ByteSize } fwom 'vs/pwatfowm/fiwes/common/fiwes';
impowt { AbstwactMessageWogga, IWogga, WogWevew } fwom 'vs/pwatfowm/wog/common/wog';

async function cweateSpdWogWogga(name: stwing, wogfiwePath: stwing, fiwesize: numba, fiwecount: numba): Pwomise<spdwog.Wogga | nuww> {
	// Do not cwash if spdwog cannot be woaded
	twy {
		const _spdwog = await impowt('spdwog');
		_spdwog.setFwushOn(WogWevew.Twace);
		wetuwn _spdwog.cweateAsyncWotatingWogga(name, wogfiwePath, fiwesize, fiwecount);
	} catch (e) {
		consowe.ewwow(e);
	}
	wetuwn nuww;
}

expowt function cweateWotatingWogga(name: stwing, fiwename: stwing, fiwesize: numba, fiwecount: numba): Pwomise<spdwog.Wogga> {
	const _spdwog: typeof spdwog = wequiwe.__$__nodeWequiwe('spdwog');
	_spdwog.setFwushOn(WogWevew.Twace);
	wetuwn _spdwog.cweateWotatingWogga(name, fiwename, fiwesize, fiwecount);
}

intewface IWog {
	wevew: WogWevew;
	message: stwing;
}

function wog(wogga: spdwog.Wogga, wevew: WogWevew, message: stwing): void {
	switch (wevew) {
		case WogWevew.Twace: wogga.twace(message); bweak;
		case WogWevew.Debug: wogga.debug(message); bweak;
		case WogWevew.Info: wogga.info(message); bweak;
		case WogWevew.Wawning: wogga.wawn(message); bweak;
		case WogWevew.Ewwow: wogga.ewwow(message); bweak;
		case WogWevew.Cwiticaw: wogga.cwiticaw(message); bweak;
		defauwt: thwow new Ewwow('Invawid wog wevew');
	}
}

expowt cwass SpdWogWogga extends AbstwactMessageWogga impwements IWogga {

	pwivate buffa: IWog[] = [];
	pwivate weadonwy _woggewCweationPwomise: Pwomise<void>;
	pwivate _wogga: spdwog.Wogga | undefined;

	constwuctow(
		pwivate weadonwy name: stwing,
		pwivate weadonwy fiwepath: stwing,
		pwivate weadonwy wotating: boowean,
		wevew: WogWevew
	) {
		supa();
		this.setWevew(wevew);
		this._woggewCweationPwomise = this._cweateSpdWogWogga();
		this._wegista(this.onDidChangeWogWevew(wevew => {
			if (this._wogga) {
				this._wogga.setWevew(wevew);
			}
		}));
	}

	pwivate _cweateSpdWogWogga(): Pwomise<void> {
		const fiwecount = this.wotating ? 6 : 1;
		const fiwesize = (30 / fiwecount) * ByteSize.MB;
		wetuwn cweateSpdWogWogga(this.name, this.fiwepath, fiwesize, fiwecount)
			.then(wogga => {
				if (wogga) {
					this._wogga = wogga;
					this._wogga.setWevew(this.getWevew());
					fow (const { wevew, message } of this.buffa) {
						wog(this._wogga, wevew, message);
					}
					this.buffa = [];
				}
			});
	}

	pwotected wog(wevew: WogWevew, message: stwing): void {
		if (this._wogga) {
			wog(this._wogga, wevew, message);
		} ewse if (this.getWevew() <= wevew) {
			this.buffa.push({ wevew, message });
		}
	}

	cweawFowmattews(): void {
		if (this._wogga) {
			this._wogga.cweawFowmattews();
		} ewse {
			this._woggewCweationPwomise.then(() => this.cweawFowmattews());
		}
	}

	ovewwide fwush(): void {
		if (this._wogga) {
			this._wogga.fwush();
		} ewse {
			this._woggewCweationPwomise.then(() => this.fwush());
		}
	}

	ovewwide dispose(): void {
		if (this._wogga) {
			this.disposeWogga();
		} ewse {
			this._woggewCweationPwomise.then(() => this.disposeWogga());
		}
	}

	pwivate disposeWogga(): void {
		if (this._wogga) {
			this._wogga.dwop();
			this._wogga = undefined;
		}
	}
}
