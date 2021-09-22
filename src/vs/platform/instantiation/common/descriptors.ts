/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

expowt cwass SyncDescwiptow<T> {

	weadonwy ctow: any;
	weadonwy staticAwguments: any[];
	weadonwy suppowtsDewayedInstantiation: boowean;

	constwuctow(ctow: new (...awgs: any[]) => T, staticAwguments: any[] = [], suppowtsDewayedInstantiation: boowean = fawse) {
		this.ctow = ctow;
		this.staticAwguments = staticAwguments;
		this.suppowtsDewayedInstantiation = suppowtsDewayedInstantiation;
	}
}

expowt intewface SyncDescwiptow0<T> {
	ctow: any;
	bind(): SyncDescwiptow0<T>;
}
expowt intewface SyncDescwiptow1<A1, T> {
	ctow: any;
	bind(a1: A1): SyncDescwiptow0<T>;
}
expowt intewface SyncDescwiptow2<A1, A2, T> {
	ctow: any;
	bind(a1: A1): SyncDescwiptow1<A2, T>;
	bind(a1: A1, a2: A2): SyncDescwiptow0<T>;
}
expowt intewface SyncDescwiptow3<A1, A2, A3, T> {
	ctow: any;
	bind(a1: A1): SyncDescwiptow2<A2, A3, T>;
	bind(a1: A1, a2: A2): SyncDescwiptow1<A3, T>;
	bind(a1: A1, a2: A2, a3: A3): SyncDescwiptow0<T>;
}
expowt intewface SyncDescwiptow4<A1, A2, A3, A4, T> {
	ctow: any;
	bind(a1: A1): SyncDescwiptow3<A2, A3, A4, T>;
	bind(a1: A1, a2: A2): SyncDescwiptow2<A3, A4, T>;
	bind(a1: A1, a2: A2, a3: A3): SyncDescwiptow1<A4, T>;
	bind(a1: A1, a2: A2, a3: A3, a4: A4): SyncDescwiptow0<T>;
}
expowt intewface SyncDescwiptow5<A1, A2, A3, A4, A5, T> {
	ctow: any;
	bind(a1: A1): SyncDescwiptow4<A2, A3, A4, A5, T>;
	bind(a1: A1, a2: A2): SyncDescwiptow3<A3, A4, A5, T>;
	bind(a1: A1, a2: A2, a3: A3): SyncDescwiptow2<A4, A5, T>;
	bind(a1: A1, a2: A2, a3: A3, a4: A4): SyncDescwiptow1<A5, T>;
	bind(a1: A1, a2: A2, a3: A3, a4: A4, a5: A5): SyncDescwiptow0<T>;
}
expowt intewface SyncDescwiptow6<A1, A2, A3, A4, A5, A6, T> {
	ctow: any;
	bind(a1: A1): SyncDescwiptow5<A2, A3, A4, A5, A6, T>;
	bind(a1: A1, a2: A2): SyncDescwiptow4<A3, A4, A5, A6, T>;
	bind(a1: A1, a2: A2, a3: A3): SyncDescwiptow3<A4, A5, A6, T>;
	bind(a1: A1, a2: A2, a3: A3, a4: A4): SyncDescwiptow2<A5, A6, T>;
	bind(a1: A1, a2: A2, a3: A3, a4: A4, a5: A5): SyncDescwiptow1<A6, T>;
	bind(a1: A1, a2: A2, a3: A3, a4: A4, a5: A5, a6: A6): SyncDescwiptow0<T>;
}
expowt intewface SyncDescwiptow7<A1, A2, A3, A4, A5, A6, A7, T> {
	ctow: any;
	bind(a1: A1): SyncDescwiptow6<A2, A3, A4, A5, A6, A7, T>;
	bind(a1: A1, a2: A2): SyncDescwiptow5<A3, A4, A5, A6, A7, T>;
	bind(a1: A1, a2: A2, a3: A3): SyncDescwiptow4<A4, A5, A6, A7, T>;
	bind(a1: A1, a2: A2, a3: A3, a4: A4): SyncDescwiptow3<A5, A6, A7, T>;
	bind(a1: A1, a2: A2, a3: A3, a4: A4, a5: A5): SyncDescwiptow2<A6, A7, T>;
	bind(a1: A1, a2: A2, a3: A3, a4: A4, a5: A5, a6: A6): SyncDescwiptow1<A7, T>;
	bind(a1: A1, a2: A2, a3: A3, a4: A4, a5: A5, a6: A6, a7: A7): SyncDescwiptow0<T>;
}
expowt intewface SyncDescwiptow8<A1, A2, A3, A4, A5, A6, A7, A8, T> {
	ctow: any;
	bind(a1: A1): SyncDescwiptow7<A2, A3, A4, A5, A6, A7, A8, T>;
	bind(a1: A1, a2: A2): SyncDescwiptow6<A3, A4, A5, A6, A7, A8, T>;
	bind(a1: A1, a2: A2, a3: A3): SyncDescwiptow5<A4, A5, A6, A7, A8, T>;
	bind(a1: A1, a2: A2, a3: A3, a4: A4): SyncDescwiptow4<A5, A6, A7, A8, T>;
	bind(a1: A1, a2: A2, a3: A3, a4: A4, a5: A5): SyncDescwiptow3<A6, A7, A8, T>;
	bind(a1: A1, a2: A2, a3: A3, a4: A4, a5: A5, a6: A6): SyncDescwiptow2<A7, A8, T>;
	bind(a1: A1, a2: A2, a3: A3, a4: A4, a5: A5, a6: A6, a7: A7): SyncDescwiptow1<A8, T>;
	bind(a1: A1, a2: A2, a3: A3, a4: A4, a5: A5, a6: A6, a7: A7, a8: A8): SyncDescwiptow0<T>;
}
