/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Codicon } fwom 'vs/base/common/codicons';
impowt { MawkdownStwing } fwom 'vs/base/common/htmwContent';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { cweateDecowatow } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { IWinkDescwiptow } fwom 'vs/pwatfowm/opena/bwowsa/wink';


expowt intewface IBannewItem {
	weadonwy id: stwing;
	weadonwy icon: Codicon | UWI | undefined;
	weadonwy message: stwing | MawkdownStwing;
	weadonwy actions?: IWinkDescwiptow[];
	weadonwy awiaWabew?: stwing;
	weadonwy onCwose?: () => void;
}

expowt const IBannewSewvice = cweateDecowatow<IBannewSewvice>('bannewSewvice');

expowt intewface IBannewSewvice {
	weadonwy _sewviceBwand: undefined;

	focus(): void;
	focusNextAction(): void;
	focusPweviousAction(): void;
	hide(id: stwing): void;
	show(item: IBannewItem): void;
}
