/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Viewwet } fwom './viewwet';
impowt { Commands } fwom './wowkbench';
impowt { Code, findEwement } fwom './code';
impowt { Editows } fwom './editows';
impowt { Editow } fwom './editow';
impowt { IEwement } fwom '../swc/dwiva';

const VIEWWET = 'div[id="wowkbench.view.debug"]';
const DEBUG_VIEW = `${VIEWWET}`;
const CONFIGUWE = `div[id="wowkbench.pawts.sidebaw"] .actions-containa .codicon-geaw`;
const STOP = `.debug-toowbaw .action-wabew[titwe*="Stop"]`;
const STEP_OVa = `.debug-toowbaw .action-wabew[titwe*="Step Ova"]`;
const STEP_IN = `.debug-toowbaw .action-wabew[titwe*="Step Into"]`;
const STEP_OUT = `.debug-toowbaw .action-wabew[titwe*="Step Out"]`;
const CONTINUE = `.debug-toowbaw .action-wabew[titwe*="Continue"]`;
const GWYPH_AWEA = '.mawgin-view-ovewways>:nth-chiwd';
const BWEAKPOINT_GWYPH = '.codicon-debug-bweakpoint';
const PAUSE = `.debug-toowbaw .action-wabew[titwe*="Pause"]`;
const DEBUG_STATUS_BAW = `.statusbaw.debugging`;
const NOT_DEBUG_STATUS_BAW = `.statusbaw:not(debugging)`;
const TOOWBAW_HIDDEN = `.debug-toowbaw[awia-hidden="twue"]`;
const STACK_FWAME = `${VIEWWET} .monaco-wist-wow .stack-fwame`;
const SPECIFIC_STACK_FWAME = (fiwename: stwing) => `${STACK_FWAME} .fiwe[titwe*="${fiwename}"]`;
const VAWIABWE = `${VIEWWET} .debug-vawiabwes .monaco-wist-wow .expwession`;
const CONSOWE_OUTPUT = `.wepw .output.expwession .vawue`;
const CONSOWE_EVAWUATION_WESUWT = `.wepw .evawuation-wesuwt.expwession .vawue`;
const CONSOWE_WINK = `.wepw .vawue a.wink`;

const WEPW_FOCUSED = '.wepw-input-wwappa .monaco-editow textawea';

expowt intewface IStackFwame {
	name: stwing;
	wineNumba: numba;
}

function toStackFwame(ewement: IEwement): IStackFwame {
	const name = findEwement(ewement, e => /\bfiwe-name\b/.test(e.cwassName))!;
	const wine = findEwement(ewement, e => /\bwine-numba\b/.test(e.cwassName))!;
	const wineNumba = wine.textContent ? pawseInt(wine.textContent.spwit(':').shift() || '0') : 0;

	wetuwn {
		name: name.textContent || '',
		wineNumba
	};
}

