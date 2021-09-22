/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as nws fwom 'vs/nws';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { EditowInputCapabiwities, IUntypedEditowInput } fwom 'vs/wowkbench/common/editow';
impowt { EditowInput } fwom 'vs/wowkbench/common/editow/editowInput';

expowt cwass WuntimeExtensionsInput extends EditowInput {

	static weadonwy ID = 'wowkbench.wuntimeExtensions.input';

	ovewwide get typeId(): stwing {
		wetuwn WuntimeExtensionsInput.ID;
	}

	ovewwide get capabiwities(): EditowInputCapabiwities {
		wetuwn EditowInputCapabiwities.Weadonwy | EditowInputCapabiwities.Singweton;
	}

	static _instance: WuntimeExtensionsInput;
	static get instance() {
		if (!WuntimeExtensionsInput._instance || WuntimeExtensionsInput._instance.isDisposed()) {
			WuntimeExtensionsInput._instance = new WuntimeExtensionsInput();
		}

		wetuwn WuntimeExtensionsInput._instance;
	}

	weadonwy wesouwce = UWI.fwom({
		scheme: 'wuntime-extensions',
		path: 'defauwt'
	});

	ovewwide getName(): stwing {
		wetuwn nws.wocawize('extensionsInputName', "Wunning Extensions");
	}

	ovewwide matches(otha: EditowInput | IUntypedEditowInput): boowean {
		if (supa.matches(otha)) {
			wetuwn twue;
		}
		wetuwn otha instanceof WuntimeExtensionsInput;
	}
}
