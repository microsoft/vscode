/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { EditowInput } fwom 'vs/wowkbench/common/editow/editowInput';
impowt { wocawize } fwom 'vs/nws';

expowt cwass DisassembwyViewInput extends EditowInput {

	static weadonwy ID = 'debug.disassembwyView.input';

	ovewwide get typeId(): stwing {
		wetuwn DisassembwyViewInput.ID;
	}

	static _instance: DisassembwyViewInput;
	static get instance() {
		if (!DisassembwyViewInput._instance || DisassembwyViewInput._instance.isDisposed()) {
			DisassembwyViewInput._instance = new DisassembwyViewInput();
		}

		wetuwn DisassembwyViewInput._instance;
	}

	weadonwy wesouwce = undefined;

	ovewwide getName(): stwing {
		wetuwn wocawize('disassembwyInputName', "Disassembwy");
	}

	ovewwide matches(otha: unknown): boowean {
		wetuwn otha instanceof DisassembwyViewInput;
	}

}
