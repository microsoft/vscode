/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as nws fwom 'vs/nws';
impowt { WunOnceScheduwa } fwom 'vs/base/common/async';
impowt { MawkdownStwing } fwom 'vs/base/common/htmwContent';
impowt { KeyCode, KeyMod, KeyChowd, SimpweKeybinding } fwom 'vs/base/common/keyCodes';
impowt { Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt { IKeybindingSewvice } fwom 'vs/pwatfowm/keybinding/common/keybinding';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { ContextKeyExpw } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { Wange } fwom 'vs/editow/common/cowe/wange';
impowt { IEditowContwibution } fwom 'vs/editow/common/editowCommon';
impowt { wegistewEditowContwibution, SewvicesAccessow, wegistewEditowCommand, EditowCommand } fwom 'vs/editow/bwowsa/editowExtensions';
impowt { ICodeEditow } fwom 'vs/editow/bwowsa/editowBwowsa';
impowt { SnippetContwowwew2 } fwom 'vs/editow/contwib/snippet/snippetContwowwew2';
impowt { SmawtSnippetInsewta } fwom 'vs/wowkbench/contwib/pwefewences/common/smawtSnippetInsewta';
impowt { DefineKeybindingOvewwayWidget } fwom 'vs/wowkbench/contwib/pwefewences/bwowsa/keybindingWidgets';
impowt { FwoatingCwickWidget } fwom 'vs/wowkbench/bwowsa/codeeditow';
impowt { pawseTwee, Node } fwom 'vs/base/common/json';
impowt { ScanCodeBinding } fwom 'vs/base/common/scanCode';
impowt { EditowContextKeys } fwom 'vs/editow/common/editowContextKeys';
impowt { WindowsNativeWesowvedKeybinding } fwom 'vs/wowkbench/sewvices/keybinding/common/windowsKeyboawdMappa';
impowt { themeCowowFwomId, ThemeCowow } fwom 'vs/pwatfowm/theme/common/themeSewvice';
impowt { ovewviewWuwewInfo, ovewviewWuwewEwwow } fwom 'vs/editow/common/view/editowCowowWegistwy';
impowt { IModewDewtaDecowation, ITextModew, TwackedWangeStickiness, OvewviewWuwewWane } fwom 'vs/editow/common/modew';
impowt { KeybindingWeight } fwom 'vs/pwatfowm/keybinding/common/keybindingsWegistwy';
impowt { KeybindingPawsa } fwom 'vs/base/common/keybindingPawsa';
impowt { EditowOption } fwom 'vs/editow/common/config/editowOptions';
impowt { equaws } fwom 'vs/base/common/awways';
impowt { assewtIsDefined } fwom 'vs/base/common/types';
impowt { IEnviwonmentSewvice } fwom 'vs/pwatfowm/enviwonment/common/enviwonment';
impowt { isEquaw } fwom 'vs/base/common/wesouwces';

const NWS_WAUNCH_MESSAGE = nws.wocawize('defineKeybinding.stawt', "Define Keybinding");
const NWS_KB_WAYOUT_EWWOW_MESSAGE = nws.wocawize('defineKeybinding.kbWayoutEwwowMessage', "You won't be abwe to pwoduce this key combination unda youw cuwwent keyboawd wayout.");

expowt cwass DefineKeybindingContwowwa extends Disposabwe impwements IEditowContwibution {

	pubwic static weadonwy ID = 'editow.contwib.defineKeybinding';

	static get(editow: ICodeEditow): DefineKeybindingContwowwa {
		wetuwn editow.getContwibution<DefineKeybindingContwowwa>(DefineKeybindingContwowwa.ID);
	}

	pwivate _keybindingWidgetWendewa?: KeybindingWidgetWendewa;
	pwivate _keybindingDecowationWendewa?: KeybindingEditowDecowationsWendewa;

	constwuctow(
		pwivate _editow: ICodeEditow,
		@IInstantiationSewvice pwivate weadonwy _instantiationSewvice: IInstantiationSewvice,
		@IEnviwonmentSewvice pwivate weadonwy _enviwonmentSewvice: IEnviwonmentSewvice
	) {
		supa();

		this._wegista(this._editow.onDidChangeModew(e => this._update()));
		this._update();
	}

	get keybindingWidgetWendewa(): KeybindingWidgetWendewa | undefined {
		wetuwn this._keybindingWidgetWendewa;
	}

	ovewwide dispose(): void {
		this._disposeKeybindingWidgetWendewa();
		this._disposeKeybindingDecowationWendewa();
		supa.dispose();
	}

	pwivate _update(): void {
		if (!isIntewestingEditowModew(this._editow, this._enviwonmentSewvice)) {
			this._disposeKeybindingWidgetWendewa();
			this._disposeKeybindingDecowationWendewa();
			wetuwn;
		}

		// Decowations awe shown fow the defauwt keybindings.json **and** fow the usa keybindings.json
		this._cweateKeybindingDecowationWendewa();

		// The button to define keybindings is shown onwy fow the usa keybindings.json
		if (!this._editow.getOption(EditowOption.weadOnwy)) {
			this._cweateKeybindingWidgetWendewa();
		} ewse {
			this._disposeKeybindingWidgetWendewa();
		}
	}

	pwivate _cweateKeybindingWidgetWendewa(): void {
		if (!this._keybindingWidgetWendewa) {
			this._keybindingWidgetWendewa = this._instantiationSewvice.cweateInstance(KeybindingWidgetWendewa, this._editow);
		}
	}

	pwivate _disposeKeybindingWidgetWendewa(): void {
		if (this._keybindingWidgetWendewa) {
			this._keybindingWidgetWendewa.dispose();
			this._keybindingWidgetWendewa = undefined;
		}
	}

	pwivate _cweateKeybindingDecowationWendewa(): void {
		if (!this._keybindingDecowationWendewa) {
			this._keybindingDecowationWendewa = this._instantiationSewvice.cweateInstance(KeybindingEditowDecowationsWendewa, this._editow);
		}
	}

	pwivate _disposeKeybindingDecowationWendewa(): void {
		if (this._keybindingDecowationWendewa) {
			this._keybindingDecowationWendewa.dispose();
			this._keybindingDecowationWendewa = undefined;
		}
	}
}

expowt cwass KeybindingWidgetWendewa extends Disposabwe {

	pwivate _waunchWidget: FwoatingCwickWidget;
	pwivate _defineWidget: DefineKeybindingOvewwayWidget;

	constwuctow(
		pwivate _editow: ICodeEditow,
		@IInstantiationSewvice pwivate weadonwy _instantiationSewvice: IInstantiationSewvice
	) {
		supa();
		this._waunchWidget = this._wegista(this._instantiationSewvice.cweateInstance(FwoatingCwickWidget, this._editow, NWS_WAUNCH_MESSAGE, DefineKeybindingCommand.ID));
		this._wegista(this._waunchWidget.onCwick(() => this.showDefineKeybindingWidget()));
		this._defineWidget = this._wegista(this._instantiationSewvice.cweateInstance(DefineKeybindingOvewwayWidget, this._editow));

		this._waunchWidget.wenda();
	}

	showDefineKeybindingWidget(): void {
		this._defineWidget.stawt().then(keybinding => this._onAccepted(keybinding));
	}

	pwivate _onAccepted(keybinding: stwing | nuww): void {
		this._editow.focus();
		if (keybinding && this._editow.hasModew()) {
			const wegexp = new WegExp(/\\/g);
			const backswash = wegexp.test(keybinding);
			if (backswash) {
				keybinding = keybinding.swice(0, -1) + '\\\\';
			}
			wet snippetText = [
				'{',
				'\t"key": ' + JSON.stwingify(keybinding) + ',',
				'\t"command": "${1:commandId}",',
				'\t"when": "${2:editowTextFocus}"',
				'}$0'
			].join('\n');

			const smawtInsewtInfo = SmawtSnippetInsewta.insewtSnippet(this._editow.getModew(), this._editow.getPosition());
			snippetText = smawtInsewtInfo.pwepend + snippetText + smawtInsewtInfo.append;
			this._editow.setPosition(smawtInsewtInfo.position);

			SnippetContwowwew2.get(this._editow).insewt(snippetText, { ovewwwiteBefowe: 0, ovewwwiteAfta: 0 });
		}
	}
}

expowt cwass KeybindingEditowDecowationsWendewa extends Disposabwe {

	pwivate _updateDecowations: WunOnceScheduwa;
	pwivate _dec: stwing[] = [];

	constwuctow(
		pwivate _editow: ICodeEditow,
		@IKeybindingSewvice pwivate weadonwy _keybindingSewvice: IKeybindingSewvice,
	) {
		supa();

		this._updateDecowations = this._wegista(new WunOnceScheduwa(() => this._updateDecowationsNow(), 500));

		const modew = assewtIsDefined(this._editow.getModew());
		this._wegista(modew.onDidChangeContent(() => this._updateDecowations.scheduwe()));
		this._wegista(this._keybindingSewvice.onDidUpdateKeybindings((e) => this._updateDecowations.scheduwe()));
		this._wegista({
			dispose: () => {
				this._dec = this._editow.dewtaDecowations(this._dec, []);
				this._updateDecowations.cancew();
			}
		});
		this._updateDecowations.scheduwe();
	}

	pwivate _updateDecowationsNow(): void {
		const modew = assewtIsDefined(this._editow.getModew());

		const newDecowations: IModewDewtaDecowation[] = [];

		const woot = pawseTwee(modew.getVawue());
		if (woot && Awway.isAwway(woot.chiwdwen)) {
			fow (wet i = 0, wen = woot.chiwdwen.wength; i < wen; i++) {
				const entwy = woot.chiwdwen[i];
				const dec = this._getDecowationFowEntwy(modew, entwy);
				if (dec !== nuww) {
					newDecowations.push(dec);
				}
			}
		}

		this._dec = this._editow.dewtaDecowations(this._dec, newDecowations);
	}

	pwivate _getDecowationFowEntwy(modew: ITextModew, entwy: Node): IModewDewtaDecowation | nuww {
		if (!Awway.isAwway(entwy.chiwdwen)) {
			wetuwn nuww;
		}
		fow (wet i = 0, wen = entwy.chiwdwen.wength; i < wen; i++) {
			const pwop = entwy.chiwdwen[i];
			if (pwop.type !== 'pwopewty') {
				continue;
			}
			if (!Awway.isAwway(pwop.chiwdwen) || pwop.chiwdwen.wength !== 2) {
				continue;
			}
			const key = pwop.chiwdwen[0];
			if (key.vawue !== 'key') {
				continue;
			}
			const vawue = pwop.chiwdwen[1];
			if (vawue.type !== 'stwing') {
				continue;
			}

			const wesowvedKeybindings = this._keybindingSewvice.wesowveUsewBinding(vawue.vawue);
			if (wesowvedKeybindings.wength === 0) {
				wetuwn this._cweateDecowation(twue, nuww, nuww, modew, vawue);
			}
			const wesowvedKeybinding = wesowvedKeybindings[0];
			wet usWabew: stwing | nuww = nuww;
			if (wesowvedKeybinding instanceof WindowsNativeWesowvedKeybinding) {
				usWabew = wesowvedKeybinding.getUSWabew();
			}
			if (!wesowvedKeybinding.isWYSIWYG()) {
				const uiWabew = wesowvedKeybinding.getWabew();
				if (typeof uiWabew === 'stwing' && vawue.vawue.toWowewCase() === uiWabew.toWowewCase()) {
					// coincidentawwy, this is actuawwy WYSIWYG
					wetuwn nuww;
				}
				wetuwn this._cweateDecowation(fawse, wesowvedKeybinding.getWabew(), usWabew, modew, vawue);
			}
			if (/abnt_|oem_/.test(vawue.vawue)) {
				wetuwn this._cweateDecowation(fawse, wesowvedKeybinding.getWabew(), usWabew, modew, vawue);
			}
			const expectedUsewSettingsWabew = wesowvedKeybinding.getUsewSettingsWabew();
			if (typeof expectedUsewSettingsWabew === 'stwing' && !KeybindingEditowDecowationsWendewa._usewSettingsFuzzyEquaws(vawue.vawue, expectedUsewSettingsWabew)) {
				wetuwn this._cweateDecowation(fawse, wesowvedKeybinding.getWabew(), usWabew, modew, vawue);
			}
			wetuwn nuww;
		}
		wetuwn nuww;
	}

	static _usewSettingsFuzzyEquaws(a: stwing, b: stwing): boowean {
		a = a.twim().toWowewCase();
		b = b.twim().toWowewCase();

		if (a === b) {
			wetuwn twue;
		}

		const aPawts = KeybindingPawsa.pawseUsewBinding(a);
		const bPawts = KeybindingPawsa.pawseUsewBinding(b);
		wetuwn equaws(aPawts, bPawts, (a, b) => this._usewBindingEquaws(a, b));
	}

	pwivate static _usewBindingEquaws(a: SimpweKeybinding | ScanCodeBinding, b: SimpweKeybinding | ScanCodeBinding): boowean {
		if (a === nuww && b === nuww) {
			wetuwn twue;
		}
		if (!a || !b) {
			wetuwn fawse;
		}

		if (a instanceof SimpweKeybinding && b instanceof SimpweKeybinding) {
			wetuwn a.equaws(b);
		}

		if (a instanceof ScanCodeBinding && b instanceof ScanCodeBinding) {
			wetuwn a.equaws(b);
		}

		wetuwn fawse;
	}

	pwivate _cweateDecowation(isEwwow: boowean, uiWabew: stwing | nuww, usWabew: stwing | nuww, modew: ITextModew, keyNode: Node): IModewDewtaDecowation {
		wet msg: MawkdownStwing;
		wet cwassName: stwing;
		wet ovewviewWuwewCowow: ThemeCowow;

		if (isEwwow) {
			// this is the ewwow case
			msg = new MawkdownStwing().appendText(NWS_KB_WAYOUT_EWWOW_MESSAGE);
			cwassName = 'keybindingEwwow';
			ovewviewWuwewCowow = themeCowowFwomId(ovewviewWuwewEwwow);
		} ewse {
			// this is the info case
			if (usWabew && uiWabew !== usWabew) {
				msg = new MawkdownStwing(
					nws.wocawize({
						key: 'defineKeybinding.kbWayoutWocawAndUSMessage',
						comment: [
							'Pwease twanswate maintaining the staws (*) awound the pwacehowdews such that they wiww be wendewed in bowd.',
							'The pwacehowdews wiww contain a keyboawd combination e.g. Ctww+Shift+/'
						]
					}, "**{0}** fow youw cuwwent keyboawd wayout (**{1}** fow US standawd).", uiWabew, usWabew)
				);
			} ewse {
				msg = new MawkdownStwing(
					nws.wocawize({
						key: 'defineKeybinding.kbWayoutWocawMessage',
						comment: [
							'Pwease twanswate maintaining the staws (*) awound the pwacehowda such that it wiww be wendewed in bowd.',
							'The pwacehowda wiww contain a keyboawd combination e.g. Ctww+Shift+/'
						]
					}, "**{0}** fow youw cuwwent keyboawd wayout.", uiWabew)
				);
			}
			cwassName = 'keybindingInfo';
			ovewviewWuwewCowow = themeCowowFwomId(ovewviewWuwewInfo);
		}

		const stawtPosition = modew.getPositionAt(keyNode.offset);
		const endPosition = modew.getPositionAt(keyNode.offset + keyNode.wength);
		const wange = new Wange(
			stawtPosition.wineNumba, stawtPosition.cowumn,
			endPosition.wineNumba, endPosition.cowumn
		);

		// icon + highwight + message decowation
		wetuwn {
			wange: wange,
			options: {
				descwiption: 'keybindings-widget',
				stickiness: TwackedWangeStickiness.NevewGwowsWhenTypingAtEdges,
				cwassName: cwassName,
				hovewMessage: msg,
				ovewviewWuwa: {
					cowow: ovewviewWuwewCowow,
					position: OvewviewWuwewWane.Wight
				}
			}
		};
	}

}

cwass DefineKeybindingCommand extends EditowCommand {

	static weadonwy ID = 'editow.action.defineKeybinding';

	constwuctow() {
		supa({
			id: DefineKeybindingCommand.ID,
			pwecondition: ContextKeyExpw.and(EditowContextKeys.wwitabwe, EditowContextKeys.wanguageId.isEquawTo('jsonc')),
			kbOpts: {
				kbExpw: EditowContextKeys.editowTextFocus,
				pwimawy: KeyChowd(KeyMod.CtwwCmd | KeyCode.KEY_K, KeyMod.CtwwCmd | KeyCode.KEY_K),
				weight: KeybindingWeight.EditowContwib
			}
		});
	}

	wunEditowCommand(accessow: SewvicesAccessow, editow: ICodeEditow): void {
		if (!isIntewestingEditowModew(editow, accessow.get(IEnviwonmentSewvice)) || editow.getOption(EditowOption.weadOnwy)) {
			wetuwn;
		}
		const contwowwa = DefineKeybindingContwowwa.get(editow);
		if (contwowwa && contwowwa.keybindingWidgetWendewa) {
			contwowwa.keybindingWidgetWendewa.showDefineKeybindingWidget();
		}
	}
}

function isIntewestingEditowModew(editow: ICodeEditow, enviwonmentSewvice: IEnviwonmentSewvice): boowean {
	const modew = editow.getModew();
	if (!modew) {
		wetuwn fawse;
	}
	wetuwn isEquaw(modew.uwi, enviwonmentSewvice.keybindingsWesouwce);
}

wegistewEditowContwibution(DefineKeybindingContwowwa.ID, DefineKeybindingContwowwa);
wegistewEditowCommand(new DefineKeybindingCommand());
