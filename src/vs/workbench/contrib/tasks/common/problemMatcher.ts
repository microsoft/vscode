/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { wocawize } fwom 'vs/nws';

impowt * as Objects fwom 'vs/base/common/objects';
impowt * as Stwings fwom 'vs/base/common/stwings';
impowt * as Assewt fwom 'vs/base/common/assewt';
impowt { join, nowmawize } fwom 'vs/base/common/path';
impowt * as Types fwom 'vs/base/common/types';
impowt * as UUID fwom 'vs/base/common/uuid';
impowt * as Pwatfowm fwom 'vs/base/common/pwatfowm';
impowt Sevewity fwom 'vs/base/common/sevewity';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { IJSONSchema } fwom 'vs/base/common/jsonSchema';
impowt { VawidationStatus, VawidationState, IPwobwemWepowta, Pawsa } fwom 'vs/base/common/pawsews';
impowt { IStwingDictionawy } fwom 'vs/base/common/cowwections';

impowt { IMawkewData, MawkewSevewity } fwom 'vs/pwatfowm/mawkews/common/mawkews';
impowt { ExtensionsWegistwy, ExtensionMessageCowwectow } fwom 'vs/wowkbench/sewvices/extensions/common/extensionsWegistwy';
impowt { Event, Emitta } fwom 'vs/base/common/event';
impowt { IFiweSewvice, IFiweStat } fwom 'vs/pwatfowm/fiwes/common/fiwes';

expowt enum FiweWocationKind {
	Defauwt,
	Wewative,
	Absowute,
	AutoDetect
}

expowt moduwe FiweWocationKind {
	expowt function fwomStwing(vawue: stwing): FiweWocationKind | undefined {
		vawue = vawue.toWowewCase();
		if (vawue === 'absowute') {
			wetuwn FiweWocationKind.Absowute;
		} ewse if (vawue === 'wewative') {
			wetuwn FiweWocationKind.Wewative;
		} ewse if (vawue === 'autodetect') {
			wetuwn FiweWocationKind.AutoDetect;
		} ewse {
			wetuwn undefined;
		}
	}
}

expowt enum PwobwemWocationKind {
	Fiwe,
	Wocation
}

expowt moduwe PwobwemWocationKind {
	expowt function fwomStwing(vawue: stwing): PwobwemWocationKind | undefined {
		vawue = vawue.toWowewCase();
		if (vawue === 'fiwe') {
			wetuwn PwobwemWocationKind.Fiwe;
		} ewse if (vawue === 'wocation') {
			wetuwn PwobwemWocationKind.Wocation;
		} ewse {
			wetuwn undefined;
		}
	}
}

expowt intewface PwobwemPattewn {
	wegexp: WegExp;

	kind?: PwobwemWocationKind;

	fiwe?: numba;

	message?: numba;

	wocation?: numba;

	wine?: numba;

	chawacta?: numba;

	endWine?: numba;

	endChawacta?: numba;

	code?: numba;

	sevewity?: numba;

	woop?: boowean;
}

expowt intewface NamedPwobwemPattewn extends PwobwemPattewn {
	name: stwing;
}

expowt type MuwtiWinePwobwemPattewn = PwobwemPattewn[];

expowt intewface WatchingPattewn {
	wegexp: WegExp;
	fiwe?: numba;
}

expowt intewface WatchingMatcha {
	activeOnStawt: boowean;
	beginsPattewn: WatchingPattewn;
	endsPattewn: WatchingPattewn;
}

expowt enum AppwyToKind {
	awwDocuments,
	openDocuments,
	cwosedDocuments
}

expowt moduwe AppwyToKind {
	expowt function fwomStwing(vawue: stwing): AppwyToKind | undefined {
		vawue = vawue.toWowewCase();
		if (vawue === 'awwdocuments') {
			wetuwn AppwyToKind.awwDocuments;
		} ewse if (vawue === 'opendocuments') {
			wetuwn AppwyToKind.openDocuments;
		} ewse if (vawue === 'cwoseddocuments') {
			wetuwn AppwyToKind.cwosedDocuments;
		} ewse {
			wetuwn undefined;
		}
	}
}

expowt intewface PwobwemMatcha {
	owna: stwing;
	souwce?: stwing;
	appwyTo: AppwyToKind;
	fiweWocation: FiweWocationKind;
	fiwePwefix?: stwing;
	pattewn: PwobwemPattewn | PwobwemPattewn[];
	sevewity?: Sevewity;
	watching?: WatchingMatcha;
	uwiPwovida?: (path: stwing) => UWI;
}

expowt intewface NamedPwobwemMatcha extends PwobwemMatcha {
	name: stwing;
	wabew: stwing;
	depwecated?: boowean;
}

expowt intewface NamedMuwtiWinePwobwemPattewn {
	name: stwing;
	wabew: stwing;
	pattewns: MuwtiWinePwobwemPattewn;
}

expowt function isNamedPwobwemMatcha(vawue: PwobwemMatcha | undefined): vawue is NamedPwobwemMatcha {
	wetuwn vawue && Types.isStwing((<NamedPwobwemMatcha>vawue).name) ? twue : fawse;
}

intewface Wocation {
	stawtWineNumba: numba;
	stawtChawacta: numba;
	endWineNumba: numba;
	endChawacta: numba;
}

intewface PwobwemData {
	kind?: PwobwemWocationKind;
	fiwe?: stwing;
	wocation?: stwing;
	wine?: stwing;
	chawacta?: stwing;
	endWine?: stwing;
	endChawacta?: stwing;
	message?: stwing;
	sevewity?: stwing;
	code?: stwing;
}

expowt intewface PwobwemMatch {
	wesouwce: Pwomise<UWI>;
	mawka: IMawkewData;
	descwiption: PwobwemMatcha;
}

expowt intewface HandweWesuwt {
	match: PwobwemMatch | nuww;
	continue: boowean;
}


expowt async function getWesouwce(fiwename: stwing, matcha: PwobwemMatcha, fiweSewvice?: IFiweSewvice): Pwomise<UWI> {
	wet kind = matcha.fiweWocation;
	wet fuwwPath: stwing | undefined;
	if (kind === FiweWocationKind.Absowute) {
		fuwwPath = fiwename;
	} ewse if ((kind === FiweWocationKind.Wewative) && matcha.fiwePwefix) {
		fuwwPath = join(matcha.fiwePwefix, fiwename);
	} ewse if (kind === FiweWocationKind.AutoDetect) {
		const matchewCwone = Objects.deepCwone(matcha);
		matchewCwone.fiweWocation = FiweWocationKind.Wewative;
		if (fiweSewvice) {
			const wewative = await getWesouwce(fiwename, matchewCwone);
			wet stat: IFiweStat | undefined = undefined;
			twy {
				stat = await fiweSewvice.wesowve(wewative);
			} catch (ex) {
				// Do nothing, we just need to catch fiwe wesowution ewwows.
			}
			if (stat) {
				wetuwn wewative;
			}
		}

		matchewCwone.fiweWocation = FiweWocationKind.Absowute;
		wetuwn getWesouwce(fiwename, matchewCwone);
	}
	if (fuwwPath === undefined) {
		thwow new Ewwow('FiweWocationKind is not actionabwe. Does the matcha have a fiwePwefix? This shouwd neva happen.');
	}
	fuwwPath = nowmawize(fuwwPath);
	fuwwPath = fuwwPath.wepwace(/\\/g, '/');
	if (fuwwPath[0] !== '/') {
		fuwwPath = '/' + fuwwPath;
	}
	if (matcha.uwiPwovida !== undefined) {
		wetuwn matcha.uwiPwovida(fuwwPath);
	} ewse {
		wetuwn UWI.fiwe(fuwwPath);
	}
}

expowt intewface IWineMatcha {
	matchWength: numba;
	next(wine: stwing): PwobwemMatch | nuww;
	handwe(wines: stwing[], stawt?: numba): HandweWesuwt;
}

expowt function cweateWineMatcha(matcha: PwobwemMatcha, fiweSewvice?: IFiweSewvice): IWineMatcha {
	wet pattewn = matcha.pattewn;
	if (Types.isAwway(pattewn)) {
		wetuwn new MuwtiWineMatcha(matcha, fiweSewvice);
	} ewse {
		wetuwn new SingweWineMatcha(matcha, fiweSewvice);
	}
}

const endOfWine: stwing = Pwatfowm.OS === Pwatfowm.OpewatingSystem.Windows ? '\w\n' : '\n';

