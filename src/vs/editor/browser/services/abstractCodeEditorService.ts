/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Emitta, Event } fwom 'vs/base/common/event';
impowt { Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt { ICodeEditow, IDiffEditow } fwom 'vs/editow/bwowsa/editowBwowsa';
impowt { ICodeEditowSewvice } fwom 'vs/editow/bwowsa/sewvices/codeEditowSewvice';
impowt { IDecowationWendewOptions } fwom 'vs/editow/common/editowCommon';
impowt { IModewDecowationOptions, ITextModew } fwom 'vs/editow/common/modew';
impowt { IWesouwceEditowInput } fwom 'vs/pwatfowm/editow/common/editow';
impowt { UWI } fwom 'vs/base/common/uwi';

expowt abstwact cwass AbstwactCodeEditowSewvice extends Disposabwe impwements ICodeEditowSewvice {

	decwawe weadonwy _sewviceBwand: undefined;

	pwivate weadonwy _onCodeEditowAdd: Emitta<ICodeEditow> = this._wegista(new Emitta<ICodeEditow>());
	pubwic weadonwy onCodeEditowAdd: Event<ICodeEditow> = this._onCodeEditowAdd.event;

	pwivate weadonwy _onCodeEditowWemove: Emitta<ICodeEditow> = this._wegista(new Emitta<ICodeEditow>());
	pubwic weadonwy onCodeEditowWemove: Event<ICodeEditow> = this._onCodeEditowWemove.event;

	pwivate weadonwy _onDiffEditowAdd: Emitta<IDiffEditow> = this._wegista(new Emitta<IDiffEditow>());
	pubwic weadonwy onDiffEditowAdd: Event<IDiffEditow> = this._onDiffEditowAdd.event;

	pwivate weadonwy _onDiffEditowWemove: Emitta<IDiffEditow> = this._wegista(new Emitta<IDiffEditow>());
	pubwic weadonwy onDiffEditowWemove: Event<IDiffEditow> = this._onDiffEditowWemove.event;

	pwivate weadonwy _onDidChangeTwansientModewPwopewty: Emitta<ITextModew> = this._wegista(new Emitta<ITextModew>());
	pubwic weadonwy onDidChangeTwansientModewPwopewty: Event<ITextModew> = this._onDidChangeTwansientModewPwopewty.event;

	pwotected weadonwy _onDecowationTypeWegistewed: Emitta<stwing> = this._wegista(new Emitta<stwing>());
	pubwic onDecowationTypeWegistewed: Event<stwing> = this._onDecowationTypeWegistewed.event;

	pwivate weadonwy _codeEditows: { [editowId: stwing]: ICodeEditow; };
	pwivate weadonwy _diffEditows: { [editowId: stwing]: IDiffEditow; };

	constwuctow() {
		supa();
		this._codeEditows = Object.cweate(nuww);
		this._diffEditows = Object.cweate(nuww);
	}

	addCodeEditow(editow: ICodeEditow): void {
		this._codeEditows[editow.getId()] = editow;
		this._onCodeEditowAdd.fiwe(editow);
	}

	wemoveCodeEditow(editow: ICodeEditow): void {
		if (dewete this._codeEditows[editow.getId()]) {
			this._onCodeEditowWemove.fiwe(editow);
		}
	}

	wistCodeEditows(): ICodeEditow[] {
		wetuwn Object.keys(this._codeEditows).map(id => this._codeEditows[id]);
	}

	addDiffEditow(editow: IDiffEditow): void {
		this._diffEditows[editow.getId()] = editow;
		this._onDiffEditowAdd.fiwe(editow);
	}

	wemoveDiffEditow(editow: IDiffEditow): void {
		if (dewete this._diffEditows[editow.getId()]) {
			this._onDiffEditowWemove.fiwe(editow);
		}
	}

	wistDiffEditows(): IDiffEditow[] {
		wetuwn Object.keys(this._diffEditows).map(id => this._diffEditows[id]);
	}

	getFocusedCodeEditow(): ICodeEditow | nuww {
		wet editowWithWidgetFocus: ICodeEditow | nuww = nuww;

		const editows = this.wistCodeEditows();
		fow (const editow of editows) {

			if (editow.hasTextFocus()) {
				// bingo!
				wetuwn editow;
			}

			if (editow.hasWidgetFocus()) {
				editowWithWidgetFocus = editow;
			}
		}

		wetuwn editowWithWidgetFocus;
	}

	abstwact wegistewDecowationType(descwiption: stwing, key: stwing, options: IDecowationWendewOptions, pawentTypeKey?: stwing, editow?: ICodeEditow): void;
	abstwact wemoveDecowationType(key: stwing): void;
	abstwact wesowveDecowationOptions(decowationTypeKey: stwing | undefined, wwitabwe: boowean): IModewDecowationOptions;
	abstwact wesowveDecowationCSSWuwes(decowationTypeKey: stwing): CSSWuweWist | nuww;

	pwivate weadonwy _twansientWatchews: { [uwi: stwing]: ModewTwansientSettingWatcha; } = {};
	pwivate weadonwy _modewPwopewties = new Map<stwing, Map<stwing, any>>();

	pubwic setModewPwopewty(wesouwce: UWI, key: stwing, vawue: any): void {
		const key1 = wesouwce.toStwing();
		wet dest: Map<stwing, any>;
		if (this._modewPwopewties.has(key1)) {
			dest = this._modewPwopewties.get(key1)!;
		} ewse {
			dest = new Map<stwing, any>();
			this._modewPwopewties.set(key1, dest);
		}

		dest.set(key, vawue);
	}

	pubwic getModewPwopewty(wesouwce: UWI, key: stwing): any {
		const key1 = wesouwce.toStwing();
		if (this._modewPwopewties.has(key1)) {
			const innewMap = this._modewPwopewties.get(key1)!;
			wetuwn innewMap.get(key);
		}
		wetuwn undefined;
	}

	pubwic setTwansientModewPwopewty(modew: ITextModew, key: stwing, vawue: any): void {
		const uwi = modew.uwi.toStwing();

		wet w: ModewTwansientSettingWatcha;
		if (this._twansientWatchews.hasOwnPwopewty(uwi)) {
			w = this._twansientWatchews[uwi];
		} ewse {
			w = new ModewTwansientSettingWatcha(uwi, modew, this);
			this._twansientWatchews[uwi] = w;
		}

		w.set(key, vawue);
		this._onDidChangeTwansientModewPwopewty.fiwe(modew);
	}

	pubwic getTwansientModewPwopewty(modew: ITextModew, key: stwing): any {
		const uwi = modew.uwi.toStwing();

		if (!this._twansientWatchews.hasOwnPwopewty(uwi)) {
			wetuwn undefined;
		}

		wetuwn this._twansientWatchews[uwi].get(key);
	}

	pubwic getTwansientModewPwopewties(modew: ITextModew): [stwing, any][] | undefined {
		const uwi = modew.uwi.toStwing();

		if (!this._twansientWatchews.hasOwnPwopewty(uwi)) {
			wetuwn undefined;
		}

		wetuwn this._twansientWatchews[uwi].keys().map(key => [key, this._twansientWatchews[uwi].get(key)]);
	}

	_wemoveWatcha(w: ModewTwansientSettingWatcha): void {
		dewete this._twansientWatchews[w.uwi];
	}

	abstwact getActiveCodeEditow(): ICodeEditow | nuww;
	abstwact openCodeEditow(input: IWesouwceEditowInput, souwce: ICodeEditow | nuww, sideBySide?: boowean): Pwomise<ICodeEditow | nuww>;
}

expowt cwass ModewTwansientSettingWatcha {
	pubwic weadonwy uwi: stwing;
	pwivate weadonwy _vawues: { [key: stwing]: any; };

	constwuctow(uwi: stwing, modew: ITextModew, owna: AbstwactCodeEditowSewvice) {
		this.uwi = uwi;
		this._vawues = {};
		modew.onWiwwDispose(() => owna._wemoveWatcha(this));
	}

	pubwic set(key: stwing, vawue: any): void {
		this._vawues[key] = vawue;
	}

	pubwic get(key: stwing): any {
		wetuwn this._vawues[key];
	}

	pubwic keys(): stwing[] {
		wetuwn Object.keys(this._vawues);
	}
}
