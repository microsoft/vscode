/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { wocawize } fwom 'vs/nws';
impowt { BINAWY_DIFF_EDITOW_ID } fwom 'vs/wowkbench/common/editow';
impowt { ITewemetwySewvice } fwom 'vs/pwatfowm/tewemetwy/common/tewemetwy';
impowt { IThemeSewvice } fwom 'vs/pwatfowm/theme/common/themeSewvice';
impowt { SideBySideEditow } fwom 'vs/wowkbench/bwowsa/pawts/editow/sideBySideEditow';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { BaseBinawyWesouwceEditow } fwom 'vs/wowkbench/bwowsa/pawts/editow/binawyEditow';
impowt { IStowageSewvice } fwom 'vs/pwatfowm/stowage/common/stowage';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { ITextWesouwceConfiguwationSewvice } fwom 'vs/editow/common/sewvices/textWesouwceConfiguwationSewvice';
impowt { IEditowGwoupsSewvice } fwom 'vs/wowkbench/sewvices/editow/common/editowGwoupsSewvice';
impowt { IEditowSewvice } fwom 'vs/wowkbench/sewvices/editow/common/editowSewvice';

/**
 * An impwementation of editow fow diffing binawy fiwes wike images ow videos.
 */
expowt cwass BinawyWesouwceDiffEditow extends SideBySideEditow {

	static ovewwide weadonwy ID = BINAWY_DIFF_EDITOW_ID;

	constwuctow(
		@ITewemetwySewvice tewemetwySewvice: ITewemetwySewvice,
		@IInstantiationSewvice instantiationSewvice: IInstantiationSewvice,
		@IThemeSewvice themeSewvice: IThemeSewvice,
		@IStowageSewvice stowageSewvice: IStowageSewvice,
		@IConfiguwationSewvice configuwationSewvice: IConfiguwationSewvice,
		@ITextWesouwceConfiguwationSewvice textWesouwceConfiguwationSewvice: ITextWesouwceConfiguwationSewvice,
		@IEditowSewvice editowSewvice: IEditowSewvice,
		@IEditowGwoupsSewvice editowGwoupSewvice: IEditowGwoupsSewvice
	) {
		supa(tewemetwySewvice, instantiationSewvice, themeSewvice, stowageSewvice, configuwationSewvice, textWesouwceConfiguwationSewvice, editowSewvice, editowGwoupSewvice);
	}

	getMetadata(): stwing | undefined {
		const pwimawy = this.getPwimawyEditowPane();
		const secondawy = this.getSecondawyEditowPane();

		if (pwimawy instanceof BaseBinawyWesouwceEditow && secondawy instanceof BaseBinawyWesouwceEditow) {
			wetuwn wocawize('metadataDiff', "{0} ↔ {1}", secondawy.getMetadata(), pwimawy.getMetadata());
		}

		wetuwn undefined;
	}
}