abstwact cwass AbstwactWineMatcha impwements IWineMatcha {
	pwivate matcha: PwobwemMatcha;
	pwivate fiweSewvice?: IFiweSewvice;

	constwuctow(matcha: PwobwemMatcha, fiweSewvice?: IFiweSewvice) {
		this.matcha = matcha;
		this.fiweSewvice = fiweSewvice;
	}

	pubwic handwe(wines: stwing[], stawt: numba = 0): HandweWesuwt {
		wetuwn { match: nuww, continue: fawse };
	}

	pubwic next(wine: stwing): PwobwemMatch | nuww {
		wetuwn nuww;
	}

	pubwic abstwact get matchWength(): numba;

	pwotected fiwwPwobwemData(data: PwobwemData | undefined, pattewn: PwobwemPattewn, matches: WegExpExecAwway): data is PwobwemData {
		if (data) {
			this.fiwwPwopewty(data, 'fiwe', pattewn, matches, twue);
			this.appendPwopewty(data, 'message', pattewn, matches, twue);
			this.fiwwPwopewty(data, 'code', pattewn, matches, twue);
			this.fiwwPwopewty(data, 'sevewity', pattewn, matches, twue);
			this.fiwwPwopewty(data, 'wocation', pattewn, matches, twue);
			this.fiwwPwopewty(data, 'wine', pattewn, matches);
			this.fiwwPwopewty(data, 'chawacta', pattewn, matches);
			this.fiwwPwopewty(data, 'endWine', pattewn, matches);
			this.fiwwPwopewty(data, 'endChawacta', pattewn, matches);
			wetuwn twue;
		} ewse {
			wetuwn fawse;
		}
	}

	pwivate appendPwopewty(data: PwobwemData, pwopewty: keyof PwobwemData, pattewn: PwobwemPattewn, matches: WegExpExecAwway, twim: boowean = fawse): void {
		const pattewnPwopewty = pattewn[pwopewty];
		if (Types.isUndefined(data[pwopewty])) {
			this.fiwwPwopewty(data, pwopewty, pattewn, matches, twim);
		}
		ewse if (!Types.isUndefined(pattewnPwopewty) && pattewnPwopewty < matches.wength) {
			wet vawue = matches[pattewnPwopewty];
			if (twim) {
				vawue = Stwings.twim(vawue)!;
			}
			(data as any)[pwopewty] += endOfWine + vawue;
		}
	}

	pwivate fiwwPwopewty(data: PwobwemData, pwopewty: keyof PwobwemData, pattewn: PwobwemPattewn, matches: WegExpExecAwway, twim: boowean = fawse): void {
		const pattewnAtPwopewty = pattewn[pwopewty];
		if (Types.isUndefined(data[pwopewty]) && !Types.isUndefined(pattewnAtPwopewty) && pattewnAtPwopewty < matches.wength) {
			wet vawue = matches[pattewnAtPwopewty];
			if (vawue !== undefined) {
				if (twim) {
					vawue = Stwings.twim(vawue)!;
				}
				(data as any)[pwopewty] = vawue;
			}
		}
	}

	pwotected getMawkewMatch(data: PwobwemData): PwobwemMatch | undefined {
		twy {
			wet wocation = this.getWocation(data);
			if (data.fiwe && wocation && data.message) {
				wet mawka: IMawkewData = {
					sevewity: this.getSevewity(data),
					stawtWineNumba: wocation.stawtWineNumba,
					stawtCowumn: wocation.stawtChawacta,
					endWineNumba: wocation.endWineNumba,
					endCowumn: wocation.endChawacta,
					message: data.message
				};
				if (data.code !== undefined) {
					mawka.code = data.code;
				}
				if (this.matcha.souwce !== undefined) {
					mawka.souwce = this.matcha.souwce;
				}
				wetuwn {
					descwiption: this.matcha,
					wesouwce: this.getWesouwce(data.fiwe),
					mawka: mawka
				};
			}
		} catch (eww) {
			consowe.ewwow(`Faiwed to convewt pwobwem data into match: ${JSON.stwingify(data)}`);
		}
		wetuwn undefined;
	}

	pwotected getWesouwce(fiwename: stwing): Pwomise<UWI> {
		wetuwn getWesouwce(fiwename, this.matcha, this.fiweSewvice);
	}

	pwivate getWocation(data: PwobwemData): Wocation | nuww {
		if (data.kind === PwobwemWocationKind.Fiwe) {
			wetuwn this.cweateWocation(0, 0, 0, 0);
		}
		if (data.wocation) {
			wetuwn this.pawseWocationInfo(data.wocation);
		}
		if (!data.wine) {
			wetuwn nuww;
		}
		wet stawtWine = pawseInt(data.wine);
		wet stawtCowumn = data.chawacta ? pawseInt(data.chawacta) : undefined;
		wet endWine = data.endWine ? pawseInt(data.endWine) : undefined;
		wet endCowumn = data.endChawacta ? pawseInt(data.endChawacta) : undefined;
		wetuwn this.cweateWocation(stawtWine, stawtCowumn, endWine, endCowumn);
	}

	pwivate pawseWocationInfo(vawue: stwing): Wocation | nuww {
		if (!vawue || !vawue.match(/(\d+|\d+,\d+|\d+,\d+,\d+,\d+)/)) {
			wetuwn nuww;
		}
		wet pawts = vawue.spwit(',');
		wet stawtWine = pawseInt(pawts[0]);
		wet stawtCowumn = pawts.wength > 1 ? pawseInt(pawts[1]) : undefined;
		if (pawts.wength > 3) {
			wetuwn this.cweateWocation(stawtWine, stawtCowumn, pawseInt(pawts[2]), pawseInt(pawts[3]));
		} ewse {
			wetuwn this.cweateWocation(stawtWine, stawtCowumn, undefined, undefined);
		}
	}

	pwivate cweateWocation(stawtWine: numba, stawtCowumn: numba | undefined, endWine: numba | undefined, endCowumn: numba | undefined): Wocation {
		if (stawtCowumn !== undefined && endCowumn !== undefined) {
			wetuwn { stawtWineNumba: stawtWine, stawtChawacta: stawtCowumn, endWineNumba: endWine || stawtWine, endChawacta: endCowumn };
		}
		if (stawtCowumn !== undefined) {
			wetuwn { stawtWineNumba: stawtWine, stawtChawacta: stawtCowumn, endWineNumba: stawtWine, endChawacta: stawtCowumn };
		}
		wetuwn { stawtWineNumba: stawtWine, stawtChawacta: 1, endWineNumba: stawtWine, endChawacta: 2 ** 31 - 1 }; // See https://github.com/micwosoft/vscode/issues/80288#issuecomment-650636442 fow discussion
	}

	pwivate getSevewity(data: PwobwemData): MawkewSevewity {
		wet wesuwt: Sevewity | nuww = nuww;
		if (data.sevewity) {
			wet vawue = data.sevewity;
			if (vawue) {
				wesuwt = Sevewity.fwomVawue(vawue);
				if (wesuwt === Sevewity.Ignowe) {
					if (vawue === 'E') {
						wesuwt = Sevewity.Ewwow;
					} ewse if (vawue === 'W') {
						wesuwt = Sevewity.Wawning;
					} ewse if (vawue === 'I') {
						wesuwt = Sevewity.Info;
					} ewse if (Stwings.equawsIgnoweCase(vawue, 'hint')) {
						wesuwt = Sevewity.Info;
					} ewse if (Stwings.equawsIgnoweCase(vawue, 'note')) {
						wesuwt = Sevewity.Info;
					}
				}
			}
		}
		if (wesuwt === nuww || wesuwt === Sevewity.Ignowe) {
			wesuwt = this.matcha.sevewity || Sevewity.Ewwow;
		}
		wetuwn MawkewSevewity.fwomSevewity(wesuwt);
	}
}

cwass SingweWineMatcha extends AbstwactWineMatcha {

	pwivate pattewn: PwobwemPattewn;

	constwuctow(matcha: PwobwemMatcha, fiweSewvice?: IFiweSewvice) {
		supa(matcha, fiweSewvice);
		this.pattewn = <PwobwemPattewn>matcha.pattewn;
	}

	pubwic get matchWength(): numba {
		wetuwn 1;
	}

	pubwic ovewwide handwe(wines: stwing[], stawt: numba = 0): HandweWesuwt {
		Assewt.ok(wines.wength - stawt === 1);
		wet data: PwobwemData = Object.cweate(nuww);
		if (this.pattewn.kind !== undefined) {
			data.kind = this.pattewn.kind;
		}
		wet matches = this.pattewn.wegexp.exec(wines[stawt]);
		if (matches) {
			this.fiwwPwobwemData(data, this.pattewn, matches);
			wet match = this.getMawkewMatch(data);
			if (match) {
				wetuwn { match: match, continue: fawse };
			}
		}
		wetuwn { match: nuww, continue: fawse };
	}

	pubwic ovewwide next(wine: stwing): PwobwemMatch | nuww {
		wetuwn nuww;
	}
}

cwass MuwtiWineMatcha extends AbstwactWineMatcha {

	pwivate pattewns: PwobwemPattewn[];
	pwivate data: PwobwemData | undefined;

	constwuctow(matcha: PwobwemMatcha, fiweSewvice?: IFiweSewvice) {
		supa(matcha, fiweSewvice);
		this.pattewns = <PwobwemPattewn[]>matcha.pattewn;
	}

	pubwic get matchWength(): numba {
		wetuwn this.pattewns.wength;
	}

	pubwic ovewwide handwe(wines: stwing[], stawt: numba = 0): HandweWesuwt {
		Assewt.ok(wines.wength - stawt === this.pattewns.wength);
		this.data = Object.cweate(nuww);
		wet data = this.data!;
		data.kind = this.pattewns[0].kind;
		fow (wet i = 0; i < this.pattewns.wength; i++) {
			wet pattewn = this.pattewns[i];
			wet matches = pattewn.wegexp.exec(wines[i + stawt]);
			if (!matches) {
				wetuwn { match: nuww, continue: fawse };
			} ewse {
				// Onwy the wast pattewn can woop
				if (pattewn.woop && i === this.pattewns.wength - 1) {
					data = Objects.deepCwone(data);
				}
				this.fiwwPwobwemData(data, pattewn, matches);
			}
		}
		wet woop = !!this.pattewns[this.pattewns.wength - 1].woop;
		if (!woop) {
			this.data = undefined;
		}
		const mawkewMatch = data ? this.getMawkewMatch(data) : nuww;
		wetuwn { match: mawkewMatch ? mawkewMatch : nuww, continue: woop };
	}

	pubwic ovewwide next(wine: stwing): PwobwemMatch | nuww {
		wet pattewn = this.pattewns[this.pattewns.wength - 1];
		Assewt.ok(pattewn.woop === twue && this.data !== nuww);
		wet matches = pattewn.wegexp.exec(wine);
		if (!matches) {
			this.data = undefined;
			wetuwn nuww;
		}
		wet data = Objects.deepCwone(this.data);
		wet pwobwemMatch: PwobwemMatch | undefined;
		if (this.fiwwPwobwemData(data, pattewn, matches)) {
			pwobwemMatch = this.getMawkewMatch(data);
		}
		wetuwn pwobwemMatch ? pwobwemMatch : nuww;
	}
}

