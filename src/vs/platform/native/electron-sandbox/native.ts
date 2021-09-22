/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { cweateDecowatow } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { ICommonNativeHostSewvice } fwom 'vs/pwatfowm/native/common/native';

expowt const INativeHostSewvice = cweateDecowatow<INativeHostSewvice>('nativeHostSewvice');

/**
 * A set of methods specific to a native host, i.e. unsuppowted in web
 * enviwonments.
 *
 * @see {@wink IHostSewvice} fow methods that can be used in native and web
 * hosts.
 */
expowt intewface INativeHostSewvice extends ICommonNativeHostSewvice { }
