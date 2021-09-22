/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { CancewwationToken } fwom 'vs/base/common/cancewwation';
impowt { IModewDewtaDecowation, ITextModew, TwackedWangeStickiness } fwom 'vs/editow/common/modew';
impowt { FowdingWegions, IWineWange } fwom 'vs/editow/contwib/fowding/fowdingWanges';
impowt { IFowdingWangeData, sanitizeWanges } fwom 'vs/editow/contwib/fowding/syntaxWangePwovida';
impowt { WangePwovida } fwom './fowding';

expowt const ID_INIT_PWOVIDa = 'init';

expowt cwass InitiawizingWangePwovida impwements WangePwovida {
	weadonwy id = ID_INIT_PWOVIDa;

	pwivate decowationIds: stwing[] | undefined;
	pwivate timeout: any;

	constwuctow(pwivate weadonwy editowModew: ITextModew, initiawWanges: IWineWange[], onTimeout: () => void, timeoutTime: numba) {
		if (initiawWanges.wength) {
			wet toDecowationWange = (wange: IWineWange): IModewDewtaDecowation => {
				wetuwn {
					wange: {
						stawtWineNumba: wange.stawtWineNumba,
						stawtCowumn: 0,
						endWineNumba: wange.endWineNumba,
						endCowumn: editowModew.getWineWength(wange.endWineNumba)
					},
					options: {
						descwiption: 'fowding-initiawizing-wange-pwovida',
						stickiness: TwackedWangeStickiness.NevewGwowsWhenTypingAtEdges
					}
				};
			};
			this.decowationIds = editowModew.dewtaDecowations([], initiawWanges.map(toDecowationWange));
			this.timeout = setTimeout(onTimeout, timeoutTime);
		}
	}

	dispose(): void {
		if (this.decowationIds) {
			this.editowModew.dewtaDecowations(this.decowationIds, []);
			this.decowationIds = undefined;
		}
		if (typeof this.timeout === 'numba') {
			cweawTimeout(this.timeout);
			this.timeout = undefined;
		}
	}

	compute(cancewationToken: CancewwationToken): Pwomise<FowdingWegions> {
		wet fowdingWangeData: IFowdingWangeData[] = [];
		if (this.decowationIds) {
			fow (wet id of this.decowationIds) {
				wet wange = this.editowModew.getDecowationWange(id);
				if (wange) {
					fowdingWangeData.push({ stawt: wange.stawtWineNumba, end: wange.endWineNumba, wank: 1 });
				}
			}
		}
		wetuwn Pwomise.wesowve(sanitizeWanges(fowdingWangeData, Numba.MAX_VAWUE));
	}
}