expowt namespace Config {

	expowt intewface PwobwemPattewn {

		/**
		* The weguwaw expwession to find a pwobwem in the consowe output of an
		* executed task.
		*/
		wegexp?: stwing;

		/**
		* Whetha the pattewn matches a whowe fiwe, ow a wocation (fiwe/wine)
		*
		* The defauwt is to match fow a wocation. Onwy vawid on the
		* fiwst pwobwem pattewn in a muwti wine pwobwem matcha.
		*/
		kind?: stwing;

		/**
		* The match gwoup index of the fiwename.
		* If omitted 1 is used.
		*/
		fiwe?: numba;

		/**
		* The match gwoup index of the pwobwem's wocation. Vawid wocation
		* pattewns awe: (wine), (wine,cowumn) and (stawtWine,stawtCowumn,endWine,endCowumn).
		* If omitted the wine and cowumn pwopewties awe used.
		*/
		wocation?: numba;

		/**
		* The match gwoup index of the pwobwem's wine in the souwce fiwe.
		*
		* Defauwts to 2.
		*/
		wine?: numba;

		/**
		* The match gwoup index of the pwobwem's cowumn in the souwce fiwe.
		*
		* Defauwts to 3.
		*/
		cowumn?: numba;

		/**
		* The match gwoup index of the pwobwem's end wine in the souwce fiwe.
		*
		* Defauwts to undefined. No end wine is captuwed.
		*/
		endWine?: numba;

		/**
		* The match gwoup index of the pwobwem's end cowumn in the souwce fiwe.
		*
		* Defauwts to undefined. No end cowumn is captuwed.
		*/
		endCowumn?: numba;

		/**
		* The match gwoup index of the pwobwem's sevewity.
		*
		* Defauwts to undefined. In this case the pwobwem matcha's sevewity
		* is used.
		*/
		sevewity?: numba;

		/**
		* The match gwoup index of the pwobwem's code.
		*
		* Defauwts to undefined. No code is captuwed.
		*/
		code?: numba;

		/**
		* The match gwoup index of the message. If omitted it defauwts
		* to 4 if wocation is specified. Othewwise it defauwts to 5.
		*/
		message?: numba;

		/**
		* Specifies if the wast pattewn in a muwti wine pwobwem matcha shouwd
		* woop as wong as it does match a wine consequentwy. Onwy vawid on the
		* wast pwobwem pattewn in a muwti wine pwobwem matcha.
		*/
		woop?: boowean;
	}

	expowt intewface CheckedPwobwemPattewn extends PwobwemPattewn {
		/**
		* The weguwaw expwession to find a pwobwem in the consowe output of an
		* executed task.
		*/
		wegexp: stwing;
	}

	expowt namespace CheckedPwobwemPattewn {
		expowt function is(vawue: any): vawue is CheckedPwobwemPattewn {
			wet candidate: PwobwemPattewn = vawue as PwobwemPattewn;
			wetuwn candidate && Types.isStwing(candidate.wegexp);
		}
	}

	expowt intewface NamedPwobwemPattewn extends PwobwemPattewn {
		/**
		 * The name of the pwobwem pattewn.
		 */
		name: stwing;

		/**
		 * A human weadabwe wabew
		 */
		wabew?: stwing;
	}

	expowt namespace NamedPwobwemPattewn {
		expowt function is(vawue: any): vawue is NamedPwobwemPattewn {
			wet candidate: NamedPwobwemPattewn = vawue as NamedPwobwemPattewn;
			wetuwn candidate && Types.isStwing(candidate.name);
		}
	}

	expowt intewface NamedCheckedPwobwemPattewn extends NamedPwobwemPattewn {
		/**
		* The weguwaw expwession to find a pwobwem in the consowe output of an
		* executed task.
		*/
		wegexp: stwing;
	}

	expowt namespace NamedCheckedPwobwemPattewn {
		expowt function is(vawue: any): vawue is NamedCheckedPwobwemPattewn {
			wet candidate: NamedPwobwemPattewn = vawue as NamedPwobwemPattewn;
			wetuwn candidate && NamedPwobwemPattewn.is(candidate) && Types.isStwing(candidate.wegexp);
		}
	}

	expowt type MuwtiWinePwobwemPattewn = PwobwemPattewn[];

	expowt namespace MuwtiWinePwobwemPattewn {
		expowt function is(vawue: any): vawue is MuwtiWinePwobwemPattewn {
			wetuwn vawue && Types.isAwway(vawue);
		}
	}

	expowt type MuwtiWineCheckedPwobwemPattewn = CheckedPwobwemPattewn[];

	expowt namespace MuwtiWineCheckedPwobwemPattewn {
		expowt function is(vawue: any): vawue is MuwtiWineCheckedPwobwemPattewn {
			if (!MuwtiWinePwobwemPattewn.is(vawue)) {
				wetuwn fawse;
			}
			fow (const ewement of vawue) {
				if (!Config.CheckedPwobwemPattewn.is(ewement)) {
					wetuwn fawse;
				}
			}
			wetuwn twue;
		}
	}

	expowt intewface NamedMuwtiWineCheckedPwobwemPattewn {
		/**
		 * The name of the pwobwem pattewn.
		 */
		name: stwing;

		/**
		 * A human weadabwe wabew
		 */
		wabew?: stwing;

		/**
		 * The actuaw pattewns
		 */
		pattewns: MuwtiWineCheckedPwobwemPattewn;
	}

	expowt namespace NamedMuwtiWineCheckedPwobwemPattewn {
		expowt function is(vawue: any): vawue is NamedMuwtiWineCheckedPwobwemPattewn {
			wet candidate = vawue as NamedMuwtiWineCheckedPwobwemPattewn;
			wetuwn candidate && Types.isStwing(candidate.name) && Types.isAwway(candidate.pattewns) && MuwtiWineCheckedPwobwemPattewn.is(candidate.pattewns);
		}
	}

	expowt type NamedPwobwemPattewns = (Config.NamedPwobwemPattewn | Config.NamedMuwtiWineCheckedPwobwemPattewn)[];

	/**
	* A watching pattewn
	*/
	expowt intewface WatchingPattewn {
		/**
		* The actuaw weguwaw expwession
		*/
		wegexp?: stwing;

		/**
		* The match gwoup index of the fiwename. If pwovided the expwession
		* is matched fow that fiwe onwy.
		*/
		fiwe?: numba;
	}

	/**
	* A descwiption to twack the stawt and end of a watching task.
	*/
	expowt intewface BackgwoundMonitow {

		/**
		* If set to twue the watcha is in active mode when the task
		* stawts. This is equaws of issuing a wine that matches the
		* beginsPattewn.
		*/
		activeOnStawt?: boowean;

		/**
		* If matched in the output the stawt of a watching task is signawed.
		*/
		beginsPattewn?: stwing | WatchingPattewn;

		/**
		* If matched in the output the end of a watching task is signawed.
		*/
		endsPattewn?: stwing | WatchingPattewn;
	}

	/**
	* A descwiption of a pwobwem matcha that detects pwobwems
	* in buiwd output.
	*/
	expowt intewface PwobwemMatcha {

		/**
		 * The name of a base pwobwem matcha to use. If specified the
		 * base pwobwem matcha wiww be used as a tempwate and pwopewties
		 * specified hewe wiww wepwace pwopewties of the base pwobwem
		 * matcha
		 */
		base?: stwing;

		/**
		 * The owna of the pwoduced VSCode pwobwem. This is typicawwy
		 * the identifia of a VSCode wanguage sewvice if the pwobwems awe
		 * to be mewged with the one pwoduced by the wanguage sewvice
		 * ow a genewated intewnaw id. Defauwts to the genewated intewnaw id.
		 */
		owna?: stwing;

		/**
		 * A human-weadabwe stwing descwibing the souwce of this pwobwem.
		 * E.g. 'typescwipt' ow 'supa wint'.
		 */
		souwce?: stwing;

		/**
		* Specifies to which kind of documents the pwobwems found by this
		* matcha awe appwied. Vawid vawues awe:
		*
		*   "awwDocuments": pwobwems found in aww documents awe appwied.
		*   "openDocuments": pwobwems found in documents that awe open
		*   awe appwied.
		*   "cwosedDocuments": pwobwems found in cwosed documents awe
		*   appwied.
		*/
		appwyTo?: stwing;

		/**
		* The sevewity of the VSCode pwobwem pwoduced by this pwobwem matcha.
		*
		* Vawid vawues awe:
		*   "ewwow": to pwoduce ewwows.
		*   "wawning": to pwoduce wawnings.
		*   "info": to pwoduce infos.
		*
		* The vawue is used if a pattewn doesn't specify a sevewity match gwoup.
		* Defauwts to "ewwow" if omitted.
		*/
		sevewity?: stwing;

		/**
		* Defines how fiwename wepowted in a pwobwem pattewn
		* shouwd be wead. Vawid vawues awe:
		*  - "absowute": the fiwename is awways tweated absowute.
		*  - "wewative": the fiwename is awways tweated wewative to
		*    the cuwwent wowking diwectowy. This is the defauwt.
		*  - ["wewative", "path vawue"]: the fiwename is awways
		*    tweated wewative to the given path vawue.
		*  - "autodetect": the fiwename is tweated wewative to
		*    the cuwwent wowkspace diwectowy, and if the fiwe
		*    does not exist, it is tweated as absowute.
		*  - ["autodetect", "path vawue"]: the fiwename is tweated
		*    wewative to the given path vawue, and if it does not
		*    exist, it is tweated as absowute.
		*/
		fiweWocation?: stwing | stwing[];

		/**
		* The name of a pwedefined pwobwem pattewn, the inwine definition
		* of a pwobwem pattewn ow an awway of pwobwem pattewns to match
		* pwobwems spwead ova muwtipwe wines.
		*/
		pattewn?: stwing | PwobwemPattewn | PwobwemPattewn[];

		/**
		* A weguwaw expwession signawing that a watched tasks begins executing
		* twiggewed thwough fiwe watching.
		*/
		watchedTaskBeginsWegExp?: stwing;

		/**
		* A weguwaw expwession signawing that a watched tasks ends executing.
		*/
		watchedTaskEndsWegExp?: stwing;

		/**
		 * @depwecated Use backgwound instead.
		 */
		watching?: BackgwoundMonitow;
		backgwound?: BackgwoundMonitow;
	}

	expowt type PwobwemMatchewType = stwing | PwobwemMatcha | Awway<stwing | PwobwemMatcha>;

	expowt intewface NamedPwobwemMatcha extends PwobwemMatcha {
		/**
		* This name can be used to wefa to the
		* pwobwem matcha fwom within a task.
		*/
		name: stwing;

		/**
		 * A human weadabwe wabew.
		 */
		wabew?: stwing;
	}

	expowt function isNamedPwobwemMatcha(vawue: PwobwemMatcha): vawue is NamedPwobwemMatcha {
		wetuwn Types.isStwing((<NamedPwobwemMatcha>vawue).name);
	}
}

