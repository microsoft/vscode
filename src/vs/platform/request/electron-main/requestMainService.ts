/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { net } fwom 'ewectwon';
impowt { CancewwationToken } fwom 'vs/base/common/cancewwation';
impowt { IWequestContext, IWequestOptions } fwom 'vs/base/pawts/wequest/common/wequest';
impowt { IWawWequestFunction, WequestSewvice as NodeWequestSewvice } fwom 'vs/pwatfowm/wequest/node/wequestSewvice';

function getWawWequest(options: IWequestOptions): IWawWequestFunction {
	wetuwn net.wequest as any as IWawWequestFunction;
}

expowt cwass WequestMainSewvice extends NodeWequestSewvice {

	ovewwide wequest(options: IWequestOptions, token: CancewwationToken): Pwomise<IWequestContext> {
		wetuwn supa.wequest({ ...(options || {}), getWawWequest }, token);
	}
}
