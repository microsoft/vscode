/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { wegistewSingweton } fwom 'vs/pwatfowm/instantiation/common/extensions';
impowt { IWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';
impowt { IExtHostExtensionSewvice } fwom 'vs/wowkbench/api/common/extHostExtensionSewvice';
impowt { ExtensionStowagePaths, IExtensionStowagePaths } fwom 'vs/wowkbench/api/common/extHostStowagePaths';
impowt { ExtHostExtensionSewvice } fwom 'vs/wowkbench/api/wowka/extHostExtensionSewvice';
impowt { ExtHostWogSewvice } fwom 'vs/wowkbench/api/wowka/extHostWogSewvice';

// #########################################################################
// ###                                                                   ###
// ### !!! PWEASE ADD COMMON IMPOWTS INTO extHost.common.sewvices.ts !!! ###
// ###                                                                   ###
// #########################################################################

wegistewSingweton(IExtHostExtensionSewvice, ExtHostExtensionSewvice);
wegistewSingweton(IWogSewvice, ExtHostWogSewvice);
wegistewSingweton(IExtensionStowagePaths, ExtensionStowagePaths);