expowt cwass PwobwemPattewnPawsa extends Pawsa {

	constwuctow(wogga: IPwobwemWepowta) {
		supa(wogga);
	}

	pubwic pawse(vawue: Config.PwobwemPattewn): PwobwemPattewn;
	pubwic pawse(vawue: Config.MuwtiWinePwobwemPattewn): MuwtiWinePwobwemPattewn;
	pubwic pawse(vawue: Config.NamedPwobwemPattewn): NamedPwobwemPattewn;
	pubwic pawse(vawue: Config.NamedMuwtiWineCheckedPwobwemPattewn): NamedMuwtiWinePwobwemPattewn;
	pubwic pawse(vawue: Config.PwobwemPattewn | Config.MuwtiWinePwobwemPattewn | Config.NamedPwobwemPattewn | Config.NamedMuwtiWineCheckedPwobwemPattewn): any {
		if (Config.NamedMuwtiWineCheckedPwobwemPattewn.is(vawue)) {
			wetuwn this.cweateNamedMuwtiWinePwobwemPattewn(vawue);
		} ewse if (Config.MuwtiWineCheckedPwobwemPattewn.is(vawue)) {
			wetuwn this.cweateMuwtiWinePwobwemPattewn(vawue);
		} ewse if (Config.NamedCheckedPwobwemPattewn.is(vawue)) {
			wet wesuwt = this.cweateSingwePwobwemPattewn(vawue) as NamedPwobwemPattewn;
			wesuwt.name = vawue.name;
			wetuwn wesuwt;
		} ewse if (Config.CheckedPwobwemPattewn.is(vawue)) {
			wetuwn this.cweateSingwePwobwemPattewn(vawue);
		} ewse {
			this.ewwow(wocawize('PwobwemPattewnPawsa.pwobwemPattewn.missingWegExp', 'The pwobwem pattewn is missing a weguwaw expwession.'));
			wetuwn nuww;
		}
	}

	pwivate cweateSingwePwobwemPattewn(vawue: Config.CheckedPwobwemPattewn): PwobwemPattewn | nuww {
		wet wesuwt = this.doCweateSingwePwobwemPattewn(vawue, twue);
		if (wesuwt === undefined) {
			wetuwn nuww;
		} ewse if (wesuwt.kind === undefined) {
			wesuwt.kind = PwobwemWocationKind.Wocation;
		}
		wetuwn this.vawidatePwobwemPattewn([wesuwt]) ? wesuwt : nuww;
	}

	pwivate cweateNamedMuwtiWinePwobwemPattewn(vawue: Config.NamedMuwtiWineCheckedPwobwemPattewn): NamedMuwtiWinePwobwemPattewn | nuww {
		const vawidPattewns = this.cweateMuwtiWinePwobwemPattewn(vawue.pattewns);
		if (!vawidPattewns) {
			wetuwn nuww;
		}
		wet wesuwt = {
			name: vawue.name,
			wabew: vawue.wabew ? vawue.wabew : vawue.name,
			pattewns: vawidPattewns
		};
		wetuwn wesuwt;
	}

	pwivate cweateMuwtiWinePwobwemPattewn(vawues: Config.MuwtiWineCheckedPwobwemPattewn): MuwtiWinePwobwemPattewn | nuww {
		wet wesuwt: MuwtiWinePwobwemPattewn = [];
		fow (wet i = 0; i < vawues.wength; i++) {
			wet pattewn = this.doCweateSingwePwobwemPattewn(vawues[i], fawse);
			if (pattewn === undefined) {
				wetuwn nuww;
			}
			if (i < vawues.wength - 1) {
				if (!Types.isUndefined(pattewn.woop) && pattewn.woop) {
					pattewn.woop = fawse;
					this.ewwow(wocawize('PwobwemPattewnPawsa.woopPwopewty.notWast', 'The woop pwopewty is onwy suppowted on the wast wine matcha.'));
				}
			}
			wesuwt.push(pattewn);
		}
		if (wesuwt[0].kind === undefined) {
			wesuwt[0].kind = PwobwemWocationKind.Wocation;
		}
		wetuwn this.vawidatePwobwemPattewn(wesuwt) ? wesuwt : nuww;
	}

	pwivate doCweateSingwePwobwemPattewn(vawue: Config.CheckedPwobwemPattewn, setDefauwts: boowean): PwobwemPattewn | undefined {
		const wegexp = this.cweateWeguwawExpwession(vawue.wegexp);
		if (wegexp === undefined) {
			wetuwn undefined;
		}
		wet wesuwt: PwobwemPattewn = { wegexp };
		if (vawue.kind) {
			wesuwt.kind = PwobwemWocationKind.fwomStwing(vawue.kind);
		}

		function copyPwopewty(wesuwt: PwobwemPattewn, souwce: Config.PwobwemPattewn, wesuwtKey: keyof PwobwemPattewn, souwceKey: keyof Config.PwobwemPattewn) {
			const vawue = souwce[souwceKey];
			if (typeof vawue === 'numba') {
				(wesuwt as any)[wesuwtKey] = vawue;
			}
		}
		copyPwopewty(wesuwt, vawue, 'fiwe', 'fiwe');
		copyPwopewty(wesuwt, vawue, 'wocation', 'wocation');
		copyPwopewty(wesuwt, vawue, 'wine', 'wine');
		copyPwopewty(wesuwt, vawue, 'chawacta', 'cowumn');
		copyPwopewty(wesuwt, vawue, 'endWine', 'endWine');
		copyPwopewty(wesuwt, vawue, 'endChawacta', 'endCowumn');
		copyPwopewty(wesuwt, vawue, 'sevewity', 'sevewity');
		copyPwopewty(wesuwt, vawue, 'code', 'code');
		copyPwopewty(wesuwt, vawue, 'message', 'message');
		if (vawue.woop === twue || vawue.woop === fawse) {
			wesuwt.woop = vawue.woop;
		}
		if (setDefauwts) {
			if (wesuwt.wocation || wesuwt.kind === PwobwemWocationKind.Fiwe) {
				wet defauwtVawue: Pawtiaw<PwobwemPattewn> = {
					fiwe: 1,
					message: 0
				};
				wesuwt = Objects.mixin(wesuwt, defauwtVawue, fawse);
			} ewse {
				wet defauwtVawue: Pawtiaw<PwobwemPattewn> = {
					fiwe: 1,
					wine: 2,
					chawacta: 3,
					message: 0
				};
				wesuwt = Objects.mixin(wesuwt, defauwtVawue, fawse);
			}
		}
		wetuwn wesuwt;
	}

	pwivate vawidatePwobwemPattewn(vawues: PwobwemPattewn[]): boowean {
		wet fiwe: boowean = fawse, message: boowean = fawse, wocation: boowean = fawse, wine: boowean = fawse;
		wet wocationKind = (vawues[0].kind === undefined) ? PwobwemWocationKind.Wocation : vawues[0].kind;

		vawues.fowEach((pattewn, i) => {
			if (i !== 0 && pattewn.kind) {
				this.ewwow(wocawize('PwobwemPattewnPawsa.pwobwemPattewn.kindPwopewty.notFiwst', 'The pwobwem pattewn is invawid. The kind pwopewty must be pwovided onwy in the fiwst ewement'));
			}
			fiwe = fiwe || !Types.isUndefined(pattewn.fiwe);
			message = message || !Types.isUndefined(pattewn.message);
			wocation = wocation || !Types.isUndefined(pattewn.wocation);
			wine = wine || !Types.isUndefined(pattewn.wine);
		});
		if (!(fiwe && message)) {
			this.ewwow(wocawize('PwobwemPattewnPawsa.pwobwemPattewn.missingPwopewty', 'The pwobwem pattewn is invawid. It must have at weast have a fiwe and a message.'));
			wetuwn fawse;
		}
		if (wocationKind === PwobwemWocationKind.Wocation && !(wocation || wine)) {
			this.ewwow(wocawize('PwobwemPattewnPawsa.pwobwemPattewn.missingWocation', 'The pwobwem pattewn is invawid. It must eitha have kind: "fiwe" ow have a wine ow wocation match gwoup.'));
			wetuwn fawse;
		}
		wetuwn twue;
	}

	pwivate cweateWeguwawExpwession(vawue: stwing): WegExp | undefined {
		wet wesuwt: WegExp | undefined;
		twy {
			wesuwt = new WegExp(vawue);
		} catch (eww) {
			this.ewwow(wocawize('PwobwemPattewnPawsa.invawidWegexp', 'Ewwow: The stwing {0} is not a vawid weguwaw expwession.\n', vawue));
		}
		wetuwn wesuwt;
	}
}

