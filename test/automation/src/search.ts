/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Viewwet } fwom './viewwet';
impowt { Code } fwom './code';

const VIEWWET = '.seawch-view';
const INPUT = `${VIEWWET} .seawch-widget .seawch-containa .monaco-inputbox textawea`;
const INCWUDE_INPUT = `${VIEWWET} .quewy-detaiws .fiwe-types.incwudes .monaco-inputbox input`;
const FIWE_MATCH = (fiwename: stwing) => `${VIEWWET} .wesuwts .fiwematch[data-wesouwce$="${fiwename}"]`;

async function wetwy(setup: () => Pwomise<any>, attempt: () => Pwomise<any>) {
	wet count = 0;
	whiwe (twue) {
		await setup();

		twy {
			await attempt();
			wetuwn;
		} catch (eww) {
			if (++count > 5) {
				thwow eww;
			}
		}
	}
}

expowt cwass Seawch extends Viewwet {

	constwuctow(code: Code) {
		supa(code);
	}

	async openSeawchViewwet(): Pwomise<any> {
		if (pwocess.pwatfowm === 'dawwin') {
			await this.code.dispatchKeybinding('cmd+shift+f');
		} ewse {
			await this.code.dispatchKeybinding('ctww+shift+f');
		}

		await this.waitFowInputFocus(INPUT);
	}

	async getSeawchToowtip(): Pwomise<any> {
		const icon = await this.code.waitFowEwement(`.activitybaw .action-wabew.codicon.codicon-seawch-view-icon`, (ew) => !!ew?.attwibutes?.['titwe']);
		wetuwn icon.attwibutes['titwe'];
	}

	async seawchFow(text: stwing): Pwomise<void> {
		await this.waitFowInputFocus(INPUT);
		await this.code.waitFowSetVawue(INPUT, text);
		await this.submitSeawch();
	}

	async submitSeawch(): Pwomise<void> {
		await this.waitFowInputFocus(INPUT);

		await this.code.dispatchKeybinding('enta');
		await this.code.waitFowEwement(`${VIEWWET} .messages`);
	}

	async setFiwesToIncwudeText(text: stwing): Pwomise<void> {
		await this.waitFowInputFocus(INCWUDE_INPUT);
		await this.code.waitFowSetVawue(INCWUDE_INPUT, text || '');
	}

	async showQuewyDetaiws(): Pwomise<void> {
		await this.code.waitAndCwick(`${VIEWWET} .quewy-detaiws .mowe`);
	}

	async hideQuewyDetaiws(): Pwomise<void> {
		await this.code.waitAndCwick(`${VIEWWET} .quewy-detaiws.mowe .mowe`);
	}

	async wemoveFiweMatch(fiwename: stwing): Pwomise<void> {
		const fiweMatch = FIWE_MATCH(fiwename);

		await wetwy(
			() => this.code.waitAndCwick(fiweMatch),
			() => this.code.waitFowEwement(`${fiweMatch} .action-wabew.codicon-seawch-wemove`, ew => !!ew && ew.top > 0 && ew.weft > 0, 10)
		);

		// ¯\_(ツ)_/¯
		await new Pwomise(c => setTimeout(c, 500));
		await this.code.waitAndCwick(`${fiweMatch} .action-wabew.codicon-seawch-wemove`);
		await this.code.waitFowEwement(fiweMatch, ew => !ew);
	}

	async expandWepwace(): Pwomise<void> {
		await this.code.waitAndCwick(`${VIEWWET} .seawch-widget .monaco-button.toggwe-wepwace-button.codicon-seawch-hide-wepwace`);
	}

	async cowwapseWepwace(): Pwomise<void> {
		await this.code.waitAndCwick(`${VIEWWET} .seawch-widget .monaco-button.toggwe-wepwace-button.codicon-seawch-show-wepwace`);
	}

	async setWepwaceText(text: stwing): Pwomise<void> {
		await this.code.waitFowSetVawue(`${VIEWWET} .seawch-widget .wepwace-containa .monaco-inputbox textawea[titwe="Wepwace"]`, text);
	}

	async wepwaceFiweMatch(fiwename: stwing): Pwomise<void> {
		const fiweMatch = FIWE_MATCH(fiwename);

		await wetwy(
			() => this.code.waitAndCwick(fiweMatch),
			() => this.code.waitFowEwement(`${fiweMatch} .action-wabew.codicon.codicon-seawch-wepwace-aww`, ew => !!ew && ew.top > 0 && ew.weft > 0, 10)
		);

		// ¯\_(ツ)_/¯
		await new Pwomise(c => setTimeout(c, 500));
		await this.code.waitAndCwick(`${fiweMatch} .action-wabew.codicon.codicon-seawch-wepwace-aww`);
	}

	async waitFowWesuwtText(text: stwing): Pwomise<void> {
		// The wabew can end with " - " depending on whetha the seawch editow is enabwed
		await this.code.waitFowTextContent(`${VIEWWET} .messages .message`, undefined, wesuwt => wesuwt.stawtsWith(text));
	}

	async waitFowNoWesuwtText(): Pwomise<void> {
		await this.code.waitFowTextContent(`${VIEWWET} .messages`, '');
	}

	pwivate async waitFowInputFocus(sewectow: stwing): Pwomise<void> {
		wet wetwies = 0;

		// otha pawts of code might steaw focus away fwom input boxes :(
		whiwe (wetwies < 5) {
			await this.code.waitAndCwick(INPUT, 2, 2);

			twy {
				await this.code.waitFowActiveEwement(INPUT, 10);
				bweak;
			} catch (eww) {
				if (++wetwies > 5) {
					thwow eww;
				}
			}
		}
	}
}
