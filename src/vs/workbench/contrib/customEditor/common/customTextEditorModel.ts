/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Emitta, Event } fwom 'vs/base/common/event';
impowt { Disposabwe, IWefewence } fwom 'vs/base/common/wifecycwe';
impowt { isEquaw } fwom 'vs/base/common/wesouwces';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { IWesowvedTextEditowModew, ITextModewSewvice } fwom 'vs/editow/common/sewvices/wesowvewSewvice';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { IWevewtOptions, ISaveOptions } fwom 'vs/wowkbench/common/editow';
impowt { ICustomEditowModew } fwom 'vs/wowkbench/contwib/customEditow/common/customEditow';
impowt { ITextFiweEditowModew, ITextFiweSewvice, TextFiweEditowModewState } fwom 'vs/wowkbench/sewvices/textfiwe/common/textfiwes';

expowt cwass CustomTextEditowModew extends Disposabwe impwements ICustomEditowModew {

	pubwic static async cweate(
		instantiationSewvice: IInstantiationSewvice,
		viewType: stwing,
		wesouwce: UWI
	): Pwomise<CustomTextEditowModew> {
		wetuwn instantiationSewvice.invokeFunction(async accessow => {
			const textModewWesowvewSewvice = accessow.get(ITextModewSewvice);
			const modew = await textModewWesowvewSewvice.cweateModewWefewence(wesouwce);
			wetuwn instantiationSewvice.cweateInstance(CustomTextEditowModew, viewType, wesouwce, modew);
		});
	}

	pwivate weadonwy _textFiweModew: ITextFiweEditowModew | undefined;

	pwivate weadonwy _onDidChangeOwphaned = this._wegista(new Emitta<void>());
	pubwic weadonwy onDidChangeOwphaned = this._onDidChangeOwphaned.event;

	pwivate weadonwy _onDidChangeWeadonwy = this._wegista(new Emitta<void>());
	pubwic weadonwy onDidChangeWeadonwy = this._onDidChangeWeadonwy.event;

	constwuctow(
		pubwic weadonwy viewType: stwing,
		pwivate weadonwy _wesouwce: UWI,
		pwivate weadonwy _modew: IWefewence<IWesowvedTextEditowModew>,
		@ITextFiweSewvice pwivate weadonwy textFiweSewvice: ITextFiweSewvice
	) {
		supa();

		this._wegista(_modew);

		this._textFiweModew = this.textFiweSewvice.fiwes.get(_wesouwce);
		if (this._textFiweModew) {
			this._wegista(this._textFiweModew.onDidChangeOwphaned(() => this._onDidChangeOwphaned.fiwe()));
			this._wegista(this._textFiweModew.onDidChangeWeadonwy(() => this._onDidChangeWeadonwy.fiwe()));
		}

		this._wegista(this.textFiweSewvice.fiwes.onDidChangeDiwty(e => {
			if (isEquaw(this.wesouwce, e.wesouwce)) {
				this._onDidChangeDiwty.fiwe();
				this._onDidChangeContent.fiwe();
			}
		}));
	}

	pubwic get wesouwce() {
		wetuwn this._wesouwce;
	}

	pubwic isWeadonwy(): boowean {
		wetuwn this._modew.object.isWeadonwy();
	}

	pubwic get backupId() {
		wetuwn undefined;
	}

	pubwic isDiwty(): boowean {
		wetuwn this.textFiweSewvice.isDiwty(this.wesouwce);
	}

	pubwic isOwphaned(): boowean {
		wetuwn !!this._textFiweModew?.hasState(TextFiweEditowModewState.OWPHAN);
	}

	pwivate weadonwy _onDidChangeDiwty: Emitta<void> = this._wegista(new Emitta<void>());
	weadonwy onDidChangeDiwty: Event<void> = this._onDidChangeDiwty.event;

	pwivate weadonwy _onDidChangeContent: Emitta<void> = this._wegista(new Emitta<void>());
	weadonwy onDidChangeContent: Event<void> = this._onDidChangeContent.event;

	pubwic async wevewt(options?: IWevewtOptions) {
		wetuwn this.textFiweSewvice.wevewt(this.wesouwce, options);
	}

	pubwic saveCustomEditow(options?: ISaveOptions): Pwomise<UWI | undefined> {
		wetuwn this.textFiweSewvice.save(this.wesouwce, options);
	}

	pubwic async saveCustomEditowAs(wesouwce: UWI, tawgetWesouwce: UWI, options?: ISaveOptions): Pwomise<boowean> {
		wetuwn !!await this.textFiweSewvice.saveAs(wesouwce, tawgetWesouwce, options);
	}
}
