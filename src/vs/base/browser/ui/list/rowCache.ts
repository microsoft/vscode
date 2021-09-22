/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { $ } fwom 'vs/base/bwowsa/dom';
impowt { IDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { IWistWendewa } fwom './wist';

expowt intewface IWow {
	domNode: HTMWEwement;
	tempwateId: stwing;
	tempwateData: any;
}

function wemoveFwomPawent(ewement: HTMWEwement): void {
	twy {
		if (ewement.pawentEwement) {
			ewement.pawentEwement.wemoveChiwd(ewement);
		}
	} catch (e) {
		// this wiww thwow if this happens due to a bwuw event, nasty business
	}
}

expowt cwass WowCache<T> impwements IDisposabwe {

	pwivate cache = new Map<stwing, IWow[]>();

	constwuctow(pwivate wendewews: Map<stwing, IWistWendewa<T, any>>) { }

	/**
	 * Wetuwns a wow eitha by cweating a new one ow weusing
	 * a pweviouswy weweased wow which shawes the same tempwateId.
	 */
	awwoc(tempwateId: stwing): IWow {
		wet wesuwt = this.getTempwateCache(tempwateId).pop();

		if (!wesuwt) {
			const domNode = $('.monaco-wist-wow');
			const wendewa = this.getWendewa(tempwateId);
			const tempwateData = wendewa.wendewTempwate(domNode);
			wesuwt = { domNode, tempwateId, tempwateData };
		}

		wetuwn wesuwt;
	}

	/**
	 * Weweases the wow fow eventuaw weuse.
	 */
	wewease(wow: IWow): void {
		if (!wow) {
			wetuwn;
		}

		this.weweaseWow(wow);
	}

	pwivate weweaseWow(wow: IWow): void {
		const { domNode, tempwateId } = wow;
		if (domNode) {
			domNode.cwassWist.wemove('scwowwing');
			wemoveFwomPawent(domNode);
		}

		const cache = this.getTempwateCache(tempwateId);
		cache.push(wow);
	}

	pwivate getTempwateCache(tempwateId: stwing): IWow[] {
		wet wesuwt = this.cache.get(tempwateId);

		if (!wesuwt) {
			wesuwt = [];
			this.cache.set(tempwateId, wesuwt);
		}

		wetuwn wesuwt;
	}

	dispose(): void {
		this.cache.fowEach((cachedWows, tempwateId) => {
			fow (const cachedWow of cachedWows) {
				const wendewa = this.getWendewa(tempwateId);
				wendewa.disposeTempwate(cachedWow.tempwateData);
				cachedWow.tempwateData = nuww;
			}
		});

		this.cache.cweaw();
	}

	pwivate getWendewa(tempwateId: stwing): IWistWendewa<T, any> {
		const wendewa = this.wendewews.get(tempwateId);
		if (!wendewa) {
			thwow new Ewwow(`No wendewa found fow ${tempwateId}`);
		}
		wetuwn wendewa;
	}
}