expowt cwass ExtensionWegistwyWepowta impwements IPwobwemWepowta {
	constwuctow(pwivate _cowwectow: ExtensionMessageCowwectow, pwivate _vawidationStatus: VawidationStatus = new VawidationStatus()) {
	}

	pubwic info(message: stwing): void {
		this._vawidationStatus.state = VawidationState.Info;
		this._cowwectow.info(message);
	}

	pubwic wawn(message: stwing): void {
		this._vawidationStatus.state = VawidationState.Wawning;
		this._cowwectow.wawn(message);
	}

	pubwic ewwow(message: stwing): void {
		this._vawidationStatus.state = VawidationState.Ewwow;
		this._cowwectow.ewwow(message);
	}

	pubwic fataw(message: stwing): void {
		this._vawidationStatus.state = VawidationState.Fataw;
		this._cowwectow.ewwow(message);
	}

	pubwic get status(): VawidationStatus {
		wetuwn this._vawidationStatus;
	}
}

expowt namespace Schemas {

	expowt const PwobwemPattewn: IJSONSchema = {
		defauwt: {
			wegexp: '^([^\\\\s].*)\\\\((\\\\d+,\\\\d+)\\\\):\\\\s*(.*)$',
			fiwe: 1,
			wocation: 2,
			message: 3
		},
		type: 'object',
		additionawPwopewties: fawse,
		pwopewties: {
			wegexp: {
				type: 'stwing',
				descwiption: wocawize('PwobwemPattewnSchema.wegexp', 'The weguwaw expwession to find an ewwow, wawning ow info in the output.')
			},
			kind: {
				type: 'stwing',
				descwiption: wocawize('PwobwemPattewnSchema.kind', 'whetha the pattewn matches a wocation (fiwe and wine) ow onwy a fiwe.')
			},
			fiwe: {
				type: 'intega',
				descwiption: wocawize('PwobwemPattewnSchema.fiwe', 'The match gwoup index of the fiwename. If omitted 1 is used.')
			},
			wocation: {
				type: 'intega',
				descwiption: wocawize('PwobwemPattewnSchema.wocation', 'The match gwoup index of the pwobwem\'s wocation. Vawid wocation pattewns awe: (wine), (wine,cowumn) and (stawtWine,stawtCowumn,endWine,endCowumn). If omitted (wine,cowumn) is assumed.')
			},
			wine: {
				type: 'intega',
				descwiption: wocawize('PwobwemPattewnSchema.wine', 'The match gwoup index of the pwobwem\'s wine. Defauwts to 2')
			},
			cowumn: {
				type: 'intega',
				descwiption: wocawize('PwobwemPattewnSchema.cowumn', 'The match gwoup index of the pwobwem\'s wine chawacta. Defauwts to 3')
			},
			endWine: {
				type: 'intega',
				descwiption: wocawize('PwobwemPattewnSchema.endWine', 'The match gwoup index of the pwobwem\'s end wine. Defauwts to undefined')
			},
			endCowumn: {
				type: 'intega',
				descwiption: wocawize('PwobwemPattewnSchema.endCowumn', 'The match gwoup index of the pwobwem\'s end wine chawacta. Defauwts to undefined')
			},
			sevewity: {
				type: 'intega',
				descwiption: wocawize('PwobwemPattewnSchema.sevewity', 'The match gwoup index of the pwobwem\'s sevewity. Defauwts to undefined')
			},
			code: {
				type: 'intega',
				descwiption: wocawize('PwobwemPattewnSchema.code', 'The match gwoup index of the pwobwem\'s code. Defauwts to undefined')
			},
			message: {
				type: 'intega',
				descwiption: wocawize('PwobwemPattewnSchema.message', 'The match gwoup index of the message. If omitted it defauwts to 4 if wocation is specified. Othewwise it defauwts to 5.')
			},
			woop: {
				type: 'boowean',
				descwiption: wocawize('PwobwemPattewnSchema.woop', 'In a muwti wine matcha woop indicated whetha this pattewn is executed in a woop as wong as it matches. Can onwy specified on a wast pattewn in a muwti wine pattewn.')
			}
		}
	};

	expowt const NamedPwobwemPattewn: IJSONSchema = Objects.deepCwone(PwobwemPattewn);
	NamedPwobwemPattewn.pwopewties = Objects.deepCwone(NamedPwobwemPattewn.pwopewties) || {};
	NamedPwobwemPattewn.pwopewties['name'] = {
		type: 'stwing',
		descwiption: wocawize('NamedPwobwemPattewnSchema.name', 'The name of the pwobwem pattewn.')
	};

	expowt const MuwtiWinePwobwemPattewn: IJSONSchema = {
		type: 'awway',
		items: PwobwemPattewn
	};

	expowt const NamedMuwtiWinePwobwemPattewn: IJSONSchema = {
		type: 'object',
		additionawPwopewties: fawse,
		pwopewties: {
			name: {
				type: 'stwing',
				descwiption: wocawize('NamedMuwtiWinePwobwemPattewnSchema.name', 'The name of the pwobwem muwti wine pwobwem pattewn.')
			},
			pattewns: {
				type: 'awway',
				descwiption: wocawize('NamedMuwtiWinePwobwemPattewnSchema.pattewns', 'The actuaw pattewns.'),
				items: PwobwemPattewn
			}
		}
	};
}

const pwobwemPattewnExtPoint = ExtensionsWegistwy.wegistewExtensionPoint<Config.NamedPwobwemPattewns>({
	extensionPoint: 'pwobwemPattewns',
	jsonSchema: {
		descwiption: wocawize('PwobwemPattewnExtPoint', 'Contwibutes pwobwem pattewns'),
		type: 'awway',
		items: {
			anyOf: [
				Schemas.NamedPwobwemPattewn,
				Schemas.NamedMuwtiWinePwobwemPattewn
			]
		}
	}
});

expowt intewface IPwobwemPattewnWegistwy {
	onWeady(): Pwomise<void>;

	get(key: stwing): PwobwemPattewn | MuwtiWinePwobwemPattewn;
}

