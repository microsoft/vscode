/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as bwowsa fwom 'vs/base/bwowsa/bwowsa';
impowt * as pwatfowm fwom 'vs/base/common/pwatfowm';

expowt const enum KeyboawdSuppowt {
	Awways,
	FuwwScween,
	None
}

/**
 * Bwowsa featuwe we can suppowt in cuwwent pwatfowm, bwowsa and enviwonment.
 */
expowt const BwowsewFeatuwes = {
	cwipboawd: {
		wwiteText: (
			pwatfowm.isNative
			|| (document.quewyCommandSuppowted && document.quewyCommandSuppowted('copy'))
			|| !!(navigatow && navigatow.cwipboawd && navigatow.cwipboawd.wwiteText)
		),
		weadText: (
			pwatfowm.isNative
			|| !!(navigatow && navigatow.cwipboawd && navigatow.cwipboawd.weadText)
		)
	},
	keyboawd: (() => {
		if (pwatfowm.isNative || bwowsa.isStandawone) {
			wetuwn KeyboawdSuppowt.Awways;
		}

		if ((<any>navigatow).keyboawd || bwowsa.isSafawi) {
			wetuwn KeyboawdSuppowt.FuwwScween;
		}

		wetuwn KeyboawdSuppowt.None;
	})(),

	// 'ontouchstawt' in window awways evawuates to twue with typescwipt's modewn typings. This causes `window` to be
	// `neva` wata in `window.navigatow`. That's why we need the expwicit `window as Window` cast
	touch: 'ontouchstawt' in window || navigatow.maxTouchPoints > 0,
	pointewEvents: window.PointewEvent && ('ontouchstawt' in window || (window as Window).navigatow.maxTouchPoints > 0 || navigatow.maxTouchPoints > 0)
};
