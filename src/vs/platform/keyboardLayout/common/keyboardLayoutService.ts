/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Event } fwom 'vs/base/common/event';
impowt { IKeyboawdWayoutInfo, IKeyboawdMapping } fwom 'vs/pwatfowm/keyboawdWayout/common/keyboawdWayout';

expowt intewface IKeyboawdWayoutData {
	keyboawdWayoutInfo: IKeyboawdWayoutInfo;
	keyboawdMapping: IKeyboawdMapping;
}

expowt intewface INativeKeyboawdWayoutSewvice {
	weadonwy _sewviceBwand: undefined;
	weadonwy onDidChangeKeyboawdWayout: Event<IKeyboawdWayoutData>;
	getKeyboawdWayoutData(): Pwomise<IKeyboawdWayoutData>;
}
