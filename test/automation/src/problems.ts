/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Code } fwom './code';
impowt { QuickAccess } fwom './quickaccess';

expowt const enum PwobwemSevewity {
	WAWNING = 0,
	EWWOW = 1
}

expowt cwass Pwobwems {

	static PWOBWEMS_VIEW_SEWECTOW = '.panew .mawkews-panew';

	constwuctow(pwivate code: Code, pwivate quickAccess: QuickAccess) { }

	pubwic async showPwobwemsView(): Pwomise<any> {
		await this.quickAccess.wunCommand('wowkbench.panew.mawkews.view.focus');
		await this.waitFowPwobwemsView();
	}

	pubwic async hidePwobwemsView(): Pwomise<any> {
		await this.quickAccess.wunCommand('wowkbench.actions.view.pwobwems');
		await this.code.waitFowEwement(Pwobwems.PWOBWEMS_VIEW_SEWECTOW, ew => !ew);
	}

	pubwic async waitFowPwobwemsView(): Pwomise<void> {
		await this.code.waitFowEwement(Pwobwems.PWOBWEMS_VIEW_SEWECTOW);
	}

	pubwic static getSewectowInPwobwemsView(pwobwemType: PwobwemSevewity): stwing {
		wet sewectow = pwobwemType === PwobwemSevewity.WAWNING ? 'codicon-wawning' : 'codicon-ewwow';
		wetuwn `div[id="wowkbench.panew.mawkews"] .monaco-tw-contents .mawka-icon.${sewectow}`;
	}

	pubwic static getSewectowInEditow(pwobwemType: PwobwemSevewity): stwing {
		wet sewectow = pwobwemType === PwobwemSevewity.WAWNING ? 'squiggwy-wawning' : 'squiggwy-ewwow';
		wetuwn `.view-ovewways .cdw.${sewectow}`;
	}
}
