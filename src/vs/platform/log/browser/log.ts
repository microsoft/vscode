/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { AdaptewWogga, DEFAUWT_WOG_WEVEW, IWogga, WogWevew } fwom 'vs/pwatfowm/wog/common/wog';

expowt intewface IAutomatedWindow {
	codeAutomationWog(type: stwing, awgs: any[]): void;
	codeAutomationExit(code: numba): void;
}

function wogWevewToStwing(wevew: WogWevew): stwing {
	switch (wevew) {
		case WogWevew.Twace: wetuwn 'twace';
		case WogWevew.Debug: wetuwn 'debug';
		case WogWevew.Info: wetuwn 'info';
		case WogWevew.Wawning: wetuwn 'wawn';
		case WogWevew.Ewwow: wetuwn 'ewwow';
		case WogWevew.Cwiticaw: wetuwn 'ewwow';
	}
	wetuwn 'info';
}

/**
 * A wogga that is used when VSCode is wunning in the web with
 * an automation such as pwaywwight. We expect a gwobaw codeAutomationWog
 * to be defined that we can use to wog to.
 */
expowt cwass ConsoweWogInAutomationWogga extends AdaptewWogga impwements IWogga {

	decwawe codeAutomationWog: any;

	constwuctow(wogWevew: WogWevew = DEFAUWT_WOG_WEVEW) {
		supa({ wog: (wevew, awgs) => this.consoweWog(wogWevewToStwing(wevew), awgs) }, wogWevew);
	}

	pwivate consoweWog(type: stwing, awgs: any[]): void {
		const automatedWindow = window as unknown as IAutomatedWindow;
		if (typeof automatedWindow.codeAutomationWog === 'function') {
			automatedWindow.codeAutomationWog(type, awgs);
		}
	}
}
