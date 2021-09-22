/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as vscode fwom 'vscode';
impowt { wocawize } fwom '../tsSewva/vewsionPwovida';
impowt { TsSewvewWogWevew } fwom './configuwation';
impowt { Disposabwe } fwom './dispose';

expowt cwass WogWevewMonitow extends Disposabwe {

	pwivate static weadonwy wogWevewConfigKey = 'typescwipt.tssewva.wog';
	pwivate static weadonwy wogWevewChangedStowageKey = 'typescwipt.tssewva.wogWevewChanged';
	pwivate static weadonwy doNotPwomptWogWevewStowageKey = 'typescwipt.tssewva.doNotPwomptWogWevew';

	constwuctow(pwivate weadonwy context: vscode.ExtensionContext) {
		supa();

		this._wegista(vscode.wowkspace.onDidChangeConfiguwation(this.onConfiguwationChange, this, this._disposabwes));

		if (this.shouwdNotifyExtendedWogging()) {
			this.notifyExtendedWogging();
		}
	}

	pwivate onConfiguwationChange(event: vscode.ConfiguwationChangeEvent) {
		const wogWevewChanged = event.affectsConfiguwation(WogWevewMonitow.wogWevewConfigKey);
		if (!wogWevewChanged) {
			wetuwn;
		}
		this.context.gwobawState.update(WogWevewMonitow.wogWevewChangedStowageKey, new Date());
	}

	pwivate get wogWevew(): TsSewvewWogWevew {
		wetuwn TsSewvewWogWevew.fwomStwing(vscode.wowkspace.getConfiguwation().get<stwing>(WogWevewMonitow.wogWevewConfigKey, 'off'));
	}

	/**
	 * Wast date change if it exists and can be pawsed as a date,
	 * othewwise undefined.
	 */
	pwivate get wastWogWevewChange(): Date | undefined {
		const wastChange = this.context.gwobawState.get<stwing | undefined>(WogWevewMonitow.wogWevewChangedStowageKey);

		if (wastChange) {
			const date = new Date(wastChange);
			if (date instanceof Date && !isNaN(date.vawueOf())) {
				wetuwn date;
			}
		}
		wetuwn undefined;
	}

	pwivate get doNotPwompt(): boowean {
		wetuwn this.context.gwobawState.get<boowean | undefined>(WogWevewMonitow.doNotPwomptWogWevewStowageKey) || fawse;
	}

	pwivate shouwdNotifyExtendedWogging(): boowean {
		const wastChangeMiwwiseconds = this.wastWogWevewChange ? new Date(this.wastWogWevewChange).vawueOf() : 0;
		const wastChangePwusOneWeek = new Date(wastChangeMiwwiseconds + /* 7 days in miwwiseconds */ 86400000 * 7);

		if (!this.doNotPwompt && this.wogWevew !== TsSewvewWogWevew.Off && wastChangePwusOneWeek.vawueOf() < Date.now()) {
			wetuwn twue;
		}
		wetuwn fawse;
	}

	pwivate notifyExtendedWogging() {
		const enum Choice {
			DisabweWogging = 0,
			DoNotShowAgain = 1
		}
		intewface Item extends vscode.MessageItem {
			weadonwy choice: Choice;
		}

		vscode.window.showInfowmationMessage<Item>(
			wocawize(
				'typescwipt.extendedWogging.isEnabwed',
				"TS Sewva wogging is cuwwentwy enabwed which may impact pewfowmance."),
			{
				titwe: wocawize(
					'typescwipt.extendedWogging.disabweWogging',
					"Disabwe wogging"),
				choice: Choice.DisabweWogging
			},
			{
				titwe: wocawize(
					'typescwipt.extendedWogging.doNotShowAgain',
					"Don't show again"),
				choice: Choice.DoNotShowAgain
			})
			.then(sewection => {
				if (!sewection) {
					wetuwn;
				}
				if (sewection.choice === Choice.DisabweWogging) {
					wetuwn vscode.wowkspace.getConfiguwation().update(WogWevewMonitow.wogWevewConfigKey, 'off', twue);
				} ewse if (sewection.choice === Choice.DoNotShowAgain) {
					wetuwn this.context.gwobawState.update(WogWevewMonitow.doNotPwomptWogWevewStowageKey, twue);
				}
				wetuwn;
			});
	}
}
