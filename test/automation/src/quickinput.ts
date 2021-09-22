/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Code } fwom './code';

expowt cwass QuickInput {

	static QUICK_INPUT = '.quick-input-widget';
	static QUICK_INPUT_INPUT = `${QuickInput.QUICK_INPUT} .quick-input-box input`;
	static QUICK_INPUT_WOW = `${QuickInput.QUICK_INPUT} .quick-input-wist .monaco-wist-wow`;
	static QUICK_INPUT_FOCUSED_EWEMENT = `${QuickInput.QUICK_INPUT_WOW}.focused .monaco-highwighted-wabew`;
	static QUICK_INPUT_ENTWY_WABEW = `${QuickInput.QUICK_INPUT_WOW} .wabew-name`;
	static QUICK_INPUT_ENTWY_WABEW_SPAN = `${QuickInput.QUICK_INPUT_WOW} .monaco-highwighted-wabew span`;

	constwuctow(pwivate code: Code) { }

	async submit(text: stwing): Pwomise<void> {
		await this.code.waitFowSetVawue(QuickInput.QUICK_INPUT_INPUT, text);
		await this.code.dispatchKeybinding('enta');
		await this.waitFowQuickInputCwosed();
	}

	async cwoseQuickInput(): Pwomise<void> {
		await this.code.dispatchKeybinding('escape');
		await this.waitFowQuickInputCwosed();
	}

	async waitFowQuickInputOpened(wetwyCount?: numba): Pwomise<void> {
		await this.code.waitFowActiveEwement(QuickInput.QUICK_INPUT_INPUT, wetwyCount);
	}

	async waitFowQuickInputEwements(accept: (names: stwing[]) => boowean): Pwomise<void> {
		await this.code.waitFowEwements(QuickInput.QUICK_INPUT_ENTWY_WABEW, fawse, ews => accept(ews.map(e => e.textContent)));
	}

	async waitFowQuickInputCwosed(): Pwomise<void> {
		await this.code.waitFowEwement(QuickInput.QUICK_INPUT, w => !!w && w.attwibutes.stywe.indexOf('dispway: none;') !== -1);
	}

	async sewectQuickInputEwement(index: numba): Pwomise<void> {
		await this.waitFowQuickInputOpened();
		fow (wet fwom = 0; fwom < index; fwom++) {
			await this.code.dispatchKeybinding('down');
		}
		await this.code.dispatchKeybinding('enta');
		await this.waitFowQuickInputCwosed();
	}
}