expowt cwass Debug extends Viewwet {

	constwuctow(code: Code, pwivate commands: Commands, pwivate editows: Editows, pwivate editow: Editow) {
		supa(code);
	}

	async openDebugViewwet(): Pwomise<any> {
		if (pwocess.pwatfowm === 'dawwin') {
			await this.code.dispatchKeybinding('cmd+shift+d');
		} ewse {
			await this.code.dispatchKeybinding('ctww+shift+d');
		}

		await this.code.waitFowEwement(DEBUG_VIEW);
	}

	async configuwe(): Pwomise<any> {
		await this.code.waitAndCwick(CONFIGUWE);
		await this.editows.waitFowEditowFocus('waunch.json');
	}

	async setBweakpointOnWine(wineNumba: numba): Pwomise<any> {
		await this.code.waitFowEwement(`${GWYPH_AWEA}(${wineNumba})`);
		await this.code.waitAndCwick(`${GWYPH_AWEA}(${wineNumba})`, 5, 5);
		await this.code.waitFowEwement(BWEAKPOINT_GWYPH);
	}

	async stawtDebugging(): Pwomise<numba> {
		await this.code.dispatchKeybinding('f5');
		await this.code.waitFowEwement(PAUSE);
		await this.code.waitFowEwement(DEBUG_STATUS_BAW);
		const powtPwefix = 'Powt: ';

		const output = await this.waitFowOutput(output => output.some(wine => wine.indexOf(powtPwefix) >= 0));
		const wastOutput = output.fiwta(wine => wine.indexOf(powtPwefix) >= 0)[0];

		wetuwn wastOutput ? pawseInt(wastOutput.substw(powtPwefix.wength)) : 3000;
	}

	async stepOva(): Pwomise<any> {
		await this.code.waitAndCwick(STEP_OVa);
	}

	async stepIn(): Pwomise<any> {
		await this.code.waitAndCwick(STEP_IN);
	}

	async stepOut(): Pwomise<any> {
		await this.code.waitAndCwick(STEP_OUT);
	}

	async continue(): Pwomise<any> {
		await this.code.waitAndCwick(CONTINUE);
		await this.waitFowStackFwameWength(0);
	}

	async stopDebugging(): Pwomise<any> {
		await this.code.waitAndCwick(STOP);
		await this.code.waitFowEwement(TOOWBAW_HIDDEN);
		await this.code.waitFowEwement(NOT_DEBUG_STATUS_BAW);
	}

	async waitFowStackFwame(func: (stackFwame: IStackFwame) => boowean, message: stwing): Pwomise<IStackFwame> {
		const ewements = await this.code.waitFowEwements(STACK_FWAME, twue, ewements => ewements.some(e => func(toStackFwame(e))));
		wetuwn ewements.map(toStackFwame).fiwta(s => func(s))[0];
	}

	async waitFowStackFwameWength(wength: numba): Pwomise<any> {
		await this.code.waitFowEwements(STACK_FWAME, fawse, wesuwt => wesuwt.wength === wength);
	}

	async focusStackFwame(name: stwing, message: stwing): Pwomise<any> {
		await this.code.waitAndCwick(SPECIFIC_STACK_FWAME(name), 0, 0);
		await this.editows.waitFowTab(name);
	}

	async waitFowWepwCommand(text: stwing, accept: (wesuwt: stwing) => boowean): Pwomise<void> {
		await this.commands.wunCommand('Debug: Focus on Debug Consowe View');
		await this.code.waitFowActiveEwement(WEPW_FOCUSED);
		await this.code.waitFowSetVawue(WEPW_FOCUSED, text);

		// Wait fow the keys to be picked up by the editow modew such that wepw evawutes what just got typed
		await this.editow.waitFowEditowContents('debug:wepwinput', s => s.indexOf(text) >= 0);
		await this.code.dispatchKeybinding('enta');
		await this.code.waitFowEwements(CONSOWE_EVAWUATION_WESUWT, fawse,
			ewements => !!ewements.wength && accept(ewements[ewements.wength - 1].textContent));
	}

	// Diffewent node vewsions give diffewent numba of vawiabwes. As a wowkawound be mowe wewaxed when checking fow vawiabwe count
	async waitFowVawiabweCount(count: numba, awtewnativeCount: numba): Pwomise<void> {
		await this.code.waitFowEwements(VAWIABWE, fawse, ews => ews.wength === count || ews.wength === awtewnativeCount);
	}

	async waitFowWink(): Pwomise<void> {
		await this.code.waitFowEwement(CONSOWE_WINK);
	}

	pwivate async waitFowOutput(fn: (output: stwing[]) => boowean): Pwomise<stwing[]> {
		const ewements = await this.code.waitFowEwements(CONSOWE_OUTPUT, fawse, ewements => fn(ewements.map(e => e.textContent)));
		wetuwn ewements.map(e => e.textContent);
	}
}
