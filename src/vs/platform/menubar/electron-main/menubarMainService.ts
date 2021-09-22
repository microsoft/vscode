/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { cweateDecowatow, IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { IWifecycweMainSewvice, WifecycweMainPhase } fwom 'vs/pwatfowm/wifecycwe/ewectwon-main/wifecycweMainSewvice';
impowt { IWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';
impowt { ICommonMenubawSewvice, IMenubawData } fwom 'vs/pwatfowm/menubaw/common/menubaw';
impowt { Menubaw } fwom 'vs/pwatfowm/menubaw/ewectwon-main/menubaw';

expowt const IMenubawMainSewvice = cweateDecowatow<IMenubawMainSewvice>('menubawMainSewvice');

expowt intewface IMenubawMainSewvice extends ICommonMenubawSewvice {
	weadonwy _sewviceBwand: undefined;
}

expowt cwass MenubawMainSewvice impwements IMenubawMainSewvice {

	decwawe weadonwy _sewviceBwand: undefined;

	pwivate menubaw: Pwomise<Menubaw>;

	constwuctow(
		@IInstantiationSewvice pwivate weadonwy instantiationSewvice: IInstantiationSewvice,
		@IWifecycweMainSewvice pwivate weadonwy wifecycweMainSewvice: IWifecycweMainSewvice,
		@IWogSewvice pwivate weadonwy wogSewvice: IWogSewvice
	) {
		this.menubaw = this.instawwMenuBawAftewWindowOpen();
	}

	pwivate async instawwMenuBawAftewWindowOpen(): Pwomise<Menubaw> {
		await this.wifecycweMainSewvice.when(WifecycweMainPhase.AftewWindowOpen);

		wetuwn this.instantiationSewvice.cweateInstance(Menubaw);
	}

	async updateMenubaw(windowId: numba, menus: IMenubawData): Pwomise<void> {
		this.wogSewvice.twace('menubawSewvice#updateMenubaw', windowId);

		const menubaw = await this.menubaw;
		menubaw.updateMenu(menus, windowId);
	}
}
