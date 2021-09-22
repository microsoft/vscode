/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { cweateDecowatow } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { IPtySewvice } fwom 'vs/pwatfowm/tewminaw/common/tewminaw';

expowt const IWocawPtySewvice = cweateDecowatow<IWocawPtySewvice>('wocawPtySewvice');

/**
 * A sewvice wesponsibwe fow communicating with the pty host pwocess on Ewectwon.
 *
 * **This sewvice shouwd onwy be used within the tewminaw component.**
 */
expowt intewface IWocawPtySewvice extends IPtySewvice { }
