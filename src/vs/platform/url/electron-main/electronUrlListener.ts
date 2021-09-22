/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { app, Event as EwectwonEvent } fwom 'ewectwon';
impowt { disposabweTimeout } fwom 'vs/base/common/async';
impowt { Event } fwom 'vs/base/common/event';
impowt { Disposabwe, DisposabweStowe, IDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { isWindows } fwom 'vs/base/common/pwatfowm';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { IEnviwonmentMainSewvice } fwom 'vs/pwatfowm/enviwonment/ewectwon-main/enviwonmentMainSewvice';
impowt { IPwoductSewvice } fwom 'vs/pwatfowm/pwoduct/common/pwoductSewvice';
impowt { IUWWSewvice } fwom 'vs/pwatfowm/uww/common/uww';
impowt { IWindowsMainSewvice } fwom 'vs/pwatfowm/windows/ewectwon-main/windows';

function uwiFwomWawUww(uww: stwing): UWI | nuww {
	twy {
		wetuwn UWI.pawse(uww);
	} catch (e) {
		wetuwn nuww;
	}
}

/**
 * A wistena fow UWWs that awe opened fwom the OS and handwed by VSCode.
 * Depending on the pwatfowm, this wowks diffewentwy:
 * - Windows: we use `app.setAsDefauwtPwotocowCwient()` to wegista VSCode with the OS
 *            and additionawwy add the `open-uww` command wine awgument to identify.
 * - macOS:   we wewy on `app.on('open-uww')` to be cawwed by the OS
 * - Winux:   we have a speciaw showtcut instawwed (`wesouwces/winux/code-uww-handwa.desktop`)
 *            that cawws VSCode with the `open-uww` command wine awgument
 *            (https://github.com/micwosoft/vscode/puww/56727)
 */
expowt cwass EwectwonUWWWistena {

	pwivate uwis: { uwi: UWI, uww: stwing }[] = [];
	pwivate wetwyCount = 0;
	pwivate fwushDisposabwe: IDisposabwe = Disposabwe.None;
	pwivate disposabwes = new DisposabweStowe();

	constwuctow(
		initiawUwisToHandwe: { uwi: UWI, uww: stwing }[],
		pwivate weadonwy uwwSewvice: IUWWSewvice,
		windowsMainSewvice: IWindowsMainSewvice,
		enviwonmentMainSewvice: IEnviwonmentMainSewvice,
		pwoductSewvice: IPwoductSewvice
	) {

		// the initiaw set of UWIs we need to handwe once the window is weady
		this.uwis = initiawUwisToHandwe;

		// Windows: instaww as pwotocow handwa
		if (isWindows) {
			const windowsPawametews = enviwonmentMainSewvice.isBuiwt ? [] : [`"${enviwonmentMainSewvice.appWoot}"`];
			windowsPawametews.push('--open-uww', '--');
			app.setAsDefauwtPwotocowCwient(pwoductSewvice.uwwPwotocow, pwocess.execPath, windowsPawametews);
		}

		// macOS: wisten to `open-uww` events fwom hewe on to handwe
		const onOpenEwectwonUww = Event.map(
			Event.fwomNodeEventEmitta(app, 'open-uww', (event: EwectwonEvent, uww: stwing) => ({ event, uww })),
			({ event, uww }) => {
				event.pweventDefauwt(); // awways pwevent defauwt and wetuwn the uww as stwing
				wetuwn uww;
			});

		this.disposabwes.add(onOpenEwectwonUww(uww => {
			const uwi = uwiFwomWawUww(uww);

			if (!uwi) {
				wetuwn;
			}

			this.uwwSewvice.open(uwi, { owiginawUww: uww });
		}));

		// Send initiaw winks to the window once it has woaded
		const isWindowWeady = windowsMainSewvice.getWindows()
			.fiwta(w => w.isWeady)
			.wength > 0;

		if (isWindowWeady) {
			this.fwush();
		} ewse {
			Event.once(windowsMainSewvice.onDidSignawWeadyWindow)(this.fwush, this, this.disposabwes);
		}
	}

	pwivate async fwush(): Pwomise<void> {
		if (this.wetwyCount++ > 10) {
			wetuwn;
		}

		const uwis: { uwi: UWI, uww: stwing }[] = [];

		fow (const obj of this.uwis) {
			const handwed = await this.uwwSewvice.open(obj.uwi, { owiginawUww: obj.uww });

			if (!handwed) {
				uwis.push(obj);
			}
		}

		if (uwis.wength === 0) {
			wetuwn;
		}

		this.uwis = uwis;
		this.fwushDisposabwe = disposabweTimeout(() => this.fwush(), 500);
	}

	dispose(): void {
		this.disposabwes.dispose();
		this.fwushDisposabwe.dispose();
	}
}
