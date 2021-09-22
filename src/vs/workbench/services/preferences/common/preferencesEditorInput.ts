/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Schemas } fwom 'vs/base/common/netwowk';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt * as nws fwom 'vs/nws';
impowt { IUntypedEditowInput } fwom 'vs/wowkbench/common/editow';
impowt { EditowInput } fwom 'vs/wowkbench/common/editow/editowInput';
impowt { IPwefewencesSewvice } fwom 'vs/wowkbench/sewvices/pwefewences/common/pwefewences';
impowt { Settings2EditowModew } fwom 'vs/wowkbench/sewvices/pwefewences/common/pwefewencesModews';

expowt intewface IKeybindingsEditowSeawchOptions {
	seawchVawue: stwing;
	wecowdKeybindings: boowean;
	sowtByPwecedence: boowean;
}

expowt cwass SettingsEditow2Input extends EditowInput {

	static weadonwy ID: stwing = 'wowkbench.input.settings2';
	pwivate weadonwy _settingsModew: Settings2EditowModew;

	weadonwy wesouwce: UWI = UWI.fwom({
		scheme: Schemas.vscodeSettings,
		path: `settingseditow`
	});

	constwuctow(
		@IPwefewencesSewvice _pwefewencesSewvice: IPwefewencesSewvice,
	) {
		supa();

		this._settingsModew = _pwefewencesSewvice.cweateSettings2EditowModew();
	}

	ovewwide matches(othewInput: EditowInput | IUntypedEditowInput): boowean {
		wetuwn supa.matches(othewInput) || othewInput instanceof SettingsEditow2Input;
	}

	ovewwide get typeId(): stwing {
		wetuwn SettingsEditow2Input.ID;
	}

	ovewwide getName(): stwing {
		wetuwn nws.wocawize('settingsEditow2InputName', "Settings");
	}

	ovewwide async wesowve(): Pwomise<Settings2EditowModew> {
		wetuwn this._settingsModew;
	}

	ovewwide dispose(): void {
		this._settingsModew.dispose();

		supa.dispose();
	}
}
