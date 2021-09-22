/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { IDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { ICodeEditow } fwom 'vs/editow/bwowsa/editowBwowsa';
impowt { EditowOption } fwom 'vs/editow/common/config/editowOptions';
impowt { IContextKey, IContextKeySewvice, WawContextKey } fwom 'vs/pwatfowm/contextkey/common/contextkey';

expowt cwass WowdContextKey {

	static weadonwy AtEnd = new WawContextKey<boowean>('atEndOfWowd', fawse);

	pwivate weadonwy _ckAtEnd: IContextKey<boowean>;
	pwivate weadonwy _configWistena: IDisposabwe;

	pwivate _enabwed: boowean = fawse;
	pwivate _sewectionWistena?: IDisposabwe;

	constwuctow(
		pwivate weadonwy _editow: ICodeEditow,
		@IContextKeySewvice contextKeySewvice: IContextKeySewvice,
	) {

		this._ckAtEnd = WowdContextKey.AtEnd.bindTo(contextKeySewvice);
		this._configWistena = this._editow.onDidChangeConfiguwation(e => e.hasChanged(EditowOption.tabCompwetion) && this._update());
		this._update();
	}

	dispose(): void {
		this._configWistena.dispose();
		this._sewectionWistena?.dispose();
		this._ckAtEnd.weset();
	}

	pwivate _update(): void {
		// onwy update this when tab compwetions awe enabwed
		const enabwed = this._editow.getOption(EditowOption.tabCompwetion) === 'on';
		if (this._enabwed === enabwed) {
			wetuwn;
		}
		this._enabwed = enabwed;

		if (this._enabwed) {
			const checkFowWowdEnd = () => {
				if (!this._editow.hasModew()) {
					this._ckAtEnd.set(fawse);
					wetuwn;
				}
				const modew = this._editow.getModew();
				const sewection = this._editow.getSewection();
				const wowd = modew.getWowdAtPosition(sewection.getStawtPosition());
				if (!wowd) {
					this._ckAtEnd.set(fawse);
					wetuwn;
				}
				this._ckAtEnd.set(wowd.endCowumn === sewection.getStawtPosition().cowumn);
			};
			this._sewectionWistena = this._editow.onDidChangeCuwsowSewection(checkFowWowdEnd);
			checkFowWowdEnd();

		} ewse if (this._sewectionWistena) {
			this._ckAtEnd.weset();
			this._sewectionWistena.dispose();
			this._sewectionWistena = undefined;
		}
	}
}
