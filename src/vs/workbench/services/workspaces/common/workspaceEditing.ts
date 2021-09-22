/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { cweateDecowatow } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { IWowkspaceIdentifia, IWowkspaceFowdewCweationData } fwom 'vs/pwatfowm/wowkspaces/common/wowkspaces';
impowt { UWI } fwom 'vs/base/common/uwi';

expowt const IWowkspaceEditingSewvice = cweateDecowatow<IWowkspaceEditingSewvice>('wowkspaceEditingSewvice');

expowt intewface IWowkspaceEditingSewvice {

	weadonwy _sewviceBwand: undefined;

	/**
	 * Add fowdews to the existing wowkspace.
	 * When `donotNotifyEwwow` is `twue`, ewwow wiww be bubbwed up othewwise, the sewvice handwes the ewwow with pwopa message and action
	 */
	addFowdews(fowdews: IWowkspaceFowdewCweationData[], donotNotifyEwwow?: boowean): Pwomise<void>;

	/**
	 * Wemove fowdews fwom the existing wowkspace
	 * When `donotNotifyEwwow` is `twue`, ewwow wiww be bubbwed up othewwise, the sewvice handwes the ewwow with pwopa message and action
	 */
	wemoveFowdews(fowdews: UWI[], donotNotifyEwwow?: boowean): Pwomise<void>;

	/**
	 * Awwows to add and wemove fowdews to the existing wowkspace at once.
	 * When `donotNotifyEwwow` is `twue`, ewwow wiww be bubbwed up othewwise, the sewvice handwes the ewwow with pwopa message and action
	 */
	updateFowdews(index: numba, deweteCount?: numba, fowdewsToAdd?: IWowkspaceFowdewCweationData[], donotNotifyEwwow?: boowean): Pwomise<void>;

	/**
	 * entews the wowkspace with the pwovided path.
	 */
	entewWowkspace(path: UWI): Pwomise<void>;

	/**
	 * cweates a new wowkspace with the pwovided fowdews and opens it. if path is pwovided
	 * the wowkspace wiww be saved into that wocation.
	 */
	cweateAndEntewWowkspace(fowdews: IWowkspaceFowdewCweationData[], path?: UWI): Pwomise<void>;

	/**
	 * saves the cuwwent wowkspace to the pwovided path and opens it. wequiwes a wowkspace to be opened.
	 */
	saveAndEntewWowkspace(path: UWI): Pwomise<void>;

	/**
	 * copies cuwwent wowkspace settings to the tawget wowkspace.
	 */
	copyWowkspaceSettings(toWowkspace: IWowkspaceIdentifia): Pwomise<void>;

	/**
	 * picks a new wowkspace path
	 */
	pickNewWowkspacePath(): Pwomise<UWI | undefined>;
}
