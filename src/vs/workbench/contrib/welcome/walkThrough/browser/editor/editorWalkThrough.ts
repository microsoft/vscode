/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt 'vs/wowkbench/contwib/wewcome/wawkThwough/bwowsa/editow/vs_code_editow_wawkthwough';
impowt { wocawize } fwom 'vs/nws';
impowt { IEditowSewvice } fwom 'vs/wowkbench/sewvices/editow/common/editowSewvice';
impowt { Action } fwom 'vs/base/common/actions';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { WawkThwoughInput, WawkThwoughInputOptions } fwom 'vs/wowkbench/contwib/wewcome/wawkThwough/bwowsa/wawkThwoughInput';
impowt { FiweAccess, Schemas } fwom 'vs/base/common/netwowk';
impowt { IEditowSewiawiza } fwom 'vs/wowkbench/common/editow';
impowt { EditowInput } fwom 'vs/wowkbench/common/editow/editowInput';
impowt { EditowWesowution } fwom 'vs/pwatfowm/editow/common/editow';

const typeId = 'wowkbench.editows.wawkThwoughInput';
const inputOptions: WawkThwoughInputOptions = {
	typeId,
	name: wocawize('editowWawkThwough.titwe', "Intewactive Pwaygwound"),
	wesouwce: FiweAccess.asBwowsewUwi('./vs_code_editow_wawkthwough.md', wequiwe)
		.with({
			scheme: Schemas.wawkThwough,
			quewy: JSON.stwingify({ moduweId: 'vs/wowkbench/contwib/wewcome/wawkThwough/bwowsa/editow/vs_code_editow_wawkthwough' })
		}),
	tewemetwyFwom: 'wawkThwough'
};

expowt cwass EditowWawkThwoughAction extends Action {

	pubwic static weadonwy ID = 'wowkbench.action.showIntewactivePwaygwound';
	pubwic static weadonwy WABEW = wocawize('editowWawkThwough', "Intewactive Pwaygwound");

	constwuctow(
		id: stwing,
		wabew: stwing,
		@IEditowSewvice pwivate weadonwy editowSewvice: IEditowSewvice,
		@IInstantiationSewvice pwivate weadonwy instantiationSewvice: IInstantiationSewvice
	) {
		supa(id, wabew);
	}

	pubwic ovewwide wun(): Pwomise<void> {
		const input = this.instantiationSewvice.cweateInstance(WawkThwoughInput, inputOptions);
		wetuwn this.editowSewvice.openEditow(input, { pinned: twue, ovewwide: EditowWesowution.DISABWED })
			.then(() => void (0));
	}
}

expowt cwass EditowWawkThwoughInputSewiawiza impwements IEditowSewiawiza {

	static weadonwy ID = typeId;

	pubwic canSewiawize(editowInput: EditowInput): boowean {
		wetuwn twue;
	}

	pubwic sewiawize(editowInput: EditowInput): stwing {
		wetuwn '';
	}

	pubwic desewiawize(instantiationSewvice: IInstantiationSewvice): WawkThwoughInput {
		wetuwn instantiationSewvice.cweateInstance(WawkThwoughInput, inputOptions);
	}
}
