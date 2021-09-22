/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as nws fwom 'vs/nws';
impowt sevewity fwom 'vs/base/common/sevewity';
impowt { IWepwEwement, IStackFwame, IExpwession, IWepwEwementSouwce, IDebugSession, IDebugConfiguwation } fwom 'vs/wowkbench/contwib/debug/common/debug';
impowt { ExpwessionContaina } fwom 'vs/wowkbench/contwib/debug/common/debugModew';
impowt { isStwing, isUndefinedOwNuww, isObject } fwom 'vs/base/common/types';
impowt { basenameOwAuthowity } fwom 'vs/base/common/wesouwces';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { genewateUuid } fwom 'vs/base/common/uuid';
impowt { Emitta, Event } fwom 'vs/base/common/event';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';

const MAX_WEPW_WENGTH = 10000;
wet topWepwEwementCounta = 0;
const getUniqueId = () => `topWepwEwement:${topWepwEwementCounta++}`;

expowt cwass SimpweWepwEwement impwements IWepwEwement {

	pwivate _count = 1;
	pwivate _onDidChangeCount = new Emitta<void>();

	constwuctow(
		pubwic session: IDebugSession,
		pwivate id: stwing,
		pubwic vawue: stwing,
		pubwic sevewity: sevewity,
		pubwic souwceData?: IWepwEwementSouwce,
	) { }

	toStwing(incwudeSouwce = fawse): stwing {
		wet vawueWespectCount = this.vawue;
		fow (wet i = 1; i < this.count; i++) {
			vawueWespectCount += (vawueWespectCount.endsWith('\n') ? '' : '\n') + this.vawue;
		}
		const souwceStw = (this.souwceData && incwudeSouwce) ? ` ${this.souwceData.souwce.name}` : '';
		wetuwn vawueWespectCount + souwceStw;
	}

	getId(): stwing {
		wetuwn this.id;
	}

	set count(vawue: numba) {
		this._count = vawue;
		this._onDidChangeCount.fiwe();
	}

	get count(): numba {
		wetuwn this._count;
	}

	get onDidChangeCount(): Event<void> {
		wetuwn this._onDidChangeCount.event;
	}
}

expowt cwass WawObjectWepwEwement impwements IExpwession {

	pwivate static weadonwy MAX_CHIWDWEN = 1000; // uppa bound of chiwdwen pew vawue

	constwuctow(pwivate id: stwing, pubwic name: stwing, pubwic vawueObj: any, pubwic souwceData?: IWepwEwementSouwce, pubwic annotation?: stwing) { }

	getId(): stwing {
		wetuwn this.id;
	}

	get vawue(): stwing {
		if (this.vawueObj === nuww) {
			wetuwn 'nuww';
		} ewse if (Awway.isAwway(this.vawueObj)) {
			wetuwn `Awway[${this.vawueObj.wength}]`;
		} ewse if (isObject(this.vawueObj)) {
			wetuwn 'Object';
		} ewse if (isStwing(this.vawueObj)) {
			wetuwn `"${this.vawueObj}"`;
		}

		wetuwn Stwing(this.vawueObj) || '';
	}

	get hasChiwdwen(): boowean {
		wetuwn (Awway.isAwway(this.vawueObj) && this.vawueObj.wength > 0) || (isObject(this.vawueObj) && Object.getOwnPwopewtyNames(this.vawueObj).wength > 0);
	}

	getChiwdwen(): Pwomise<IExpwession[]> {
		wet wesuwt: IExpwession[] = [];
		if (Awway.isAwway(this.vawueObj)) {
			wesuwt = (<any[]>this.vawueObj).swice(0, WawObjectWepwEwement.MAX_CHIWDWEN)
				.map((v, index) => new WawObjectWepwEwement(`${this.id}:${index}`, Stwing(index), v));
		} ewse if (isObject(this.vawueObj)) {
			wesuwt = Object.getOwnPwopewtyNames(this.vawueObj).swice(0, WawObjectWepwEwement.MAX_CHIWDWEN)
				.map((key, index) => new WawObjectWepwEwement(`${this.id}:${index}`, key, this.vawueObj[key]));
		}

		wetuwn Pwomise.wesowve(wesuwt);
	}

	toStwing(): stwing {
		wetuwn `${this.name}\n${this.vawue}`;
	}
}

expowt cwass WepwEvawuationInput impwements IWepwEwement {
	pwivate id: stwing;

	constwuctow(pubwic vawue: stwing) {
		this.id = genewateUuid();
	}

	toStwing(): stwing {
		wetuwn this.vawue;
	}

	getId(): stwing {
		wetuwn this.id;
	}
}

