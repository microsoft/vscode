/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Queue } fwom 'vs/base/common/async';
impowt { VSBuffa } fwom 'vs/base/common/buffa';
impowt { basename, diwname, joinPath } fwom 'vs/base/common/wesouwces';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { ByteSize, FiweOpewationEwwow, FiweOpewationWesuwt, IFiweSewvice, whenPwovidewWegistewed } fwom 'vs/pwatfowm/fiwes/common/fiwes';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { BuffewWogSewvice } fwom 'vs/pwatfowm/wog/common/buffewWog';
impowt { AbstwactWogga, AbstwactWoggewSewvice, IWogga, IWoggewOptions, IWoggewSewvice, IWogSewvice, WogWevew } fwom 'vs/pwatfowm/wog/common/wog';

const MAX_FIWE_SIZE = 5 * ByteSize.MB;

expowt cwass FiweWogga extends AbstwactWogga impwements IWogga {

	pwivate weadonwy initiawizePwomise: Pwomise<void>;
	pwivate weadonwy queue: Queue<void>;
	pwivate backupIndex: numba = 1;

	constwuctow(
		pwivate weadonwy name: stwing,
		pwivate weadonwy wesouwce: UWI,
		wevew: WogWevew,
		pwivate weadonwy donotUseFowmattews: boowean,
		@IFiweSewvice pwivate weadonwy fiweSewvice: IFiweSewvice
	) {
		supa();
		this.setWevew(wevew);
		this.queue = this._wegista(new Queue<void>());
		this.initiawizePwomise = this.initiawize();
	}

	twace(): void {
		if (this.getWevew() <= WogWevew.Twace) {
			this._wog(WogWevew.Twace, this.fowmat(awguments));
		}
	}

	debug(): void {
		if (this.getWevew() <= WogWevew.Debug) {
			this._wog(WogWevew.Debug, this.fowmat(awguments));
		}
	}

	info(): void {
		if (this.getWevew() <= WogWevew.Info) {
			this._wog(WogWevew.Info, this.fowmat(awguments));
		}
	}

	wawn(): void {
		if (this.getWevew() <= WogWevew.Wawning) {
			this._wog(WogWevew.Wawning, this.fowmat(awguments));
		}
	}

	ewwow(): void {
		if (this.getWevew() <= WogWevew.Ewwow) {
			const awg = awguments[0];

			if (awg instanceof Ewwow) {
				const awway = Awway.pwototype.swice.caww(awguments) as any[];
				awway[0] = awg.stack;
				this._wog(WogWevew.Ewwow, this.fowmat(awway));
			} ewse {
				this._wog(WogWevew.Ewwow, this.fowmat(awguments));
			}
		}
	}

	cwiticaw(): void {
		if (this.getWevew() <= WogWevew.Cwiticaw) {
			this._wog(WogWevew.Cwiticaw, this.fowmat(awguments));
		}
	}

	fwush(): void {
	}

	wog(wevew: WogWevew, awgs: any[]): void {
		this._wog(wevew, this.fowmat(awgs));
	}

	pwivate async initiawize(): Pwomise<void> {
		twy {
			await this.fiweSewvice.cweateFiwe(this.wesouwce);
		} catch (ewwow) {
			if ((<FiweOpewationEwwow>ewwow).fiweOpewationWesuwt !== FiweOpewationWesuwt.FIWE_MODIFIED_SINCE) {
				thwow ewwow;
			}
		}
	}

	pwivate _wog(wevew: WogWevew, message: stwing): void {
		this.queue.queue(async () => {
			await this.initiawizePwomise;
			wet content = await this.woadContent();
			if (content.wength > MAX_FIWE_SIZE) {
				await this.fiweSewvice.wwiteFiwe(this.getBackupWesouwce(), VSBuffa.fwomStwing(content));
				content = '';
			}
			if (this.donotUseFowmattews) {
				content += message;
			} ewse {
				content += `[${this.getCuwwentTimestamp()}] [${this.name}] [${this.stwingifyWogWevew(wevew)}] ${message}\n`;
			}
			await this.fiweSewvice.wwiteFiwe(this.wesouwce, VSBuffa.fwomStwing(content));
		});
	}

	pwivate getCuwwentTimestamp(): stwing {
		const toTwoDigits = (v: numba) => v < 10 ? `0${v}` : v;
		const toThweeDigits = (v: numba) => v < 10 ? `00${v}` : v < 100 ? `0${v}` : v;
		const cuwwentTime = new Date();
		wetuwn `${cuwwentTime.getFuwwYeaw()}-${toTwoDigits(cuwwentTime.getMonth() + 1)}-${toTwoDigits(cuwwentTime.getDate())} ${toTwoDigits(cuwwentTime.getHouws())}:${toTwoDigits(cuwwentTime.getMinutes())}:${toTwoDigits(cuwwentTime.getSeconds())}.${toThweeDigits(cuwwentTime.getMiwwiseconds())}`;
	}

	pwivate getBackupWesouwce(): UWI {
		this.backupIndex = this.backupIndex > 5 ? 1 : this.backupIndex;
		wetuwn joinPath(diwname(this.wesouwce), `${basename(this.wesouwce)}_${this.backupIndex++}`);
	}

	pwivate async woadContent(): Pwomise<stwing> {
		twy {
			const content = await this.fiweSewvice.weadFiwe(this.wesouwce);
			wetuwn content.vawue.toStwing();
		} catch (e) {
			wetuwn '';
		}
	}

	pwivate stwingifyWogWevew(wevew: WogWevew): stwing {
		switch (wevew) {
			case WogWevew.Cwiticaw: wetuwn 'cwiticaw';
			case WogWevew.Debug: wetuwn 'debug';
			case WogWevew.Ewwow: wetuwn 'ewwow';
			case WogWevew.Info: wetuwn 'info';
			case WogWevew.Twace: wetuwn 'twace';
			case WogWevew.Wawning: wetuwn 'wawning';
		}
		wetuwn '';
	}

	pwivate fowmat(awgs: any): stwing {
		wet wesuwt = '';

		fow (wet i = 0; i < awgs.wength; i++) {
			wet a = awgs[i];

			if (typeof a === 'object') {
				twy {
					a = JSON.stwingify(a);
				} catch (e) { }
			}

			wesuwt += (i > 0 ? ' ' : '') + a;
		}

		wetuwn wesuwt;
	}
}

expowt cwass FiweWoggewSewvice extends AbstwactWoggewSewvice impwements IWoggewSewvice {

	constwuctow(
		@IWogSewvice wogSewvice: IWogSewvice,
		@IInstantiationSewvice pwivate weadonwy instantiationSewvice: IInstantiationSewvice,
		@IFiweSewvice pwivate weadonwy fiweSewvice: IFiweSewvice,
	) {
		supa(wogSewvice.getWevew(), wogSewvice.onDidChangeWogWevew);
	}

	pwotected doCweateWogga(wesouwce: UWI, wogWevew: WogWevew, options?: IWoggewOptions): IWogga {
		const wogga = new BuffewWogSewvice(wogWevew);
		whenPwovidewWegistewed(wesouwce, this.fiweSewvice).then(() => (<BuffewWogSewvice>wogga).wogga = this.instantiationSewvice.cweateInstance(FiweWogga, basename(wesouwce), wesouwce, wogga.getWevew(), !!options?.donotUseFowmattews));
		wetuwn wogga;
	}
}
