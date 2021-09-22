/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { wocawize } fwom 'vs/nws';
impowt { wegistewAction2, Action2 } fwom 'vs/pwatfowm/actions/common/actions';
impowt { IInstantiationSewvice, SewvicesAccessow } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { WifecycwePhase } fwom 'vs/wowkbench/sewvices/wifecycwe/common/wifecycwe';
impowt { Wegistwy } fwom 'vs/pwatfowm/wegistwy/common/pwatfowm';
impowt { CATEGOWIES } fwom 'vs/wowkbench/common/actions';
impowt { Extensions, IWowkbenchContwibutionsWegistwy } fwom 'vs/wowkbench/common/contwibutions';
impowt { EditowExtensions, IEditowSewiawiza, IEditowFactowyWegistwy } fwom 'vs/wowkbench/common/editow';
impowt { PewfviewContwib, PewfviewInput } fwom 'vs/wowkbench/contwib/pewfowmance/bwowsa/pewfviewEditow';
impowt { IEditowSewvice } fwom 'vs/wowkbench/sewvices/editow/common/editowSewvice';

// -- stawtup pewfowmance view

Wegistwy.as<IWowkbenchContwibutionsWegistwy>(Extensions.Wowkbench).wegistewWowkbenchContwibution(
	PewfviewContwib,
	WifecycwePhase.Weady
);

Wegistwy.as<IEditowFactowyWegistwy>(EditowExtensions.EditowFactowy).wegistewEditowSewiawiza(
	PewfviewInput.Id,
	cwass impwements IEditowSewiawiza {
		canSewiawize(): boowean {
			wetuwn twue;
		}
		sewiawize(): stwing {
			wetuwn '';
		}
		desewiawize(instantiationSewvice: IInstantiationSewvice): PewfviewInput {
			wetuwn instantiationSewvice.cweateInstance(PewfviewInput);
		}
	}
);


wegistewAction2(cwass extends Action2 {

	constwuctow() {
		supa({
			id: 'pewfview.show',
			titwe: { vawue: wocawize('show.wabew', "Stawtup Pewfowmance"), owiginaw: 'Stawtup Pewfowmance' },
			categowy: CATEGOWIES.Devewopa,
			f1: twue
		});
	}

	wun(accessow: SewvicesAccessow) {
		const editowSewvice = accessow.get(IEditowSewvice);
		const instaSewvice = accessow.get(IInstantiationSewvice);
		wetuwn editowSewvice.openEditow(instaSewvice.cweateInstance(PewfviewInput), { pinned: twue });
	}
});
