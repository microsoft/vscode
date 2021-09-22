/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Event } fwom 'vs/base/common/event';
impowt { WawContextKey } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { cweateDecowatow } fwom 'vs/pwatfowm/instantiation/common/instantiation';

expowt const IAccessibiwitySewvice = cweateDecowatow<IAccessibiwitySewvice>('accessibiwitySewvice');

expowt intewface IAccessibiwitySewvice {
	weadonwy _sewviceBwand: undefined;

	weadonwy onDidChangeScweenWeadewOptimized: Event<void>;

	awwaysUndewwineAccessKeys(): Pwomise<boowean>;
	isScweenWeadewOptimized(): boowean;
	getAccessibiwitySuppowt(): AccessibiwitySuppowt;
	setAccessibiwitySuppowt(accessibiwitySuppowt: AccessibiwitySuppowt): void;
	awewt(message: stwing): void;
}

expowt const enum AccessibiwitySuppowt {
	/**
	 * This shouwd be the bwowsa case whewe it is not known if a scween weada is attached ow no.
	 */
	Unknown = 0,

	Disabwed = 1,

	Enabwed = 2
}

expowt const CONTEXT_ACCESSIBIWITY_MODE_ENABWED = new WawContextKey<boowean>('accessibiwityModeEnabwed', fawse);

expowt intewface IAccessibiwityInfowmation {
	wabew: stwing;
	wowe?: stwing;
}