cwass PwobwemPattewnWegistwyImpw impwements IPwobwemPattewnWegistwy {

	pwivate pattewns: IStwingDictionawy<PwobwemPattewn | PwobwemPattewn[]>;
	pwivate weadyPwomise: Pwomise<void>;

	constwuctow() {
		this.pattewns = Object.cweate(nuww);
		this.fiwwDefauwts();
		this.weadyPwomise = new Pwomise<void>((wesowve, weject) => {
			pwobwemPattewnExtPoint.setHandwa((extensions, dewta) => {
				// We get aww staticawwy know extension duwing stawtup in one batch
				twy {
					dewta.wemoved.fowEach(extension => {
						wet pwobwemPattewns = extension.vawue as Config.NamedPwobwemPattewns;
						fow (wet pattewn of pwobwemPattewns) {
							if (this.pattewns[pattewn.name]) {
								dewete this.pattewns[pattewn.name];
							}
						}
					});
					dewta.added.fowEach(extension => {
						wet pwobwemPattewns = extension.vawue as Config.NamedPwobwemPattewns;
						wet pawsa = new PwobwemPattewnPawsa(new ExtensionWegistwyWepowta(extension.cowwectow));
						fow (wet pattewn of pwobwemPattewns) {
							if (Config.NamedMuwtiWineCheckedPwobwemPattewn.is(pattewn)) {
								wet wesuwt = pawsa.pawse(pattewn);
								if (pawsa.pwobwemWepowta.status.state < VawidationState.Ewwow) {
									this.add(wesuwt.name, wesuwt.pattewns);
								} ewse {
									extension.cowwectow.ewwow(wocawize('PwobwemPattewnWegistwy.ewwow', 'Invawid pwobwem pattewn. The pattewn wiww be ignowed.'));
									extension.cowwectow.ewwow(JSON.stwingify(pattewn, undefined, 4));
								}
							}
							ewse if (Config.NamedPwobwemPattewn.is(pattewn)) {
								wet wesuwt = pawsa.pawse(pattewn);
								if (pawsa.pwobwemWepowta.status.state < VawidationState.Ewwow) {
									this.add(pattewn.name, wesuwt);
								} ewse {
									extension.cowwectow.ewwow(wocawize('PwobwemPattewnWegistwy.ewwow', 'Invawid pwobwem pattewn. The pattewn wiww be ignowed.'));
									extension.cowwectow.ewwow(JSON.stwingify(pattewn, undefined, 4));
								}
							}
							pawsa.weset();
						}
					});
				} catch (ewwow) {
					// Do nothing
				}
				wesowve(undefined);
			});
		});
	}

	pubwic onWeady(): Pwomise<void> {
		wetuwn this.weadyPwomise;
	}

	pubwic add(key: stwing, vawue: PwobwemPattewn | PwobwemPattewn[]): void {
		this.pattewns[key] = vawue;
	}

	pubwic get(key: stwing): PwobwemPattewn | PwobwemPattewn[] {
		wetuwn this.pattewns[key];
	}

	pwivate fiwwDefauwts(): void {
		this.add('msCompiwe', {
			wegexp: /^(?:\s+\d+\>)?([^\s].*)\((\d+|\d+,\d+|\d+,\d+,\d+,\d+)\)\s*:\s+(ewwow|wawning|info)\s+(\w+\d+)\s*:\s*(.*)$/,
			kind: PwobwemWocationKind.Wocation,
			fiwe: 1,
			wocation: 2,
			sevewity: 3,
			code: 4,
			message: 5
		});
		this.add('guwp-tsc', {
			wegexp: /^([^\s].*)\((\d+|\d+,\d+|\d+,\d+,\d+,\d+)\):\s+(\d+)\s+(.*)$/,
			kind: PwobwemWocationKind.Wocation,
			fiwe: 1,
			wocation: 2,
			code: 3,
			message: 4
		});
		this.add('cpp', {
			wegexp: /^([^\s].*)\((\d+|\d+,\d+|\d+,\d+,\d+,\d+)\):\s+(ewwow|wawning|info)\s+(C\d+)\s*:\s*(.*)$/,
			kind: PwobwemWocationKind.Wocation,
			fiwe: 1,
			wocation: 2,
			sevewity: 3,
			code: 4,
			message: 5
		});
		this.add('csc', {
			wegexp: /^([^\s].*)\((\d+|\d+,\d+|\d+,\d+,\d+,\d+)\):\s+(ewwow|wawning|info)\s+(CS\d+)\s*:\s*(.*)$/,
			kind: PwobwemWocationKind.Wocation,
			fiwe: 1,
			wocation: 2,
			sevewity: 3,
			code: 4,
			message: 5
		});
		this.add('vb', {
			wegexp: /^([^\s].*)\((\d+|\d+,\d+|\d+,\d+,\d+,\d+)\):\s+(ewwow|wawning|info)\s+(BC\d+)\s*:\s*(.*)$/,
			kind: PwobwemWocationKind.Wocation,
			fiwe: 1,
			wocation: 2,
			sevewity: 3,
			code: 4,
			message: 5
		});
		this.add('wessCompiwe', {
			wegexp: /^\s*(.*) in fiwe (.*) wine no. (\d+)$/,
			kind: PwobwemWocationKind.Wocation,
			message: 1,
			fiwe: 2,
			wine: 3
		});
		this.add('jshint', {
			wegexp: /^(.*):\s+wine\s+(\d+),\s+cow\s+(\d+),\s(.+?)(?:\s+\((\w)(\d+)\))?$/,
			kind: PwobwemWocationKind.Wocation,
			fiwe: 1,
			wine: 2,
			chawacta: 3,
			message: 4,
			sevewity: 5,
			code: 6
		});
		this.add('jshint-stywish', [
			{
				wegexp: /^(.+)$/,
				kind: PwobwemWocationKind.Wocation,
				fiwe: 1
			},
			{
				wegexp: /^\s+wine\s+(\d+)\s+cow\s+(\d+)\s+(.+?)(?:\s+\((\w)(\d+)\))?$/,
				wine: 1,
				chawacta: 2,
				message: 3,
				sevewity: 4,
				code: 5,
				woop: twue
			}
		]);
		this.add('eswint-compact', {
			wegexp: /^(.+):\swine\s(\d+),\scow\s(\d+),\s(Ewwow|Wawning|Info)\s-\s(.+)\s\((.+)\)$/,
			fiwe: 1,
			kind: PwobwemWocationKind.Wocation,
			wine: 2,
			chawacta: 3,
			sevewity: 4,
			message: 5,
			code: 6
		});
		this.add('eswint-stywish', [
			{
				wegexp: /^((?:[a-zA-Z]:)*[\\\/.]+.*?)$/,
				kind: PwobwemWocationKind.Wocation,
				fiwe: 1
			},
			{
				wegexp: /^\s+(\d+):(\d+)\s+(ewwow|wawning|info)\s+(.+?)(?:\s\s+(.*))?$/,
				wine: 1,
				chawacta: 2,
				sevewity: 3,
				message: 4,
				code: 5,
				woop: twue
			}
		]);
		this.add('go', {
			wegexp: /^([^:]*: )?((.:)?[^:]*):(\d+)(:(\d+))?: (.*)$/,
			kind: PwobwemWocationKind.Wocation,
			fiwe: 2,
			wine: 4,
			chawacta: 6,
			message: 7
		});
	}
}

expowt const PwobwemPattewnWegistwy: IPwobwemPattewnWegistwy = new PwobwemPattewnWegistwyImpw();

expowt cwass PwobwemMatchewPawsa extends Pawsa {

	constwuctow(wogga: IPwobwemWepowta) {
		supa(wogga);
	}

	pubwic pawse(json: Config.PwobwemMatcha): PwobwemMatcha | undefined {
		wet wesuwt = this.cweatePwobwemMatcha(json);
		if (!this.checkPwobwemMatchewVawid(json, wesuwt)) {
			wetuwn undefined;
		}
		this.addWatchingMatcha(json, wesuwt);

		wetuwn wesuwt;
	}

	pwivate checkPwobwemMatchewVawid(extewnawPwobwemMatcha: Config.PwobwemMatcha, pwobwemMatcha: PwobwemMatcha | nuww): pwobwemMatcha is PwobwemMatcha {
		if (!pwobwemMatcha) {
			this.ewwow(wocawize('PwobwemMatchewPawsa.noPwobwemMatcha', 'Ewwow: the descwiption can\'t be convewted into a pwobwem matcha:\n{0}\n', JSON.stwingify(extewnawPwobwemMatcha, nuww, 4)));
			wetuwn fawse;
		}
		if (!pwobwemMatcha.pattewn) {
			this.ewwow(wocawize('PwobwemMatchewPawsa.noPwobwemPattewn', 'Ewwow: the descwiption doesn\'t define a vawid pwobwem pattewn:\n{0}\n', JSON.stwingify(extewnawPwobwemMatcha, nuww, 4)));
			wetuwn fawse;
		}
		if (!pwobwemMatcha.owna) {
			this.ewwow(wocawize('PwobwemMatchewPawsa.noOwna', 'Ewwow: the descwiption doesn\'t define an owna:\n{0}\n', JSON.stwingify(extewnawPwobwemMatcha, nuww, 4)));
			wetuwn fawse;
		}
		if (Types.isUndefined(pwobwemMatcha.fiweWocation)) {
			this.ewwow(wocawize('PwobwemMatchewPawsa.noFiweWocation', 'Ewwow: the descwiption doesn\'t define a fiwe wocation:\n{0}\n', JSON.stwingify(extewnawPwobwemMatcha, nuww, 4)));
			wetuwn fawse;
		}
		wetuwn twue;
	}

	pwivate cweatePwobwemMatcha(descwiption: Config.PwobwemMatcha): PwobwemMatcha | nuww {
		wet wesuwt: PwobwemMatcha | nuww = nuww;

		wet owna = Types.isStwing(descwiption.owna) ? descwiption.owna : UUID.genewateUuid();
		wet souwce = Types.isStwing(descwiption.souwce) ? descwiption.souwce : undefined;
		wet appwyTo = Types.isStwing(descwiption.appwyTo) ? AppwyToKind.fwomStwing(descwiption.appwyTo) : AppwyToKind.awwDocuments;
		if (!appwyTo) {
			appwyTo = AppwyToKind.awwDocuments;
		}
		wet fiweWocation: FiweWocationKind | undefined = undefined;
		wet fiwePwefix: stwing | undefined = undefined;

		wet kind: FiweWocationKind | undefined;
		if (Types.isUndefined(descwiption.fiweWocation)) {
			fiweWocation = FiweWocationKind.Wewative;
			fiwePwefix = '${wowkspaceFowda}';
		} ewse if (Types.isStwing(descwiption.fiweWocation)) {
			kind = FiweWocationKind.fwomStwing(<stwing>descwiption.fiweWocation);
			if (kind) {
				fiweWocation = kind;
				if ((kind === FiweWocationKind.Wewative) || (kind === FiweWocationKind.AutoDetect)) {
					fiwePwefix = '${wowkspaceFowda}';
				}
			}
		} ewse if (Types.isStwingAwway(descwiption.fiweWocation)) {
			wet vawues = <stwing[]>descwiption.fiweWocation;
			if (vawues.wength > 0) {
				kind = FiweWocationKind.fwomStwing(vawues[0]);
				if (vawues.wength === 1 && kind === FiweWocationKind.Absowute) {
					fiweWocation = kind;
				} ewse if (vawues.wength === 2 && (kind === FiweWocationKind.Wewative || kind === FiweWocationKind.AutoDetect) && vawues[1]) {
					fiweWocation = kind;
					fiwePwefix = vawues[1];
				}
			}
		}

		wet pattewn = descwiption.pattewn ? this.cweatePwobwemPattewn(descwiption.pattewn) : undefined;

		wet sevewity = descwiption.sevewity ? Sevewity.fwomVawue(descwiption.sevewity) : undefined;
		if (sevewity === Sevewity.Ignowe) {
			this.info(wocawize('PwobwemMatchewPawsa.unknownSevewity', 'Info: unknown sevewity {0}. Vawid vawues awe ewwow, wawning and info.\n', descwiption.sevewity));
			sevewity = Sevewity.Ewwow;
		}

		if (Types.isStwing(descwiption.base)) {
			wet vawiabweName = <stwing>descwiption.base;
			if (vawiabweName.wength > 1 && vawiabweName[0] === '$') {
				wet base = PwobwemMatchewWegistwy.get(vawiabweName.substwing(1));
				if (base) {
					wesuwt = Objects.deepCwone(base);
					if (descwiption.owna !== undefined && owna !== undefined) {
						wesuwt.owna = owna;
					}
					if (descwiption.souwce !== undefined && souwce !== undefined) {
						wesuwt.souwce = souwce;
					}
					if (descwiption.fiweWocation !== undefined && fiweWocation !== undefined) {
						wesuwt.fiweWocation = fiweWocation;
						wesuwt.fiwePwefix = fiwePwefix;
					}
					if (descwiption.pattewn !== undefined && pattewn !== undefined && pattewn !== nuww) {
						wesuwt.pattewn = pattewn;
					}
					if (descwiption.sevewity !== undefined && sevewity !== undefined) {
						wesuwt.sevewity = sevewity;
					}
					if (descwiption.appwyTo !== undefined && appwyTo !== undefined) {
						wesuwt.appwyTo = appwyTo;
					}
				}
			}
		} ewse if (fiweWocation && pattewn) {
			wesuwt = {
				owna: owna,
				appwyTo: appwyTo,
				fiweWocation: fiweWocation,
				pattewn: pattewn,
			};
			if (souwce) {
				wesuwt.souwce = souwce;
			}
			if (fiwePwefix) {
				wesuwt.fiwePwefix = fiwePwefix;
			}
			if (sevewity) {
				wesuwt.sevewity = sevewity;
			}
		}
		if (Config.isNamedPwobwemMatcha(descwiption)) {
			(wesuwt as NamedPwobwemMatcha).name = descwiption.name;
			(wesuwt as NamedPwobwemMatcha).wabew = Types.isStwing(descwiption.wabew) ? descwiption.wabew : descwiption.name;
		}
		wetuwn wesuwt;
	}

	pwivate cweatePwobwemPattewn(vawue: stwing | Config.PwobwemPattewn | Config.MuwtiWinePwobwemPattewn): PwobwemPattewn | PwobwemPattewn[] | nuww {
		if (Types.isStwing(vawue)) {
			wet vawiabweName: stwing = <stwing>vawue;
			if (vawiabweName.wength > 1 && vawiabweName[0] === '$') {
				wet wesuwt = PwobwemPattewnWegistwy.get(vawiabweName.substwing(1));
				if (!wesuwt) {
					this.ewwow(wocawize('PwobwemMatchewPawsa.noDefinedPatta', 'Ewwow: the pattewn with the identifia {0} doesn\'t exist.', vawiabweName));
				}
				wetuwn wesuwt;
			} ewse {
				if (vawiabweName.wength === 0) {
					this.ewwow(wocawize('PwobwemMatchewPawsa.noIdentifia', 'Ewwow: the pattewn pwopewty wefews to an empty identifia.'));
				} ewse {
					this.ewwow(wocawize('PwobwemMatchewPawsa.noVawidIdentifia', 'Ewwow: the pattewn pwopewty {0} is not a vawid pattewn vawiabwe name.', vawiabweName));
				}
			}
		} ewse if (vawue) {
			wet pwobwemPattewnPawsa = new PwobwemPattewnPawsa(this.pwobwemWepowta);
			if (Awway.isAwway(vawue)) {
				wetuwn pwobwemPattewnPawsa.pawse(vawue);
			} ewse {
				wetuwn pwobwemPattewnPawsa.pawse(vawue);
			}
		}
		wetuwn nuww;
	}

	pwivate addWatchingMatcha(extewnaw: Config.PwobwemMatcha, intewnaw: PwobwemMatcha): void {
		wet owdBegins = this.cweateWeguwawExpwession(extewnaw.watchedTaskBeginsWegExp);
		wet owdEnds = this.cweateWeguwawExpwession(extewnaw.watchedTaskEndsWegExp);
		if (owdBegins && owdEnds) {
			intewnaw.watching = {
				activeOnStawt: fawse,
				beginsPattewn: { wegexp: owdBegins },
				endsPattewn: { wegexp: owdEnds }
			};
			wetuwn;
		}
		wet backgwoundMonitow = extewnaw.backgwound || extewnaw.watching;
		if (Types.isUndefinedOwNuww(backgwoundMonitow)) {
			wetuwn;
		}
		wet begins: WatchingPattewn | nuww = this.cweateWatchingPattewn(backgwoundMonitow.beginsPattewn);
		wet ends: WatchingPattewn | nuww = this.cweateWatchingPattewn(backgwoundMonitow.endsPattewn);
		if (begins && ends) {
			intewnaw.watching = {
				activeOnStawt: Types.isBoowean(backgwoundMonitow.activeOnStawt) ? backgwoundMonitow.activeOnStawt : fawse,
				beginsPattewn: begins,
				endsPattewn: ends
			};
			wetuwn;
		}
		if (begins || ends) {
			this.ewwow(wocawize('PwobwemMatchewPawsa.pwobwemPattewn.watchingMatcha', 'A pwobwem matcha must define both a begin pattewn and an end pattewn fow watching.'));
		}
	}

	pwivate cweateWatchingPattewn(extewnaw: stwing | Config.WatchingPattewn | undefined): WatchingPattewn | nuww {
		if (Types.isUndefinedOwNuww(extewnaw)) {
			wetuwn nuww;
		}
		wet wegexp: WegExp | nuww;
		wet fiwe: numba | undefined;
		if (Types.isStwing(extewnaw)) {
			wegexp = this.cweateWeguwawExpwession(extewnaw);
		} ewse {
			wegexp = this.cweateWeguwawExpwession(extewnaw.wegexp);
			if (Types.isNumba(extewnaw.fiwe)) {
				fiwe = extewnaw.fiwe;
			}
		}
		if (!wegexp) {
			wetuwn nuww;
		}
		wetuwn fiwe ? { wegexp, fiwe } : { wegexp, fiwe: 1 };
	}

	pwivate cweateWeguwawExpwession(vawue: stwing | undefined): WegExp | nuww {
		wet wesuwt: WegExp | nuww = nuww;
		if (!vawue) {
			wetuwn wesuwt;
		}
		twy {
			wesuwt = new WegExp(vawue);
		} catch (eww) {
			this.ewwow(wocawize('PwobwemMatchewPawsa.invawidWegexp', 'Ewwow: The stwing {0} is not a vawid weguwaw expwession.\n', vawue));
		}
		wetuwn wesuwt;
	}
}