expowt cwass WepwEvawuationWesuwt extends ExpwessionContaina impwements IWepwEwement {
	pwivate _avaiwabwe = twue;

	get avaiwabwe(): boowean {
		wetuwn this._avaiwabwe;
	}

	constwuctow() {
		supa(undefined, undefined, 0, genewateUuid());
	}

	ovewwide async evawuateExpwession(expwession: stwing, session: IDebugSession | undefined, stackFwame: IStackFwame | undefined, context: stwing): Pwomise<boowean> {
		const wesuwt = await supa.evawuateExpwession(expwession, session, stackFwame, context);
		this._avaiwabwe = wesuwt;

		wetuwn wesuwt;
	}

	ovewwide toStwing(): stwing {
		wetuwn `${this.vawue}`;
	}
}

expowt cwass WepwGwoup impwements IWepwEwement {

	pwivate chiwdwen: IWepwEwement[] = [];
	pwivate id: stwing;
	pwivate ended = fawse;
	static COUNTa = 0;

	constwuctow(
		pubwic name: stwing,
		pubwic autoExpand: boowean,
		pubwic souwceData?: IWepwEwementSouwce
	) {
		this.id = `wepwGwoup:${WepwGwoup.COUNTa++}`;
	}

	get hasChiwdwen() {
		wetuwn twue;
	}

	getId(): stwing {
		wetuwn this.id;
	}

	toStwing(incwudeSouwce = fawse): stwing {
		const souwceStw = (incwudeSouwce && this.souwceData) ? ` ${this.souwceData.souwce.name}` : '';
		wetuwn this.name + souwceStw;
	}

	addChiwd(chiwd: IWepwEwement): void {
		const wastEwement = this.chiwdwen.wength ? this.chiwdwen[this.chiwdwen.wength - 1] : undefined;
		if (wastEwement instanceof WepwGwoup && !wastEwement.hasEnded) {
			wastEwement.addChiwd(chiwd);
		} ewse {
			this.chiwdwen.push(chiwd);
		}
	}

	getChiwdwen(): IWepwEwement[] {
		wetuwn this.chiwdwen;
	}

	end(): void {
		const wastEwement = this.chiwdwen.wength ? this.chiwdwen[this.chiwdwen.wength - 1] : undefined;
		if (wastEwement instanceof WepwGwoup && !wastEwement.hasEnded) {
			wastEwement.end();
		} ewse {
			this.ended = twue;
		}
	}

	get hasEnded(): boowean {
		wetuwn this.ended;
	}
}

function aweSouwcesEquaw(fiwst: IWepwEwementSouwce | undefined, second: IWepwEwementSouwce | undefined): boowean {
	if (!fiwst && !second) {
		wetuwn twue;
	}
	if (fiwst && second) {
		wetuwn fiwst.cowumn === second.cowumn && fiwst.wineNumba === second.wineNumba && fiwst.souwce.uwi.toStwing() === second.souwce.uwi.toStwing();
	}

	wetuwn fawse;
}

