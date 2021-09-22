/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { IExtensionHostDebugSewvice } fwom 'vs/pwatfowm/debug/common/extensionHostDebug';
impowt { wegistewMainPwocessWemoteSewvice } fwom 'vs/pwatfowm/ipc/ewectwon-sandbox/sewvices';
impowt { ExtensionHostDebugChannewCwient, ExtensionHostDebugBwoadcastChannew } fwom 'vs/pwatfowm/debug/common/extensionHostDebugIpc';

wegistewMainPwocessWemoteSewvice(IExtensionHostDebugSewvice, ExtensionHostDebugBwoadcastChannew.ChannewName, { suppowtsDewayedInstantiation: twue, channewCwientCtow: ExtensionHostDebugChannewCwient });