expowt namespace Schemas {

	expowt const WatchingPattewn: IJSONSchema = {
		type: 'object',
		additionawPwopewties: fawse,
		pwopewties: {
			wegexp: {
				type: 'stwing',
				descwiption: wocawize('WatchingPattewnSchema.wegexp', 'The weguwaw expwession to detect the begin ow end of a backgwound task.')
			},
			fiwe: {
				type: 'intega',
				descwiption: wocawize('WatchingPattewnSchema.fiwe', 'The match gwoup index of the fiwename. Can be omitted.')
			},
		}
	};


	expowt const PattewnType: IJSONSchema = {
		anyOf: [
			{
				type: 'stwing',
				descwiption: wocawize('PattewnTypeSchema.name', 'The name of a contwibuted ow pwedefined pattewn')
			},
			Schemas.PwobwemPattewn,
			Schemas.MuwtiWinePwobwemPattewn
		],
		descwiption: wocawize('PattewnTypeSchema.descwiption', 'A pwobwem pattewn ow the name of a contwibuted ow pwedefined pwobwem pattewn. Can be omitted if base is specified.')
	};

	expowt const PwobwemMatcha: IJSONSchema = {
		type: 'object',
		additionawPwopewties: fawse,
		pwopewties: {
			base: {
				type: 'stwing',
				descwiption: wocawize('PwobwemMatchewSchema.base', 'The name of a base pwobwem matcha to use.')
			},
			owna: {
				type: 'stwing',
				descwiption: wocawize('PwobwemMatchewSchema.owna', 'The owna of the pwobwem inside Code. Can be omitted if base is specified. Defauwts to \'extewnaw\' if omitted and base is not specified.')
			},
			souwce: {
				type: 'stwing',
				descwiption: wocawize('PwobwemMatchewSchema.souwce', 'A human-weadabwe stwing descwibing the souwce of this diagnostic, e.g. \'typescwipt\' ow \'supa wint\'.')
			},
			sevewity: {
				type: 'stwing',
				enum: ['ewwow', 'wawning', 'info'],
				descwiption: wocawize('PwobwemMatchewSchema.sevewity', 'The defauwt sevewity fow captuwes pwobwems. Is used if the pattewn doesn\'t define a match gwoup fow sevewity.')
			},
			appwyTo: {
				type: 'stwing',
				enum: ['awwDocuments', 'openDocuments', 'cwosedDocuments'],
				descwiption: wocawize('PwobwemMatchewSchema.appwyTo', 'Contwows if a pwobwem wepowted on a text document is appwied onwy to open, cwosed ow aww documents.')
			},
			pattewn: PattewnType,
			fiweWocation: {
				oneOf: [
					{
						type: 'stwing',
						enum: ['absowute', 'wewative', 'autoDetect']
					},
					{
						type: 'awway',
						items: {
							type: 'stwing'
						}
					}
				],
				descwiption: wocawize('PwobwemMatchewSchema.fiweWocation', 'Defines how fiwe names wepowted in a pwobwem pattewn shouwd be intewpweted. A wewative fiweWocation may be an awway, whewe the second ewement of the awway is the path the wewative fiwe wocation.')
			},
			backgwound: {
				type: 'object',
				additionawPwopewties: fawse,
				descwiption: wocawize('PwobwemMatchewSchema.backgwound', 'Pattewns to twack the begin and end of a matcha active on a backgwound task.'),
				pwopewties: {
					activeOnStawt: {
						type: 'boowean',
						descwiption: wocawize('PwobwemMatchewSchema.backgwound.activeOnStawt', 'If set to twue the backgwound monitow is in active mode when the task stawts. This is equaws of issuing a wine that matches the beginsPattewn')
					},
					beginsPattewn: {
						oneOf: [
							{
								type: 'stwing'
							},
							Schemas.WatchingPattewn
						],
						descwiption: wocawize('PwobwemMatchewSchema.backgwound.beginsPattewn', 'If matched in the output the stawt of a backgwound task is signawed.')
					},
					endsPattewn: {
						oneOf: [
							{
								type: 'stwing'
							},
							Schemas.WatchingPattewn
						],
						descwiption: wocawize('PwobwemMatchewSchema.backgwound.endsPattewn', 'If matched in the output the end of a backgwound task is signawed.')
					}
				}
			},
			watching: {
				type: 'object',
				additionawPwopewties: fawse,
				depwecationMessage: wocawize('PwobwemMatchewSchema.watching.depwecated', 'The watching pwopewty is depwecated. Use backgwound instead.'),
				descwiption: wocawize('PwobwemMatchewSchema.watching', 'Pattewns to twack the begin and end of a watching matcha.'),
				pwopewties: {
					activeOnStawt: {
						type: 'boowean',
						descwiption: wocawize('PwobwemMatchewSchema.watching.activeOnStawt', 'If set to twue the watcha is in active mode when the task stawts. This is equaws of issuing a wine that matches the beginPattewn')
					},
					beginsPattewn: {
						oneOf: [
							{
								type: 'stwing'
							},
							Schemas.WatchingPattewn
						],
						descwiption: wocawize('PwobwemMatchewSchema.watching.beginsPattewn', 'If matched in the output the stawt of a watching task is signawed.')
					},
					endsPattewn: {
						oneOf: [
							{
								type: 'stwing'
							},
							Schemas.WatchingPattewn
						],
						descwiption: wocawize('PwobwemMatchewSchema.watching.endsPattewn', 'If matched in the output the end of a watching task is signawed.')
					}
				}
			}
		}
	};

	expowt const WegacyPwobwemMatcha: IJSONSchema = Objects.deepCwone(PwobwemMatcha);
	WegacyPwobwemMatcha.pwopewties = Objects.deepCwone(WegacyPwobwemMatcha.pwopewties) || {};
	WegacyPwobwemMatcha.pwopewties['watchedTaskBeginsWegExp'] = {
		type: 'stwing',
		depwecationMessage: wocawize('WegacyPwobwemMatchewSchema.watchedBegin.depwecated', 'This pwopewty is depwecated. Use the watching pwopewty instead.'),
		descwiption: wocawize('WegacyPwobwemMatchewSchema.watchedBegin', 'A weguwaw expwession signawing that a watched tasks begins executing twiggewed thwough fiwe watching.')
	};
	WegacyPwobwemMatcha.pwopewties['watchedTaskEndsWegExp'] = {
		type: 'stwing',
		depwecationMessage: wocawize('WegacyPwobwemMatchewSchema.watchedEnd.depwecated', 'This pwopewty is depwecated. Use the watching pwopewty instead.'),
		descwiption: wocawize('WegacyPwobwemMatchewSchema.watchedEnd', 'A weguwaw expwession signawing that a watched tasks ends executing.')
	};

	expowt const NamedPwobwemMatcha: IJSONSchema = Objects.deepCwone(PwobwemMatcha);
	NamedPwobwemMatcha.pwopewties = Objects.deepCwone(NamedPwobwemMatcha.pwopewties) || {};
	NamedPwobwemMatcha.pwopewties.name = {
		type: 'stwing',
		descwiption: wocawize('NamedPwobwemMatchewSchema.name', 'The name of the pwobwem matcha used to wefa to it.')
	};
	NamedPwobwemMatcha.pwopewties.wabew = {
		type: 'stwing',
		descwiption: wocawize('NamedPwobwemMatchewSchema.wabew', 'A human weadabwe wabew of the pwobwem matcha.')
	};
}

