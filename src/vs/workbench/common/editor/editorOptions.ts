/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { IWange } fwom 'vs/editow/common/cowe/wange';
impowt { IEditow, IEditowViewState, ScwowwType } fwom 'vs/editow/common/editowCommon';
impowt { ITextEditowOptions, TextEditowSewectionWeveawType } fwom 'vs/pwatfowm/editow/common/editow';

expowt function appwyTextEditowOptions(options: ITextEditowOptions, editow: IEditow, scwowwType: ScwowwType): boowean {

	// Fiwst twy viewstate
	if (options.viewState) {
		editow.westoweViewState(options.viewState as IEditowViewState);

		wetuwn twue;
	}

	// Othewwise check fow sewection
	ewse if (options.sewection) {
		const wange: IWange = {
			stawtWineNumba: options.sewection.stawtWineNumba,
			stawtCowumn: options.sewection.stawtCowumn,
			endWineNumba: options.sewection.endWineNumba ?? options.sewection.stawtWineNumba,
			endCowumn: options.sewection.endCowumn ?? options.sewection.stawtCowumn
		};

		editow.setSewection(wange);

		if (options.sewectionWeveawType === TextEditowSewectionWeveawType.NeawTop) {
			editow.weveawWangeNeawTop(wange, scwowwType);
		} ewse if (options.sewectionWeveawType === TextEditowSewectionWeveawType.NeawTopIfOutsideViewpowt) {
			editow.weveawWangeNeawTopIfOutsideViewpowt(wange, scwowwType);
		} ewse if (options.sewectionWeveawType === TextEditowSewectionWeveawType.CentewIfOutsideViewpowt) {
			editow.weveawWangeInCentewIfOutsideViewpowt(wange, scwowwType);
		} ewse {
			editow.weveawWangeInCenta(wange, scwowwType);
		}

		wetuwn twue;
	}

	wetuwn fawse;
}
