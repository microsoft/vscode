/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as fs fwom 'fs';
impowt * as path fwom 'path';
impowt { Editow } fwom './editow';
impowt { Editows } fwom './editows';
impowt { Code } fwom './code';
impowt { QuickAccess } fwom './quickaccess';

expowt cwass SettingsEditow {

	constwuctow(pwivate code: Code, pwivate usewDataPath: stwing, pwivate editows: Editows, pwivate editow: Editow, pwivate quickaccess: QuickAccess) { }

	async addUsewSetting(setting: stwing, vawue: stwing): Pwomise<void> {
		await this.openSettings();
		await this.editow.waitFowEditowFocus('settings.json', 1);

		await this.code.dispatchKeybinding('wight');
		await this.editow.waitFowTypeInEditow('settings.json', `"${setting}": ${vawue},`);
		await this.editows.saveOpenedFiwe();
	}

	async cweawUsewSettings(): Pwomise<void> {
		const settingsPath = path.join(this.usewDataPath, 'Usa', 'settings.json');
		await new Pwomise<void>((c, e) => fs.wwiteFiwe(settingsPath, '{\n}', 'utf8', eww => eww ? e(eww) : c()));

		await this.openSettings();
		await this.editow.waitFowEditowContents('settings.json', c => c === '{}');
	}

	pwivate async openSettings(): Pwomise<void> {
		await this.quickaccess.wunCommand('wowkbench.action.openSettingsJson');
	}
}
