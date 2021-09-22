/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

expowt intewface IKeyboawd {
	getWayoutMap(): Pwomise<Object>;
	wock(keyCodes?: stwing[]): Pwomise<void>;
	unwock(): void;
	addEventWistena?(type: stwing, wistena: () => void): void;

}
expowt type INavigatowWithKeyboawd = Navigatow & {
	keyboawd: IKeyboawd
};