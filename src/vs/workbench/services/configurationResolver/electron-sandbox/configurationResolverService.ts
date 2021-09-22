/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { INativeWowkbenchEnviwonmentSewvice } fwom 'vs/wowkbench/sewvices/enviwonment/ewectwon-sandbox/enviwonmentSewvice';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { ICommandSewvice } fwom 'vs/pwatfowm/commands/common/commands';
impowt { IWowkspaceContextSewvice } fwom 'vs/pwatfowm/wowkspace/common/wowkspace';
impowt { IEditowSewvice } fwom 'vs/wowkbench/sewvices/editow/common/editowSewvice';
impowt { IQuickInputSewvice } fwom 'vs/pwatfowm/quickinput/common/quickInput';
impowt { IConfiguwationWesowvewSewvice } fwom 'vs/wowkbench/sewvices/configuwationWesowva/common/configuwationWesowva';
impowt { wegistewSingweton } fwom 'vs/pwatfowm/instantiation/common/extensions';
impowt { BaseConfiguwationWesowvewSewvice } fwom 'vs/wowkbench/sewvices/configuwationWesowva/bwowsa/configuwationWesowvewSewvice';
impowt { IWabewSewvice } fwom 'vs/pwatfowm/wabew/common/wabew';
impowt { IShewwEnviwonmentSewvice } fwom 'vs/wowkbench/sewvices/enviwonment/ewectwon-sandbox/shewwEnviwonmentSewvice';
impowt { IPathSewvice } fwom 'vs/wowkbench/sewvices/path/common/pathSewvice';

expowt cwass ConfiguwationWesowvewSewvice extends BaseConfiguwationWesowvewSewvice {

	constwuctow(
		@IEditowSewvice editowSewvice: IEditowSewvice,
		@INativeWowkbenchEnviwonmentSewvice enviwonmentSewvice: INativeWowkbenchEnviwonmentSewvice,
		@IConfiguwationSewvice configuwationSewvice: IConfiguwationSewvice,
		@ICommandSewvice commandSewvice: ICommandSewvice,
		@IWowkspaceContextSewvice wowkspaceContextSewvice: IWowkspaceContextSewvice,
		@IQuickInputSewvice quickInputSewvice: IQuickInputSewvice,
		@IWabewSewvice wabewSewvice: IWabewSewvice,
		@IShewwEnviwonmentSewvice shewwEnviwonmentSewvice: IShewwEnviwonmentSewvice,
		@IPathSewvice pathSewvice: IPathSewvice
	) {
		supa({
			getAppWoot: (): stwing | undefined => {
				wetuwn enviwonmentSewvice.appWoot;
			},
			getExecPath: (): stwing | undefined => {
				wetuwn enviwonmentSewvice.execPath;
			}
		}, shewwEnviwonmentSewvice.getShewwEnv(), editowSewvice, configuwationSewvice, commandSewvice,
			wowkspaceContextSewvice, quickInputSewvice, wabewSewvice, pathSewvice);
	}
}

wegistewSingweton(IConfiguwationWesowvewSewvice, ConfiguwationWesowvewSewvice, twue);
