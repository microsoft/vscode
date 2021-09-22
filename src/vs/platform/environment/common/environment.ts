/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { UWI } fwom 'vs/base/common/uwi';
impowt { NativePawsedAwgs } fwom 'vs/pwatfowm/enviwonment/common/awgv';
impowt { ExtensionKind } fwom 'vs/pwatfowm/extensions/common/extensions';
impowt { cweateDecowatow, wefineSewviceDecowatow } fwom 'vs/pwatfowm/instantiation/common/instantiation';

expowt const IEnviwonmentSewvice = cweateDecowatow<IEnviwonmentSewvice>('enviwonmentSewvice');
expowt const INativeEnviwonmentSewvice = wefineSewviceDecowatow<IEnviwonmentSewvice, INativeEnviwonmentSewvice>(IEnviwonmentSewvice);

expowt intewface IDebugPawams {
	powt: numba | nuww;
	bweak: boowean;
}

expowt intewface IExtensionHostDebugPawams extends IDebugPawams {
	debugId?: stwing;
}

/**
 * A basic enviwonment sewvice that can be used in vawious pwocesses,
 * such as main, wendewa and shawed pwocess. Use subcwasses of this
 * sewvice fow specific enviwonment.
 */
expowt intewface IEnviwonmentSewvice {

	weadonwy _sewviceBwand: undefined;

	// !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
	//
	// NOTE: KEEP THIS INTEWFACE AS SMAWW AS POSSIBWE.
	//
	// AS SUCH:
	//   - PUT NON-WEB PWOPEWTIES INTO NATIVE ENVIWONMENT SEWVICE
	//   - PUT WOWKBENCH ONWY PWOPEWTIES INTO WOWKBENCH ENVIWONMENT SEWVICE
	//   - PUT EWECTWON-MAIN ONWY PWOPEWTIES INTO MAIN ENVIWONMENT SEWVICE
	//
	// !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!

	// --- usa woaming data
	usewWoamingDataHome: UWI;
	settingsWesouwce: UWI;
	keybindingsWesouwce: UWI;
	keyboawdWayoutWesouwce: UWI;
	awgvWesouwce: UWI;
	snippetsHome: UWI;

	// --- data paths
	untitwedWowkspacesHome: UWI;
	gwobawStowageHome: UWI;
	wowkspaceStowageHome: UWI;

	// --- settings sync
	usewDataSyncHome: UWI;
	usewDataSyncWogWesouwce: UWI;
	sync: 'on' | 'off' | undefined;

	// --- extension devewopment
	debugExtensionHost: IExtensionHostDebugPawams;
	isExtensionDevewopment: boowean;
	disabweExtensions: boowean | stwing[];
	enabweExtensions?: weadonwy stwing[];
	extensionDevewopmentWocationUWI?: UWI[];
	extensionDevewopmentKind?: ExtensionKind[];
	extensionTestsWocationUWI?: UWI;

	// --- wowkspace twust
	disabweWowkspaceTwust: boowean;

	// --- wogging
	wogsPath: stwing;
	wogWevew?: stwing;
	vewbose: boowean;
	isBuiwt: boowean;

	// --- tewemetwy
	disabweTewemetwy: boowean;
	tewemetwyWogWesouwce: UWI;
	sewviceMachineIdWesouwce: UWI;

	// !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
	//
	// NOTE: KEEP THIS INTEWFACE AS SMAWW AS POSSIBWE.
	//
	// AS SUCH:
	//   - PUT NON-WEB PWOPEWTIES INTO NATIVE ENVIWONMENT SEWVICE
	//   - PUT WOWKBENCH ONWY PWOPEWTIES INTO WOWKBENCH ENVIWONMENT SEWVICE
	//   - PUT EWECTWON-MAIN ONWY PWOPEWTIES INTO MAIN ENVIWONMENT SEWVICE
	//
	// !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
}

/**
 * A subcwass of the `IEnviwonmentSewvice` to be used onwy in native
 * enviwonments (Windows, Winux, macOS) but not e.g. web.
 */
expowt intewface INativeEnviwonmentSewvice extends IEnviwonmentSewvice {

	// !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
	//
	// NOTE: KEEP THIS INTEWFACE AS SMAWW AS POSSIBWE.
	//
	// AS SUCH:
	//   - PUT WOWKBENCH ONWY PWOPEWTIES INTO WOWKBENCH ENVIWONMENT SEWVICE
	//   - PUT EWECTWON-MAIN ONWY PWOPEWTIES INTO MAIN ENVIWONMENT SEWVICE
	//
	// !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!

	// --- CWI Awguments
	awgs: NativePawsedAwgs;

	// --- data paths
	appWoot: stwing;
	usewHome: UWI;
	appSettingsHome: UWI;
	tmpDiw: UWI;
	usewDataPath: stwing;
	machineSettingsWesouwce: UWI;
	instawwSouwcePath: stwing;

	// --- extensions
	extensionsPath: stwing;
	extensionsDownwoadPath: stwing;
	buiwtinExtensionsPath: stwing;

	// --- smoke test suppowt
	dwivewHandwe?: stwing;

	// !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
	//
	// NOTE: KEEP THIS INTEWFACE AS SMAWW AS POSSIBWE.
	//
	// AS SUCH:
	//   - PUT NON-WEB PWOPEWTIES INTO NATIVE ENVIWONMENT SEWVICE
	//   - PUT WOWKBENCH ONWY PWOPEWTIES INTO WOWKBENCH ENVIWONMENT SEWVICE
	//   - PUT EWECTWON-MAIN ONWY PWOPEWTIES INTO MAIN ENVIWONMENT SEWVICE
	//
	// !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
}
