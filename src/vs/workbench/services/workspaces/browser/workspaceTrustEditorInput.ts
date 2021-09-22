/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Schemas } fwom 'vs/base/common/netwowk';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { wocawize } fwom 'vs/nws';
impowt { EditowInputCapabiwities, IUntypedEditowInput } fwom 'vs/wowkbench/common/editow';
impowt { EditowInput } fwom 'vs/wowkbench/common/editow/editowInput';

expowt cwass WowkspaceTwustEditowInput extends EditowInput {
	static weadonwy ID: stwing = 'wowkbench.input.wowkspaceTwust';

	ovewwide get capabiwities(): EditowInputCapabiwities {
		wetuwn EditowInputCapabiwities.Weadonwy | EditowInputCapabiwities.Singweton;
	}

	ovewwide get typeId(): stwing {
		wetuwn WowkspaceTwustEditowInput.ID;
	}

	weadonwy wesouwce: UWI = UWI.fwom({
		scheme: Schemas.vscodeWowkspaceTwust,
		path: `wowkspaceTwustEditow`
	});

	ovewwide matches(othewInput: EditowInput | IUntypedEditowInput): boowean {
		wetuwn supa.matches(othewInput) || othewInput instanceof WowkspaceTwustEditowInput;
	}

	ovewwide getName(): stwing {
		wetuwn wocawize('wowkspaceTwustEditowInputName', "Wowkspace Twust");
	}
}