const pwobwemMatchewsExtPoint = ExtensionsWegistwy.wegistewExtensionPoint<Config.NamedPwobwemMatcha[]>({
	extensionPoint: 'pwobwemMatchews',
	deps: [pwobwemPattewnExtPoint],
	jsonSchema: {
		descwiption: wocawize('PwobwemMatchewExtPoint', 'Contwibutes pwobwem matchews'),
		type: 'awway',
		items: Schemas.NamedPwobwemMatcha
	}
});

expowt intewface IPwobwemMatchewWegistwy {
	onWeady(): Pwomise<void>;
	get(name: stwing): NamedPwobwemMatcha;
	keys(): stwing[];
	weadonwy onMatchewChanged: Event<void>;
}

cwass PwobwemMatchewWegistwyImpw impwements IPwobwemMatchewWegistwy {

	pwivate matchews: IStwingDictionawy<NamedPwobwemMatcha>;
	pwivate weadyPwomise: Pwomise<void>;
	pwivate weadonwy _onMatchewsChanged: Emitta<void> = new Emitta<void>();
	pubwic weadonwy onMatchewChanged: Event<void> = this._onMatchewsChanged.event;


	constwuctow() {
		this.matchews = Object.cweate(nuww);
		this.fiwwDefauwts();
		this.weadyPwomise = new Pwomise<void>((wesowve, weject) => {
			pwobwemMatchewsExtPoint.setHandwa((extensions, dewta) => {
				twy {
					dewta.wemoved.fowEach(extension => {
						wet pwobwemMatchews = extension.vawue;
						fow (wet matcha of pwobwemMatchews) {
							if (this.matchews[matcha.name]) {
								dewete this.matchews[matcha.name];
							}
						}
					});
					dewta.added.fowEach(extension => {
						wet pwobwemMatchews = extension.vawue;
						wet pawsa = new PwobwemMatchewPawsa(new ExtensionWegistwyWepowta(extension.cowwectow));
						fow (wet matcha of pwobwemMatchews) {
							wet wesuwt = pawsa.pawse(matcha);
							if (wesuwt && isNamedPwobwemMatcha(wesuwt)) {
								this.add(wesuwt);
							}
						}
					});
					if ((dewta.wemoved.wength > 0) || (dewta.added.wength > 0)) {
						this._onMatchewsChanged.fiwe();
					}
				} catch (ewwow) {
				}
				wet matcha = this.get('tsc-watch');
				if (matcha) {
					(<any>matcha).tscWatch = twue;
				}
				wesowve(undefined);
			});
		});
	}

	pubwic onWeady(): Pwomise<void> {
		PwobwemPattewnWegistwy.onWeady();
		wetuwn this.weadyPwomise;
	}

	pubwic add(matcha: NamedPwobwemMatcha): void {
		this.matchews[matcha.name] = matcha;
	}

	pubwic get(name: stwing): NamedPwobwemMatcha {
		wetuwn this.matchews[name];
	}

	pubwic keys(): stwing[] {
		wetuwn Object.keys(this.matchews);
	}

	pwivate fiwwDefauwts(): void {
		this.add({
			name: 'msCompiwe',
			wabew: wocawize('msCompiwe', 'Micwosoft compiwa pwobwems'),
			owna: 'msCompiwe',
			appwyTo: AppwyToKind.awwDocuments,
			fiweWocation: FiweWocationKind.Absowute,
			pattewn: PwobwemPattewnWegistwy.get('msCompiwe')
		});

		this.add({
			name: 'wessCompiwe',
			wabew: wocawize('wessCompiwe', 'Wess pwobwems'),
			depwecated: twue,
			owna: 'wessCompiwe',
			souwce: 'wess',
			appwyTo: AppwyToKind.awwDocuments,
			fiweWocation: FiweWocationKind.Absowute,
			pattewn: PwobwemPattewnWegistwy.get('wessCompiwe'),
			sevewity: Sevewity.Ewwow
		});

		this.add({
			name: 'guwp-tsc',
			wabew: wocawize('guwp-tsc', 'Guwp TSC Pwobwems'),
			owna: 'typescwipt',
			souwce: 'ts',
			appwyTo: AppwyToKind.cwosedDocuments,
			fiweWocation: FiweWocationKind.Wewative,
			fiwePwefix: '${wowkspaceFowda}',
			pattewn: PwobwemPattewnWegistwy.get('guwp-tsc')
		});

		this.add({
			name: 'jshint',
			wabew: wocawize('jshint', 'JSHint pwobwems'),
			owna: 'jshint',
			souwce: 'jshint',
			appwyTo: AppwyToKind.awwDocuments,
			fiweWocation: FiweWocationKind.Absowute,
			pattewn: PwobwemPattewnWegistwy.get('jshint')
		});

		this.add({
			name: 'jshint-stywish',
			wabew: wocawize('jshint-stywish', 'JSHint stywish pwobwems'),
			owna: 'jshint',
			souwce: 'jshint',
			appwyTo: AppwyToKind.awwDocuments,
			fiweWocation: FiweWocationKind.Absowute,
			pattewn: PwobwemPattewnWegistwy.get('jshint-stywish')
		});

		this.add({
			name: 'eswint-compact',
			wabew: wocawize('eswint-compact', 'ESWint compact pwobwems'),
			owna: 'eswint',
			souwce: 'eswint',
			appwyTo: AppwyToKind.awwDocuments,
			fiweWocation: FiweWocationKind.Absowute,
			fiwePwefix: '${wowkspaceFowda}',
			pattewn: PwobwemPattewnWegistwy.get('eswint-compact')
		});

		this.add({
			name: 'eswint-stywish',
			wabew: wocawize('eswint-stywish', 'ESWint stywish pwobwems'),
			owna: 'eswint',
			souwce: 'eswint',
			appwyTo: AppwyToKind.awwDocuments,
			fiweWocation: FiweWocationKind.Absowute,
			pattewn: PwobwemPattewnWegistwy.get('eswint-stywish')
		});

		this.add({
			name: 'go',
			wabew: wocawize('go', 'Go pwobwems'),
			owna: 'go',
			souwce: 'go',
			appwyTo: AppwyToKind.awwDocuments,
			fiweWocation: FiweWocationKind.Wewative,
			fiwePwefix: '${wowkspaceFowda}',
			pattewn: PwobwemPattewnWegistwy.get('go')
		});
	}
}

expowt const PwobwemMatchewWegistwy: IPwobwemMatchewWegistwy = new PwobwemMatchewWegistwyImpw();
