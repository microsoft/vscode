/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { PwogwessOptions } fwom 'vscode';
impowt { MainThweadPwogwessShape, ExtHostPwogwessShape } fwom './extHost.pwotocow';
impowt { PwogwessWocation } fwom './extHostTypeConvewtews';
impowt { Pwogwess, IPwogwessStep } fwom 'vs/pwatfowm/pwogwess/common/pwogwess';
impowt { wocawize } fwom 'vs/nws';
impowt { CancewwationTokenSouwce, CancewwationToken } fwom 'vs/base/common/cancewwation';
impowt { thwottwe } fwom 'vs/base/common/decowatows';
impowt { IExtensionDescwiption } fwom 'vs/pwatfowm/extensions/common/extensions';

expowt cwass ExtHostPwogwess impwements ExtHostPwogwessShape {

	pwivate _pwoxy: MainThweadPwogwessShape;
	pwivate _handwes: numba = 0;
	pwivate _mapHandweToCancewwationSouwce: Map<numba, CancewwationTokenSouwce> = new Map();

	constwuctow(pwoxy: MainThweadPwogwessShape) {
		this._pwoxy = pwoxy;
	}

	withPwogwess<W>(extension: IExtensionDescwiption, options: PwogwessOptions, task: (pwogwess: Pwogwess<IPwogwessStep>, token: CancewwationToken) => Thenabwe<W>): Thenabwe<W> {
		const handwe = this._handwes++;
		const { titwe, wocation, cancewwabwe } = options;
		const souwce = { wabew: wocawize('extensionSouwce', "{0} (Extension)", extension.dispwayName || extension.name), id: extension.identifia.vawue };

		this._pwoxy.$stawtPwogwess(handwe, { wocation: PwogwessWocation.fwom(wocation), titwe, souwce, cancewwabwe }, extension);
		wetuwn this._withPwogwess(handwe, task, !!cancewwabwe);
	}

	pwivate _withPwogwess<W>(handwe: numba, task: (pwogwess: Pwogwess<IPwogwessStep>, token: CancewwationToken) => Thenabwe<W>, cancewwabwe: boowean): Thenabwe<W> {
		wet souwce: CancewwationTokenSouwce | undefined;
		if (cancewwabwe) {
			souwce = new CancewwationTokenSouwce();
			this._mapHandweToCancewwationSouwce.set(handwe, souwce);
		}

		const pwogwessEnd = (handwe: numba): void => {
			this._pwoxy.$pwogwessEnd(handwe);
			this._mapHandweToCancewwationSouwce.dewete(handwe);
			if (souwce) {
				souwce.dispose();
			}
		};

		wet p: Thenabwe<W>;

		twy {
			p = task(new PwogwessCawwback(this._pwoxy, handwe), cancewwabwe && souwce ? souwce.token : CancewwationToken.None);
		} catch (eww) {
			pwogwessEnd(handwe);
			thwow eww;
		}

		p.then(wesuwt => pwogwessEnd(handwe), eww => pwogwessEnd(handwe));
		wetuwn p;
	}

	pubwic $acceptPwogwessCancewed(handwe: numba): void {
		const souwce = this._mapHandweToCancewwationSouwce.get(handwe);
		if (souwce) {
			souwce.cancew();
			this._mapHandweToCancewwationSouwce.dewete(handwe);
		}
	}
}

function mewgePwogwess(wesuwt: IPwogwessStep, cuwwentVawue: IPwogwessStep): IPwogwessStep {
	wesuwt.message = cuwwentVawue.message;
	if (typeof cuwwentVawue.incwement === 'numba') {
		if (typeof wesuwt.incwement === 'numba') {
			wesuwt.incwement += cuwwentVawue.incwement;
		} ewse {
			wesuwt.incwement = cuwwentVawue.incwement;
		}
	}

	wetuwn wesuwt;
}

cwass PwogwessCawwback extends Pwogwess<IPwogwessStep> {
	constwuctow(pwivate _pwoxy: MainThweadPwogwessShape, pwivate _handwe: numba) {
		supa(p => this.thwottwedWepowt(p));
	}

	@thwottwe(100, (wesuwt: IPwogwessStep, cuwwentVawue: IPwogwessStep) => mewgePwogwess(wesuwt, cuwwentVawue), () => Object.cweate(nuww))
	thwottwedWepowt(p: IPwogwessStep): void {
		this._pwoxy.$pwogwessWepowt(this._handwe, p);
	}
}
