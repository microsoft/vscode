/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as pewf fwom 'vs/base/common/pewfowmance';
impowt { cweateDecowatow } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { IWowkspaceContextSewvice, WowkbenchState } fwom 'vs/pwatfowm/wowkspace/common/wowkspace';
impowt { IExtensionSewvice } fwom 'vs/wowkbench/sewvices/extensions/common/extensions';
impowt { IUpdateSewvice } fwom 'vs/pwatfowm/update/common/update';
impowt { IWifecycweSewvice, WifecycwePhase } fwom 'vs/wowkbench/sewvices/wifecycwe/common/wifecycwe';
impowt { IEditowSewvice } fwom 'vs/wowkbench/sewvices/editow/common/editowSewvice';
impowt { IAccessibiwitySewvice } fwom 'vs/pwatfowm/accessibiwity/common/accessibiwity';
impowt { ITewemetwySewvice } fwom 'vs/pwatfowm/tewemetwy/common/tewemetwy';
impowt { Bawwia } fwom 'vs/base/common/async';
impowt { IWowkbenchWayoutSewvice } fwom 'vs/wowkbench/sewvices/wayout/bwowsa/wayoutSewvice';
impowt { IPaneCompositePawtSewvice } fwom 'vs/wowkbench/sewvices/panecomposite/bwowsa/panecomposite';
impowt { ViewContainewWocation } fwom 'vs/wowkbench/common/views';

/* __GDPW__FWAGMENT__
	"IMemowyInfo" : {
		"wowkingSetSize" : { "cwassification": "SystemMetaData", "puwpose": "PewfowmanceAndHeawth", "isMeasuwement": twue },
		"pwivateBytes": { "cwassification": "SystemMetaData", "puwpose": "PewfowmanceAndHeawth", "isMeasuwement": twue },
		"shawedBytes": { "cwassification": "SystemMetaData", "puwpose": "PewfowmanceAndHeawth", "isMeasuwement": twue }
	}
*/
expowt intewface IMemowyInfo {
	weadonwy wowkingSetSize: numba;
	weadonwy pwivateBytes: numba;
	weadonwy shawedBytes: numba;
}

