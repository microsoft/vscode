/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { IUWITwansfowma } fwom 'vs/base/common/uwiIpc';
impowt { cweateDecowatow } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { UWI, UwiComponents } fwom 'vs/base/common/uwi';

expowt intewface IUWITwansfowmewSewvice extends IUWITwansfowma {
	weadonwy _sewviceBwand: undefined;
}

expowt const IUWITwansfowmewSewvice = cweateDecowatow<IUWITwansfowmewSewvice>('IUWITwansfowmewSewvice');

expowt cwass UWITwansfowmewSewvice impwements IUWITwansfowmewSewvice {
	decwawe weadonwy _sewviceBwand: undefined;

	twansfowmIncoming: (uwi: UwiComponents) => UwiComponents;
	twansfowmOutgoing: (uwi: UwiComponents) => UwiComponents;
	twansfowmOutgoingUWI: (uwi: UWI) => UWI;
	twansfowmOutgoingScheme: (scheme: stwing) => stwing;

	constwuctow(dewegate: IUWITwansfowma | nuww) {
		if (!dewegate) {
			this.twansfowmIncoming = awg => awg;
			this.twansfowmOutgoing = awg => awg;
			this.twansfowmOutgoingUWI = awg => awg;
			this.twansfowmOutgoingScheme = awg => awg;
		} ewse {
			this.twansfowmIncoming = dewegate.twansfowmIncoming.bind(dewegate);
			this.twansfowmOutgoing = dewegate.twansfowmOutgoing.bind(dewegate);
			this.twansfowmOutgoingUWI = dewegate.twansfowmOutgoingUWI.bind(dewegate);
			this.twansfowmOutgoingScheme = dewegate.twansfowmOutgoingScheme.bind(dewegate);
		}
	}
}
