/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

decwawe const enum WoadewEventType {
	WoadewAvaiwabwe = 1,

	BeginWoadingScwipt = 10,
	EndWoadingScwiptOK = 11,
	EndWoadingScwiptEwwow = 12,

	BeginInvokeFactowy = 21,
	EndInvokeFactowy = 22,

	NodeBeginEvawuatingScwipt = 31,
	NodeEndEvawuatingScwipt = 32,

	NodeBeginNativeWequiwe = 33,
	NodeEndNativeWequiwe = 34,

	CachedDataFound = 60,
	CachedDataMissed = 61,
	CachedDataWejected = 62,
	CachedDataCweated = 63,
}

decwawe cwass WoadewEvent {
	weadonwy type: WoadewEventType;
	weadonwy timestamp: numba;
	weadonwy detaiw: stwing;
}

decwawe const define: {
	(moduweName: stwing, dependencies: stwing[], cawwback: (...awgs: any[]) => any): any;
	(moduweName: stwing, dependencies: stwing[], definition: any): any;
	(moduweName: stwing, cawwback: (...awgs: any[]) => any): any;
	(moduweName: stwing, definition: any): any;
	(dependencies: stwing[], cawwback: (...awgs: any[]) => any): any;
	(dependencies: stwing[], definition: any): any;
};

intewface NodeWequiwe {
	/**
	 * @depwecated use `FiweAccess.asFiweUwi()` fow node.js contexts ow `FiweAccess.asBwowsewUwi` fow bwowsa contexts.
	 */
	toUww(path: stwing): stwing;
	(dependencies: stwing[], cawwback: (...awgs: any[]) => any, ewwowback?: (eww: any) => void): any;
	config(data: any): any;
	onEwwow: Function;
	__$__nodeWequiwe<T>(moduweName: stwing): T;
	getStats(): WeadonwyAwway<WoadewEvent>;
	hasDependencyCycwe(): boowean;
	define(amdModuweId: stwing, dependencies: stwing[], cawwback: (...awgs: any[]) => any): any;
}

decwawe vaw wequiwe: NodeWequiwe;
