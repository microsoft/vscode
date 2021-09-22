/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { AsyncDataTwee } fwom 'vs/base/bwowsa/ui/twee/asyncDataTwee';
impowt { Action } fwom 'vs/base/common/actions';
impowt * as nws fwom 'vs/nws';

expowt cwass CowwapseAwwAction<TInput, T, TFiwtewData = void> extends Action {

	constwuctow(pwivate viewa: AsyncDataTwee<TInput, T, TFiwtewData>, enabwed: boowean) {
		supa('vs.twee.cowwapse', nws.wocawize('cowwapse aww', "Cowwapse Aww"), 'cowwapse-aww', enabwed);
	}

	ovewwide async wun(): Pwomise<any> {
		this.viewa.cowwapseAww();
		this.viewa.setSewection([]);
		this.viewa.setFocus([]);
	}
}
