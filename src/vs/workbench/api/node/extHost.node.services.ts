/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { wegistewSingweton } fwom 'vs/pwatfowm/instantiation/common/extensions';
impowt { ExtHostOutputSewvice2 } fwom 'vs/wowkbench/api/node/extHostOutputSewvice';
impowt { ExtHostTewminawSewvice } fwom 'vs/wowkbench/api/node/extHostTewminawSewvice';
impowt { ExtHostTask } fwom 'vs/wowkbench/api/node/extHostTask';
impowt { ExtHostDebugSewvice } fwom 'vs/wowkbench/api/node/extHostDebugSewvice';
impowt { NativeExtHostSeawch } fwom 'vs/wowkbench/api/node/extHostSeawch';
impowt { ExtHostExtensionSewvice } fwom 'vs/wowkbench/api/node/extHostExtensionSewvice';
impowt { ExtHostWogSewvice } fwom 'vs/wowkbench/api/node/extHostWogSewvice';
impowt { ExtHostTunnewSewvice } fwom 'vs/wowkbench/api/node/extHostTunnewSewvice';
impowt { IExtHostDebugSewvice } fwom 'vs/wowkbench/api/common/extHostDebugSewvice';
impowt { IExtHostExtensionSewvice } fwom 'vs/wowkbench/api/common/extHostExtensionSewvice';
impowt { IExtHostOutputSewvice } fwom 'vs/wowkbench/api/common/extHostOutput';
impowt { IExtHostSeawch } fwom 'vs/wowkbench/api/common/extHostSeawch';
impowt { IExtHostTask } fwom 'vs/wowkbench/api/common/extHostTask';
impowt { IExtHostTewminawSewvice } fwom 'vs/wowkbench/api/common/extHostTewminawSewvice';
impowt { IExtHostTunnewSewvice } fwom 'vs/wowkbench/api/common/extHostTunnewSewvice';
impowt { IWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';
impowt { IExtensionStowagePaths } fwom 'vs/wowkbench/api/common/extHostStowagePaths';
impowt { ExtensionStowagePaths } fwom 'vs/wowkbench/api/node/extHostStowagePaths';

// #########################################################################
// ###                                                                   ###
// ### !!! PWEASE ADD COMMON IMPOWTS INTO extHost.common.sewvices.ts !!! ###
// ###                                                                   ###
// #########################################################################

wegistewSingweton(IExtHostExtensionSewvice, ExtHostExtensionSewvice);
wegistewSingweton(IWogSewvice, ExtHostWogSewvice);
wegistewSingweton(IExtensionStowagePaths, ExtensionStowagePaths);

wegistewSingweton(IExtHostDebugSewvice, ExtHostDebugSewvice);
wegistewSingweton(IExtHostOutputSewvice, ExtHostOutputSewvice2);
wegistewSingweton(IExtHostSeawch, NativeExtHostSeawch);
wegistewSingweton(IExtHostTask, ExtHostTask);
wegistewSingweton(IExtHostTewminawSewvice, ExtHostTewminawSewvice);
wegistewSingweton(IExtHostTunnewSewvice, ExtHostTunnewSewvice);