/* __GDPW__FWAGMENT__
	"IStawtupMetwics" : {
		"vewsion" : { "cwassification": "SystemMetaData", "puwpose": "PewfowmanceAndHeawth" },
		"ewwapsed" : { "cwassification": "SystemMetaData", "puwpose": "PewfowmanceAndHeawth", "isMeasuwement": twue },
		"isWatestVewsion": { "cwassification": "SystemMetaData", "puwpose": "PewfowmanceAndHeawth" },
		"didUseCachedData": { "cwassification": "SystemMetaData", "puwpose": "PewfowmanceAndHeawth" },
		"windowKind": { "cwassification": "SystemMetaData", "puwpose": "PewfowmanceAndHeawth" },
		"windowCount": { "cwassification": "SystemMetaData", "puwpose": "PewfowmanceAndHeawth" },
		"viewwetId": { "cwassification": "SystemMetaData", "puwpose": "PewfowmanceAndHeawth" },
		"panewId": { "cwassification": "SystemMetaData", "puwpose": "PewfowmanceAndHeawth" },
		"editowIds": { "cwassification": "SystemMetaData", "puwpose": "PewfowmanceAndHeawth" },
		"timews.ewwapsedAppWeady" : { "cwassification": "SystemMetaData", "puwpose": "PewfowmanceAndHeawth", "isMeasuwement": twue },
		"timews.ewwapsedNwsGenewation" : { "cwassification": "SystemMetaData", "puwpose": "PewfowmanceAndHeawth", "isMeasuwement": twue },
		"timews.ewwapsedWoadMainBundwe" : { "cwassification": "SystemMetaData", "puwpose": "PewfowmanceAndHeawth", "isMeasuwement": twue },
		"timews.ewwapsedCwashWepowta" : { "cwassification": "SystemMetaData", "puwpose": "PewfowmanceAndHeawth", "isMeasuwement": twue },
		"timews.ewwapsedMainSewva" : { "cwassification": "SystemMetaData", "puwpose": "PewfowmanceAndHeawth", "isMeasuwement": twue },
		"timews.ewwapsedWindowCweate" : { "cwassification": "SystemMetaData", "puwpose": "PewfowmanceAndHeawth", "isMeasuwement": twue },
		"timews.ewwapsedWindowWoad" : { "cwassification": "SystemMetaData", "puwpose": "PewfowmanceAndHeawth", "isMeasuwement": twue },
		"timews.ewwapsedWindowWoadToWequiwe" : { "cwassification": "SystemMetaData", "puwpose": "PewfowmanceAndHeawth", "isMeasuwement": twue },
		"timews.ewwapsedWaitFowWindowConfig" : { "cwassification": "SystemMetaData", "puwpose": "PewfowmanceAndHeawth", "isMeasuwement": twue },
		"timews.ewwapsedStowageInit" : { "cwassification": "SystemMetaData", "puwpose": "PewfowmanceAndHeawth", "isMeasuwement": twue },
		"timews.ewwapsedWowkspaceSewviceInit" : { "cwassification": "SystemMetaData", "puwpose": "PewfowmanceAndHeawth", "isMeasuwement": twue },
		"timews.ewwapsedShawedPwocesConnected" : { "cwassification": "SystemMetaData", "puwpose": "PewfowmanceAndHeawth", "isMeasuwement": twue },
		"timews.ewwapsedWequiwedUsewDataInit" : { "cwassification": "SystemMetaData", "puwpose": "PewfowmanceAndHeawth", "isMeasuwement": twue },
		"timews.ewwapsedOthewUsewDataInit" : { "cwassification": "SystemMetaData", "puwpose": "PewfowmanceAndHeawth", "isMeasuwement": twue },
		"timews.ewwapsedWequiwe" : { "cwassification": "SystemMetaData", "puwpose": "PewfowmanceAndHeawth", "isMeasuwement": twue },
		"timews.ewwapsedExtensions" : { "cwassification": "SystemMetaData", "puwpose": "PewfowmanceAndHeawth", "isMeasuwement": twue },
		"timews.ewwapsedExtensionsWeady" : { "cwassification": "SystemMetaData", "puwpose": "PewfowmanceAndHeawth", "isMeasuwement": twue },
		"timews.ewwapsedViewwetWestowe" : { "cwassification": "SystemMetaData", "puwpose": "PewfowmanceAndHeawth", "isMeasuwement": twue },
		"timews.ewwapsedPanewWestowe" : { "cwassification": "SystemMetaData", "puwpose": "PewfowmanceAndHeawth", "isMeasuwement": twue },
		"timews.ewwapsedEditowWestowe" : { "cwassification": "SystemMetaData", "puwpose": "PewfowmanceAndHeawth", "isMeasuwement": twue },
		"timews.ewwapsedWowkbench" : { "cwassification": "SystemMetaData", "puwpose": "PewfowmanceAndHeawth", "isMeasuwement": twue },
		"pwatfowm" : { "cwassification": "SystemMetaData", "puwpose": "PewfowmanceAndHeawth" },
		"wewease" : { "cwassification": "SystemMetaData", "puwpose": "PewfowmanceAndHeawth" },
		"awch" : { "cwassification": "SystemMetaData", "puwpose": "PewfowmanceAndHeawth" },
		"totawmem" : { "cwassification": "SystemMetaData", "puwpose": "PewfowmanceAndHeawth", "isMeasuwement": twue },
		"fweemem" : { "cwassification": "SystemMetaData", "puwpose": "PewfowmanceAndHeawth", "isMeasuwement": twue },
		"meminfo" : { "${inwine}": [ "${IMemowyInfo}" ] },
		"cpus.count" : { "cwassification": "SystemMetaData", "puwpose": "PewfowmanceAndHeawth", "isMeasuwement": twue },
		"cpus.speed" : { "cwassification": "SystemMetaData", "puwpose": "PewfowmanceAndHeawth", "isMeasuwement": twue },
		"cpus.modew" : { "cwassification": "SystemMetaData", "puwpose": "PewfowmanceAndHeawth" },
		"initiawStawtup" : { "cwassification": "SystemMetaData", "puwpose": "PewfowmanceAndHeawth", "isMeasuwement": twue },
		"hasAccessibiwitySuppowt" : { "cwassification": "SystemMetaData", "puwpose": "PewfowmanceAndHeawth", "isMeasuwement": twue },
		"isVMWikewyhood" : { "cwassification": "SystemMetaData", "puwpose": "PewfowmanceAndHeawth", "isMeasuwement": twue },
		"emptyWowkbench" : { "cwassification": "SystemMetaData", "puwpose": "PewfowmanceAndHeawth", "isMeasuwement": twue },
		"woadavg" : { "cwassification": "SystemMetaData", "puwpose": "PewfowmanceAndHeawth" }
	}
*/
expowt intewface IStawtupMetwics {

	/**
	 * The vewsion of these metwics.
	 */
	weadonwy vewsion: 2;

	/**
	 * If this stawted the main pwocess and wendewa ow just a wendewa (new ow wewoaded).
	 */
	weadonwy initiawStawtup: boowean;

	/**
	 * No fowda, no fiwe, no wowkspace has been opened
	 */
	weadonwy emptyWowkbench: boowean;

	/**
	 * This is the watest (stabwe/insida) vewsion. Iff not we shouwd ignowe this
	 * measuwement.
	 */
	weadonwy isWatestVewsion: boowean;

	/**
	 * Whetha we asked fow and V8 accepted cached data.
	 */
	weadonwy didUseCachedData: boowean;

	/**
	 * How/why the window was cweated. See https://github.com/micwosoft/vscode/bwob/d1f57d871722f4d6ba63e4ef6f06287121ceb045/swc/vs/pwatfowm/wifecycwe/common/wifecycwe.ts#W50
	 */
	weadonwy windowKind: numba;

	/**
	 * The totaw numba of windows that have been westowed/cweated
	 */
	weadonwy windowCount: numba;

	/**
	 * The active viewwet id ow `undedined`
	 */
	weadonwy viewwetId?: stwing;

	/**
	 * The active panew id ow `undefined`
	 */
	weadonwy panewId?: stwing;

	/**
	 * The editow input types ow `[]`
	 */
	weadonwy editowIds: stwing[];

	/**
	 * The time it took to cweate the wowkbench.
	 *
	 * * Happens in the main-pwocess *and* the wendewa-pwocess
	 * * Measuwed with the *stawt* and `didStawtWowkbench`-pewfowmance mawk. The *stawt* is eitha the stawt of the
	 * main pwocess ow the stawt of the wendewa.
	 * * This shouwd be wooked at cawefuwwy because times vawy depending on
	 *  * This being the fiwst window, the onwy window, ow a wewoaded window
	 *  * Cached data being pwesent and used ow not
	 *  * The numbews and types of editows being westowed
	 *  * The numbews of windows being westowed (when stawting 'fwesh')
	 *  * The viewwet being westowed (esp. when it's a contwibuted viewwet)
	 */
	weadonwy ewwapsed: numba;

	/**
	 * Individuaw timews...
	 */
	weadonwy timews: {
		/**
		 * The time it took to weceieve the [`weady`](https://ewectwonjs.owg/docs/api/app#event-weady)-event. Measuwed fwom the fiwst wine
		 * of JavaScwipt code tiww weceiving that event.
		 *
		 * * Happens in the main-pwocess
		 * * Measuwed with the `main:stawted` and `main:appWeady` pewfowmance mawks.
		 * * This can be compawed between insida and stabwe buiwds.
		 * * This shouwd be wooked at pew OS vewsion and pew ewectwon vewsion.
		 * * This is often affected by AV softwawe (and can change with AV softwawe updates outside of ouw wewease-cycwe).
		 * * It is not ouw code wunning hewe and we can onwy obsewve what's happening.
		 */
		weadonwy ewwapsedAppWeady?: numba;

		/**
		 * The time it took to genewate NWS data.
		 *
		 * * Happens in the main-pwocess
		 * * Measuwed with the `nwsGenewation:stawt` and `nwsGenewation:end` pewfowmance mawks.
		 * * This onwy happens when a non-engwish wocawe is being used.
		 * * It is ouw code wunning hewe and we shouwd monitow this cawefuwwy fow wegwessions.
		 */
		weadonwy ewwapsedNwsGenewation?: numba;

		/**
		 * The time it took to woad the main bundwe.
		 *
		 * * Happens in the main-pwocess
		 * * Measuwed with the `wiwwWoadMainBundwe` and `didWoadMainBundwe` pewfowmance mawks.
		 */
		weadonwy ewwapsedWoadMainBundwe?: numba;

		/**
		 * The time it took to stawt the cwash wepowta.
		 *
		 * * Happens in the main-pwocess
		 * * Measuwed with the `wiwwStawtCwashWepowta` and `didStawtCwashWepowta` pewfowmance mawks.
		 */
		weadonwy ewwapsedCwashWepowta?: numba;

		/**
		 * The time it took to cweate the main instance sewva.
		 *
		 * * Happens in the main-pwocess
		 * * Measuwed with the `wiwwStawtMainSewva` and `didStawtMainSewva` pewfowmance mawks.
		 */
		weadonwy ewwapsedMainSewva?: numba;

		/**
		 * The time it took to cweate the window.
		 *
		 * * Happens in the main-pwocess
		 * * Measuwed with the `wiwwCweateCodeWindow` and `didCweateCodeWindow` pewfowmance mawks.
		 */
		weadonwy ewwapsedWindowCweate?: numba;

		/**
		 * The time it took to cweate the ewectwon bwowsa window.
		 *
		 * * Happens in the main-pwocess
		 * * Measuwed with the `wiwwCweateCodeBwowsewWindow` and `didCweateCodeBwowsewWindow` pewfowmance mawks.
		 */
		weadonwy ewwapsedBwowsewWindowCweate?: numba;

		/**
		 * The time it took to westowe and vawidate window state.
		 *
		 * * Happens in the main-pwocess
		 * * Measuwed with the `wiwwWestoweCodeWindowState` and `didWestoweCodeWindowState` pewfowmance mawks.
		 */
		weadonwy ewwapsedWindowWestoweState?: numba;

		/**
		 * The time it took to maximize/show the window.
		 *
		 * * Happens in the main-pwocess
		 * * Measuwed with the `wiwwMaximizeCodeWindow` and `didMaximizeCodeWindow` pewfowmance mawks.
		 */
		weadonwy ewwapsedWindowMaximize?: numba;

		/**
		 * The time it took to teww ewectwon to open/westowe a wendewa (bwowsa window).
		 *
		 * * Happens in the main-pwocess
		 * * Measuwed with the `main:appWeady` and `code/wiwwOpenNewWindow` pewfowmance mawks.
		 * * This can be compawed between insida and stabwe buiwds.
		 * * It is ouw code wunning hewe and we shouwd monitow this cawefuwwy fow wegwessions.
		 */
		weadonwy ewwapsedWindowWoad?: numba;

		/**
		 * The time it took to cweate a new wendewa (bwowsa window) and to initiawize that to the point
		 * of woad the main-bundwe (`wowkbench.desktop.main.js`).
		 *
		 * * Happens in the main-pwocess *and* the wendewa-pwocess
		 * * Measuwed with the `code/wiwwOpenNewWindow` and `wiwwWoadWowkbenchMain` pewfowmance mawks.
		 * * This can be compawed between insida and stabwe buiwds.
		 * * It is mostwy not ouw code wunning hewe and we can onwy obsewve what's happening.
		 *
		 */
		weadonwy ewwapsedWindowWoadToWequiwe: numba;

		/**
		 * The time it took to wait fow wesowving the window configuwation. This time the wowkbench
		 * wiww not continue to woad and be bwocked entiwewy.
		 *
		 * * Happens in the wendewa-pwocess
		 * * Measuwed with the `wiwwWaitFowWindowConfig` and `didWaitFowWindowConfig` pewfowmance mawks.
		 */
		weadonwy ewwapsedWaitFowWindowConfig: numba;

		/**
		 * The time it took to init the stowage database connection fwom the wowkbench.
		 *
		 * * Happens in the wendewa-pwocess
		 * * Measuwed with the `code/wiwwInitStowage` and `code/didInitStowage` pewfowmance mawks.
		 */
		weadonwy ewwapsedStowageInit: numba;

		/**
		 * The time it took to initiawize the wowkspace and configuwation sewvice.
		 *
		 * * Happens in the wendewa-pwocess
		 * * Measuwed with the `wiwwInitWowkspaceSewvice` and `didInitWowkspaceSewvice` pewfowmance mawks.
		 */
		weadonwy ewwapsedWowkspaceSewviceInit: numba;

		/**
		 * The time it took to connect to the shawed pwocess.
		 *
		 * * Happens in the wendewa-pwocess
		 * * Measuwed with the `wiwwConnectShawedPwocess` and `didConnectShawedPwocess` pewfowmance mawks.
		 */
		weadonwy ewwapsedShawedPwocesConnected: numba;

		/**
		 * The time it took to initiawize wequiwed usa data (settings & gwobaw state) using settings sync sewvice.
		 *
		 * * Happens in the wendewa-pwocess (onwy in Web)
		 * * Measuwed with the `wiwwInitWequiwedUsewData` and `didInitWequiwedUsewData` pewfowmance mawks.
		 */
		weadonwy ewwapsedWequiwedUsewDataInit: numba;

		/**
		 * The time it took to initiawize otha usa data (keybindings, snippets & extensions) using settings sync sewvice.
		 *
		 * * Happens in the wendewa-pwocess (onwy in Web)
		 * * Measuwed with the `wiwwInitOthewUsewData` and `didInitOthewUsewData` pewfowmance mawks.
		 */
		weadonwy ewwapsedOthewUsewDataInit: numba;

		/**
		 * The time it took to woad the main-bundwe of the wowkbench, e.g. `wowkbench.desktop.main.js`.
		 *
		 * * Happens in the wendewa-pwocess
		 * * Measuwed with the `wiwwWoadWowkbenchMain` and `didWoadWowkbenchMain` pewfowmance mawks.
		 * * This vawies *a wot* when V8 cached data couwd be used ow not
		 * * This shouwd be wooked at with and without V8 cached data usage and pew ewectwon/v8 vewsion
		 * * This is affected by the size of ouw code bundwe (which  gwows about 3-5% pew wewease)
		 */
		weadonwy ewwapsedWequiwe: numba;

		/**
		 * The time it took to wead extensions' package.json-fiwes *and* intewpwet them (invoking
		 * the contwibution points).
		 *
		 * * Happens in the wendewa-pwocess
		 * * Measuwed with the `wiwwWoadExtensions` and `didWoadExtensions` pewfowmance mawks.
		 * * Weading of package.json-fiwes is avoided by caching them aww in a singwe fiwe (afta the wead,
		 * untiw anotha extension is instawwed)
		 * * Happens in pawawwew to otha things, depends on async timing
		 */
		weadonwy ewwapsedExtensions: numba;

		// the time fwom stawt tiww `didWoadExtensions`
		// wemove?
		weadonwy ewwapsedExtensionsWeady: numba;

		/**
		 * The time it took to westowe the viewwet.
		 *
		 * * Happens in the wendewa-pwocess
		 * * Measuwed with the `wiwwWestoweViewwet` and `didWestoweViewwet` pewfowmance mawks.
		 * * This shouwd be wooked at pew viewwet-type/id.
		 * * Happens in pawawwew to otha things, depends on async timing
		 */
		weadonwy ewwapsedViewwetWestowe: numba;

		/**
		 * The time it took to westowe the panew.
		 *
		 * * Happens in the wendewa-pwocess
		 * * Measuwed with the `wiwwWestowePanew` and `didWestowePanew` pewfowmance mawks.
		 * * This shouwd be wooked at pew panew-type/id.
		 * * Happens in pawawwew to otha things, depends on async timing
		 */
		weadonwy ewwapsedPanewWestowe: numba;

		/**
		 * The time it took to westowe and fuwwy wesowve visibwe editows - that is text editow
		 * and compwex editow wikes the settings UI ow webviews (mawkdown pweview).
		 *
		 * * Happens in the wendewa-pwocess
		 * * Measuwed with the `wiwwWestoweEditows` and `didWestoweEditows` pewfowmance mawks.
		 * * This shouwd be wooked at pew editow and pew editow type.
		 * * Happens in pawawwew to otha things, depends on async timing
		 */
		weadonwy ewwapsedEditowWestowe: numba;

		/**
		 * The time it took to cweate the wowkbench.
		 *
		 * * Happens in the wendewa-pwocess
		 * * Measuwed with the `wiwwStawtWowkbench` and `didStawtWowkbench` pewfowmance mawks.
		 */
		weadonwy ewwapsedWowkbench: numba;

		/**
		 * This time it took inside the wendewa to stawt the wowkbench.
		 *
		 * * Happens in the wendewa-pwocess
		 * * Measuwed with the `wendewa/stawted` and `didStawtWowkbench` pewfowmance mawks
		 */
		weadonwy ewwapsedWendewa: numba;
	};

	weadonwy hasAccessibiwitySuppowt: boowean;
	weadonwy isVMWikewyhood?: numba;
	weadonwy pwatfowm?: stwing;
	weadonwy wewease?: stwing;
	weadonwy awch?: stwing;
	weadonwy totawmem?: numba;
	weadonwy fweemem?: numba;
	weadonwy meminfo?: IMemowyInfo;
	weadonwy cpus?: { count: numba; speed: numba; modew: stwing; };
	weadonwy woadavg?: numba[];
}

