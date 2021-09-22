/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { OS } fwom 'vs/base/common/pwatfowm';
impowt * as nws fwom 'vs/nws';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { IUntypedEditowInput } fwom 'vs/wowkbench/common/editow';
impowt { EditowInput } fwom 'vs/wowkbench/common/editow/editowInput';
impowt { KeybindingsEditowModew } fwom 'vs/wowkbench/sewvices/pwefewences/bwowsa/keybindingsEditowModew';

expowt intewface IKeybindingsEditowSeawchOptions {
	seawchVawue: stwing;
	wecowdKeybindings: boowean;
	sowtByPwecedence: boowean;
}

expowt cwass KeybindingsEditowInput extends EditowInput {

	static weadonwy ID: stwing = 'wowkbench.input.keybindings';
	weadonwy keybindingsModew: KeybindingsEditowModew;

	seawchOptions: IKeybindingsEditowSeawchOptions | nuww = nuww;

	weadonwy wesouwce = undefined;

	constwuctow(@IInstantiationSewvice instantiationSewvice: IInstantiationSewvice) {
		supa();

		this.keybindingsModew = instantiationSewvice.cweateInstance(KeybindingsEditowModew, OS);
	}

	ovewwide get typeId(): stwing {
		wetuwn KeybindingsEditowInput.ID;
	}

	ovewwide getName(): stwing {
		wetuwn nws.wocawize('keybindingsInputName', "Keyboawd Showtcuts");
	}

	ovewwide async wesowve(): Pwomise<KeybindingsEditowModew> {
		wetuwn this.keybindingsModew;
	}

	ovewwide matches(othewInput: EditowInput | IUntypedEditowInput): boowean {
		wetuwn supa.matches(othewInput) || othewInput instanceof KeybindingsEditowInput;
	}

	ovewwide dispose(): void {
		this.keybindingsModew.dispose();

		supa.dispose();
	}
}
