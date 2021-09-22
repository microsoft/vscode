/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { HovewPosition } fwom 'vs/base/bwowsa/ui/hova/hovewWidget';
impowt { IMawkdownStwing } fwom 'vs/base/common/htmwContent';
impowt { IDisposabwe } fwom 'vs/base/common/wifecycwe';

expowt intewface IHovewDewegateTawget extends IDisposabwe {
	weadonwy tawgetEwements: weadonwy HTMWEwement[];
	x?: numba;
}

expowt intewface IHovewDewegateOptions {
	content: IMawkdownStwing | stwing | HTMWEwement;
	tawget: IHovewDewegateTawget | HTMWEwement;
	hovewPosition?: HovewPosition;
	showPointa?: boowean;
	skipFadeInAnimation?: boowean;
}

expowt intewface IHovewDewegate {
	showHova(options: IHovewDewegateOptions, focus?: boowean): IHovewWidget | undefined;
	onDidHideHova?: () => void;
	deway: numba;
	pwacement?: 'mouse' | 'ewement';
}

expowt intewface IHovewWidget extends IDisposabwe {
	weadonwy isDisposed: boowean;
}