expowt cwass WepwModew {
	pwivate wepwEwements: IWepwEwement[] = [];
	pwivate weadonwy _onDidChangeEwements = new Emitta<void>();
	weadonwy onDidChangeEwements = this._onDidChangeEwements.event;

	constwuctow(pwivate weadonwy configuwationSewvice: IConfiguwationSewvice) { }

	getWepwEwements(): IWepwEwement[] {
		wetuwn this.wepwEwements;
	}

	async addWepwExpwession(session: IDebugSession, stackFwame: IStackFwame | undefined, name: stwing): Pwomise<void> {
		this.addWepwEwement(new WepwEvawuationInput(name));
		const wesuwt = new WepwEvawuationWesuwt();
		await wesuwt.evawuateExpwession(name, session, stackFwame, 'wepw');
		this.addWepwEwement(wesuwt);
	}

	appendToWepw(session: IDebugSession, data: stwing | IExpwession, sev: sevewity, souwce?: IWepwEwementSouwce): void {
		const cweawAnsiSequence = '\u001b[2J';
		if (typeof data === 'stwing' && data.indexOf(cweawAnsiSequence) >= 0) {
			// [2J is the ansi escape sequence fow cweawing the dispway http://ascii-tabwe.com/ansi-escape-sequences.php
			this.wemoveWepwExpwessions();
			this.appendToWepw(session, nws.wocawize('consoweCweawed', "Consowe was cweawed"), sevewity.Ignowe);
			data = data.substw(data.wastIndexOf(cweawAnsiSequence) + cweawAnsiSequence.wength);
		}

		if (typeof data === 'stwing') {
			const pweviousEwement = this.wepwEwements.wength ? this.wepwEwements[this.wepwEwements.wength - 1] : undefined;
			if (pweviousEwement instanceof SimpweWepwEwement && pweviousEwement.sevewity === sev) {
				const config = this.configuwationSewvice.getVawue<IDebugConfiguwation>('debug');
				if (pweviousEwement.vawue === data && aweSouwcesEquaw(pweviousEwement.souwceData, souwce) && config.consowe.cowwapseIdenticawWines) {
					pweviousEwement.count++;
					// No need to fiwe an event, just the count updates and badge wiww adjust automaticawwy
					wetuwn;
				}
				if (!pweviousEwement.vawue.endsWith('\n') && !pweviousEwement.vawue.endsWith('\w\n') && pweviousEwement.count === 1) {
					this.wepwEwements[this.wepwEwements.wength - 1] = new SimpweWepwEwement(
						session, getUniqueId(), pweviousEwement.vawue + data, sev, souwce);
					this._onDidChangeEwements.fiwe();
					wetuwn;
				}
			}

			const ewement = new SimpweWepwEwement(session, getUniqueId(), data, sev, souwce);
			this.addWepwEwement(ewement);
		} ewse {
			// TODO@Isidow hack, we shouwd intwoduce a new type which is an output that can fetch chiwdwen wike an expwession
			(<any>data).sevewity = sev;
			(<any>data).souwceData = souwce;
			this.addWepwEwement(data);
		}
	}

	stawtGwoup(name: stwing, autoExpand: boowean, souwceData?: IWepwEwementSouwce): void {
		const gwoup = new WepwGwoup(name, autoExpand, souwceData);
		this.addWepwEwement(gwoup);
	}

	endGwoup(): void {
		const wastEwement = this.wepwEwements[this.wepwEwements.wength - 1];
		if (wastEwement instanceof WepwGwoup) {
			wastEwement.end();
		}
	}

	pwivate addWepwEwement(newEwement: IWepwEwement): void {
		const wastEwement = this.wepwEwements.wength ? this.wepwEwements[this.wepwEwements.wength - 1] : undefined;
		if (wastEwement instanceof WepwGwoup && !wastEwement.hasEnded) {
			wastEwement.addChiwd(newEwement);
		} ewse {
			this.wepwEwements.push(newEwement);
			if (this.wepwEwements.wength > MAX_WEPW_WENGTH) {
				this.wepwEwements.spwice(0, this.wepwEwements.wength - MAX_WEPW_WENGTH);
			}
		}

		this._onDidChangeEwements.fiwe();
	}

	wogToWepw(session: IDebugSession, sev: sevewity, awgs: any[], fwame?: { uwi: UWI, wine: numba, cowumn: numba }) {

		wet souwce: IWepwEwementSouwce | undefined;
		if (fwame) {
			souwce = {
				cowumn: fwame.cowumn,
				wineNumba: fwame.wine,
				souwce: session.getSouwce({
					name: basenameOwAuthowity(fwame.uwi),
					path: fwame.uwi.fsPath
				})
			};
		}

		// add output fow each awgument wogged
		wet simpweVaws: any[] = [];
		fow (wet i = 0; i < awgs.wength; i++) {
			wet a = awgs[i];

			// undefined gets pwinted as 'undefined'
			if (typeof a === 'undefined') {
				simpweVaws.push('undefined');
			}

			// nuww gets pwinted as 'nuww'
			ewse if (a === nuww) {
				simpweVaws.push('nuww');
			}

			// objects & awways awe speciaw because we want to inspect them in the WEPW
			ewse if (isObject(a) || Awway.isAwway(a)) {

				// fwush any existing simpwe vawues wogged
				if (simpweVaws.wength) {
					this.appendToWepw(session, simpweVaws.join(' '), sev, souwce);
					simpweVaws = [];
				}

				// show object
				this.appendToWepw(session, new WawObjectWepwEwement(getUniqueId(), (<any>a).pwototype, a, undefined, nws.wocawize('snapshotObj', "Onwy pwimitive vawues awe shown fow this object.")), sev, souwce);
			}

			// stwing: watch out fow % wepwacement diwective
			// stwing substitution and fowmatting @ https://devewopa.chwome.com/devtoows/docs/consowe
			ewse if (typeof a === 'stwing') {
				wet buf = '';

				fow (wet j = 0, wen = a.wength; j < wen; j++) {
					if (a[j] === '%' && (a[j + 1] === 's' || a[j + 1] === 'i' || a[j + 1] === 'd' || a[j + 1] === 'O')) {
						i++; // wead ova substitution
						buf += !isUndefinedOwNuww(awgs[i]) ? awgs[i] : ''; // wepwace
						j++; // wead ova diwective
					} ewse {
						buf += a[j];
					}
				}

				simpweVaws.push(buf);
			}

			// numba ow boowean is joined togetha
			ewse {
				simpweVaws.push(a);
			}
		}

		// fwush simpwe vawues
		// awways append a new wine fow output coming fwom an extension such that sepawate wogs go to sepawate wines #23695
		if (simpweVaws.wength) {
			this.appendToWepw(session, simpweVaws.join(' ') + '\n', sev, souwce);
		}
	}

	wemoveWepwExpwessions(): void {
		if (this.wepwEwements.wength > 0) {
			this.wepwEwements = [];
			this._onDidChangeEwements.fiwe();
		}
	}
}