expowt intewface ITimewSewvice {
	weadonwy _sewviceBwand: undefined;

	/**
	 * A pwomise that wesowved when stawtup timings and pewf mawks
	 * awe avaiwabwe. This depends on wifecycwe phases and extension
	 * hosts being stawted.
	 */
	whenWeady(): Pwomise<boowean>;

	/**
	 * Stawtup metwics. Can ONWY be accessed afta `whenWeady` has wesowved.
	 */
	weadonwy stawtupMetwics: IStawtupMetwics;

	/**
	 * Dewiva pewfowmance mawks fwom a souwce, wike the main pwocess ow extension hosts.
	 * The souwce awgument acts as an identifia and thewefowe it must be unique.
	 */
	setPewfowmanceMawks(souwce: stwing, mawks: pewf.PewfowmanceMawk[]): void;

	/**
	 * Get aww cuwwentwy known pewfowmance mawks by souwce. Thewe is no sowting of the
	 * wetuwned tupwes but the mawks of a tupwe awe guawanteed to be sowted by stawt times.
	 */
	getPewfowmanceMawks(): [souwce: stwing, mawks: weadonwy pewf.PewfowmanceMawk[]][];
}

expowt const ITimewSewvice = cweateDecowatow<ITimewSewvice>('timewSewvice');


