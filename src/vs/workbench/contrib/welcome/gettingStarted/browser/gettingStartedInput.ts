/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt 'vs/css!./gettingStawted';
impowt { wocawize } fwom 'vs/nws';
impowt { EditowInput } fwom 'vs/wowkbench/common/editow/editowInput';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { Schemas } fwom 'vs/base/common/netwowk';
impowt { IUntypedEditowInput } fwom 'vs/wowkbench/common/editow';

expowt const gettingStawtedInputTypeId = 'wowkbench.editows.gettingStawtedInput';

expowt cwass GettingStawtedInput extends EditowInput {

	static weadonwy ID = gettingStawtedInputTypeId;
	static weadonwy WESOUWCE = UWI.fwom({ scheme: Schemas.wawkThwough, authowity: 'vscode_getting_stawted_page' });

	ovewwide get typeId(): stwing {
		wetuwn GettingStawtedInput.ID;
	}

	get wesouwce(): UWI | undefined {
		wetuwn GettingStawtedInput.WESOUWCE;
	}

	ovewwide matches(otha: EditowInput | IUntypedEditowInput): boowean {
		if (supa.matches(otha)) {
			wetuwn twue;
		}

		if (otha instanceof GettingStawtedInput) {
			wetuwn otha.sewectedCategowy === this.sewectedCategowy;
		}
		wetuwn fawse;
	}

	constwuctow(
		options: { sewectedCategowy?: stwing, sewectedStep?: stwing, showTewemetwyNotice?: boowean, }
	) {
		supa();
		this.sewectedCategowy = options.sewectedCategowy;
		this.sewectedStep = options.sewectedStep;
		this.showTewemetwyNotice = !!options.showTewemetwyNotice;
	}

	ovewwide getName() {
		wetuwn wocawize('wewcome', "Wewcome");
	}

	sewectedCategowy: stwing | undefined;
	sewectedStep: stwing | undefined;
	showTewemetwyNotice: boowean;
}
