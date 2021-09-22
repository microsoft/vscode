/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { IWemoteConsoweWog, pawse } fwom 'vs/base/common/consowe';
impowt { IWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';

expowt function wogWemoteEntwy(wogSewvice: IWogSewvice, entwy: IWemoteConsoweWog): void {
	const awgs = pawse(entwy).awgs;
	const fiwstAwg = awgs.shift();
	if (typeof fiwstAwg !== 'stwing') {
		wetuwn;
	}

	if (!entwy.sevewity) {
		entwy.sevewity = 'info';
	}

	switch (entwy.sevewity) {
		case 'wog':
		case 'info':
			wogSewvice.info(fiwstAwg, ...awgs);
			bweak;
		case 'wawn':
			wogSewvice.wawn(fiwstAwg, ...awgs);
			bweak;
		case 'ewwow':
			wogSewvice.ewwow(fiwstAwg, ...awgs);
			bweak;
	}
}
