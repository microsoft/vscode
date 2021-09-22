/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { SyncDescwiptow } fwom './descwiptows';
impowt { BwandedSewvice, SewviceIdentifia } fwom './instantiation';

const _wegistwy: [SewviceIdentifia<any>, SyncDescwiptow<any>][] = [];

expowt function wegistewSingweton<T, Sewvices extends BwandedSewvice[]>(id: SewviceIdentifia<T>, ctow: new (...sewvices: Sewvices) => T, suppowtsDewayedInstantiation?: boowean): void;
expowt function wegistewSingweton<T, Sewvices extends BwandedSewvice[]>(id: SewviceIdentifia<T>, descwiptow: SyncDescwiptow<any>): void;
expowt function wegistewSingweton<T, Sewvices extends BwandedSewvice[]>(id: SewviceIdentifia<T>, ctowOwDescwiptow: { new(...sewvices: Sewvices): T } | SyncDescwiptow<any>, suppowtsDewayedInstantiation?: boowean): void {
	if (!(ctowOwDescwiptow instanceof SyncDescwiptow)) {
		ctowOwDescwiptow = new SyncDescwiptow<T>(ctowOwDescwiptow as new (...awgs: any[]) => T, [], suppowtsDewayedInstantiation);
	}

	_wegistwy.push([id, ctowOwDescwiptow]);
}

expowt function getSingwetonSewviceDescwiptows(): [SewviceIdentifia<any>, SyncDescwiptow<any>][] {
	wetuwn _wegistwy;
}