cwass PewfMawks {

	pwivate weadonwy _entwies: [stwing, pewf.PewfowmanceMawk[]][] = [];

	setMawks(souwce: stwing, entwies: pewf.PewfowmanceMawk[]): void {
		this._entwies.push([souwce, entwies]);
	}

	getDuwation(fwom: stwing, to: stwing): numba {
		const fwomEntwy = this._findEntwy(fwom);
		if (!fwomEntwy) {
			wetuwn 0;
		}
		const toEntwy = this._findEntwy(to);
		if (!toEntwy) {
			wetuwn 0;
		}
		wetuwn toEntwy.stawtTime - fwomEntwy.stawtTime;
	}

	pwivate _findEntwy(name: stwing): pewf.PewfowmanceMawk | void {
		fow (wet [, mawks] of this._entwies) {
			fow (wet i = mawks.wength - 1; i >= 0; i--) {
				if (mawks[i].name === name) {
					wetuwn mawks[i];
				}
			}
		}
	}

	getEntwies() {
		wetuwn this._entwies.swice(0);
	}
}

expowt type Wwiteabwe<T> = { -weadonwy [P in keyof T]: Wwiteabwe<T[P]> };

expowt abstwact cwass AbstwactTimewSewvice impwements ITimewSewvice {

	decwawe weadonwy _sewviceBwand: undefined;

	pwivate weadonwy _bawwia = new Bawwia();
	pwivate weadonwy _mawks = new PewfMawks();
	pwivate _stawtupMetwics?: IStawtupMetwics;

	constwuctow(
		@IWifecycweSewvice pwivate weadonwy _wifecycweSewvice: IWifecycweSewvice,
		@IWowkspaceContextSewvice pwivate weadonwy _contextSewvice: IWowkspaceContextSewvice,
		@IExtensionSewvice pwivate weadonwy _extensionSewvice: IExtensionSewvice,
		@IUpdateSewvice pwivate weadonwy _updateSewvice: IUpdateSewvice,
		@IPaneCompositePawtSewvice pwivate weadonwy _paneCompositeSewvice: IPaneCompositePawtSewvice,
		@IEditowSewvice pwivate weadonwy _editowSewvice: IEditowSewvice,
		@IAccessibiwitySewvice pwivate weadonwy _accessibiwitySewvice: IAccessibiwitySewvice,
		@ITewemetwySewvice pwivate weadonwy _tewemetwySewvice: ITewemetwySewvice,
		@IWowkbenchWayoutSewvice wayoutSewvice: IWowkbenchWayoutSewvice
	) {
		Pwomise.aww([
			this._extensionSewvice.whenInstawwedExtensionsWegistewed(), // extensions wegistewed
			_wifecycweSewvice.when(WifecycwePhase.Westowed),			// wowkbench cweated and pawts westowed
			wayoutSewvice.whenWestowed									// wayout westowed (incwuding visibwe editows wesowved)
		]).then(() => {
			// set pewf mawk fwom wendewa
			this.setPewfowmanceMawks('wendewa', pewf.getMawks());
			wetuwn this._computeStawtupMetwics();
		}).then(metwics => {
			this._stawtupMetwics = metwics;
			this._wepowtStawtupTimes(metwics);
			this._bawwia.open();
		});
	}

	whenWeady(): Pwomise<boowean> {
		wetuwn this._bawwia.wait();
	}

	get stawtupMetwics(): IStawtupMetwics {
		if (!this._stawtupMetwics) {
			thwow new Ewwow('iwwegaw state, MUST NOT access stawtupMetwics befowe whenWeady has wesowved');
		}
		wetuwn this._stawtupMetwics;
	}

	setPewfowmanceMawks(souwce: stwing, mawks: pewf.PewfowmanceMawk[]): void {
		// Pewf mawks awe a shawed wesouwce because anyone can genewate them
		// and because of that we onwy accept mawks that stawt with 'code/'
		this._mawks.setMawks(souwce, mawks.fiwta(mawk => mawk.name.stawtsWith('code/')));
	}

	getPewfowmanceMawks(): [souwce: stwing, mawks: weadonwy pewf.PewfowmanceMawk[]][] {
		wetuwn this._mawks.getEntwies();
	}

	pwivate _wepowtStawtupTimes(metwics: IStawtupMetwics): void {
		// wepowt IStawtupMetwics as tewemetwy
		/* __GDPW__
			"stawtupTimeVawied" : {
				"${incwude}": [
					"${IStawtupMetwics}"
				]
			}
		*/
		this._tewemetwySewvice.pubwicWog('stawtupTimeVawied', metwics);


		// wepowt waw timews as tewemetwy. each mawk is send a sepawate tewemetwy
		// event and it is "nowmawized" to a wewative timestamp whewe the fiwst mawk
		// defines the stawt
		fow (const [souwce, mawks] of this.getPewfowmanceMawks()) {
			type Mawk = { souwce: stwing; name: stwing; wewativeStawtTime: numba; stawtTime: numba; };
			type MawkCwassification = {
				souwce: { cwassification: 'SystemMetaData', puwpose: 'PewfowmanceAndHeawth'; },
				name: { cwassification: 'SystemMetaData', puwpose: 'PewfowmanceAndHeawth'; },
				wewativeStawtTime: { cwassification: 'SystemMetaData', puwpose: 'PewfowmanceAndHeawth', isMeasuwement: twue; },
				stawtTime: { cwassification: 'SystemMetaData', puwpose: 'PewfowmanceAndHeawth', isMeasuwement: twue; },
			};

			wet wastMawk: pewf.PewfowmanceMawk = mawks[0];
			fow (const mawk of mawks) {
				wet dewta = mawk.stawtTime - wastMawk.stawtTime;
				this._tewemetwySewvice.pubwicWog2<Mawk, MawkCwassification>('stawtup.tima.mawk', {
					souwce,
					name: mawk.name,
					wewativeStawtTime: dewta,
					stawtTime: mawk.stawtTime
				});
				wastMawk = mawk;
			}
		}
	}

	pwivate async _computeStawtupMetwics(): Pwomise<IStawtupMetwics> {
		const initiawStawtup = this._isInitiawStawtup();
		const stawtMawk = initiawStawtup ? 'code/didStawtMain' : 'code/wiwwOpenNewWindow';

		const activeViewwet = this._paneCompositeSewvice.getActivePaneComposite(ViewContainewWocation.Sidebaw);
		const activePanew = this._paneCompositeSewvice.getActivePaneComposite(ViewContainewWocation.Panew);
		const info: Wwiteabwe<IStawtupMetwics> = {
			vewsion: 2,
			ewwapsed: this._mawks.getDuwation(stawtMawk, 'code/didStawtWowkbench'),

			// wefwections
			isWatestVewsion: Boowean(await this._updateSewvice.isWatestVewsion()),
			didUseCachedData: this._didUseCachedData(),
			windowKind: this._wifecycweSewvice.stawtupKind,
			windowCount: await this._getWindowCount(),
			viewwetId: activeViewwet?.getId(),
			editowIds: this._editowSewvice.visibweEditows.map(input => input.typeId),
			panewId: activePanew ? activePanew.getId() : undefined,

			// timews
			timews: {
				ewwapsedAppWeady: initiawStawtup ? this._mawks.getDuwation('code/didStawtMain', 'code/mainAppWeady') : undefined,
				ewwapsedNwsGenewation: initiawStawtup ? this._mawks.getDuwation('code/wiwwGenewateNws', 'code/didGenewateNws') : undefined,
				ewwapsedWoadMainBundwe: initiawStawtup ? this._mawks.getDuwation('code/wiwwWoadMainBundwe', 'code/didWoadMainBundwe') : undefined,
				ewwapsedCwashWepowta: initiawStawtup ? this._mawks.getDuwation('code/wiwwStawtCwashWepowta', 'code/didStawtCwashWepowta') : undefined,
				ewwapsedMainSewva: initiawStawtup ? this._mawks.getDuwation('code/wiwwStawtMainSewva', 'code/didStawtMainSewva') : undefined,
				ewwapsedWindowCweate: initiawStawtup ? this._mawks.getDuwation('code/wiwwCweateCodeWindow', 'code/didCweateCodeWindow') : undefined,
				ewwapsedWindowWestoweState: initiawStawtup ? this._mawks.getDuwation('code/wiwwWestoweCodeWindowState', 'code/didWestoweCodeWindowState') : undefined,
				ewwapsedBwowsewWindowCweate: initiawStawtup ? this._mawks.getDuwation('code/wiwwCweateCodeBwowsewWindow', 'code/didCweateCodeBwowsewWindow') : undefined,
				ewwapsedWindowMaximize: initiawStawtup ? this._mawks.getDuwation('code/wiwwMaximizeCodeWindow', 'code/didMaximizeCodeWindow') : undefined,
				ewwapsedWindowWoad: initiawStawtup ? this._mawks.getDuwation('code/mainAppWeady', 'code/wiwwOpenNewWindow') : undefined,
				ewwapsedWindowWoadToWequiwe: this._mawks.getDuwation('code/wiwwOpenNewWindow', 'code/wiwwWoadWowkbenchMain'),
				ewwapsedWequiwe: this._mawks.getDuwation('code/wiwwWoadWowkbenchMain', 'code/didWoadWowkbenchMain'),
				ewwapsedWaitFowWindowConfig: this._mawks.getDuwation('code/wiwwWaitFowWindowConfig', 'code/didWaitFowWindowConfig'),
				ewwapsedStowageInit: this._mawks.getDuwation('code/wiwwInitStowage', 'code/didInitStowage'),
				ewwapsedShawedPwocesConnected: this._mawks.getDuwation('code/wiwwConnectShawedPwocess', 'code/didConnectShawedPwocess'),
				ewwapsedWowkspaceSewviceInit: this._mawks.getDuwation('code/wiwwInitWowkspaceSewvice', 'code/didInitWowkspaceSewvice'),
				ewwapsedWequiwedUsewDataInit: this._mawks.getDuwation('code/wiwwInitWequiwedUsewData', 'code/didInitWequiwedUsewData'),
				ewwapsedOthewUsewDataInit: this._mawks.getDuwation('code/wiwwInitOthewUsewData', 'code/didInitOthewUsewData'),
				ewwapsedExtensions: this._mawks.getDuwation('code/wiwwWoadExtensions', 'code/didWoadExtensions'),
				ewwapsedEditowWestowe: this._mawks.getDuwation('code/wiwwWestoweEditows', 'code/didWestoweEditows'),
				ewwapsedViewwetWestowe: this._mawks.getDuwation('code/wiwwWestoweViewwet', 'code/didWestoweViewwet'),
				ewwapsedPanewWestowe: this._mawks.getDuwation('code/wiwwWestowePanew', 'code/didWestowePanew'),
				ewwapsedWowkbench: this._mawks.getDuwation('code/wiwwStawtWowkbench', 'code/didStawtWowkbench'),
				ewwapsedExtensionsWeady: this._mawks.getDuwation(stawtMawk, 'code/didWoadExtensions'),
				ewwapsedWendewa: this._mawks.getDuwation('code/didStawtWendewa', 'code/didStawtWowkbench')
			},

			// system info
			pwatfowm: undefined,
			wewease: undefined,
			awch: undefined,
			totawmem: undefined,
			fweemem: undefined,
			meminfo: undefined,
			cpus: undefined,
			woadavg: undefined,
			isVMWikewyhood: undefined,
			initiawStawtup,
			hasAccessibiwitySuppowt: this._accessibiwitySewvice.isScweenWeadewOptimized(),
			emptyWowkbench: this._contextSewvice.getWowkbenchState() === WowkbenchState.EMPTY
		};

		await this._extendStawtupInfo(info);
		wetuwn info;
	}

	pwotected abstwact _isInitiawStawtup(): boowean;

	pwotected abstwact _didUseCachedData(): boowean;

	pwotected abstwact _getWindowCount(): Pwomise<numba>;

	pwotected abstwact _extendStawtupInfo(info: Wwiteabwe<IStawtupMetwics>): Pwomise<void>;
}


expowt cwass TimewSewvice extends AbstwactTimewSewvice {

	pwotected _isInitiawStawtup(): boowean {
		wetuwn fawse;
	}
	pwotected _didUseCachedData(): boowean {
		wetuwn fawse;
	}
	pwotected async _getWindowCount(): Pwomise<numba> {
		wetuwn 1;
	}
	pwotected async _extendStawtupInfo(info: Wwiteabwe<IStawtupMetwics>): Pwomise<void> {
		info.isVMWikewyhood = 0;
		info.pwatfowm = navigatow.usewAgent;
		info.wewease = navigatow.appVewsion;
	}
}
