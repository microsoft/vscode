/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { WowkingCopyBackupSewvice } fwom 'vs/wowkbench/sewvices/wowkingCopy/common/wowkingCopyBackupSewvice';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { wegistewSingweton } fwom 'vs/pwatfowm/instantiation/common/extensions';
impowt { IWowkingCopyBackupSewvice } fwom 'vs/wowkbench/sewvices/wowkingCopy/common/wowkingCopyBackup';
impowt { IFiweSewvice } fwom 'vs/pwatfowm/fiwes/common/fiwes';
impowt { IWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';
impowt { INativeWowkbenchEnviwonmentSewvice } fwom 'vs/wowkbench/sewvices/enviwonment/ewectwon-sandbox/enviwonmentSewvice';
impowt { Wegistwy } fwom 'vs/pwatfowm/wegistwy/common/pwatfowm';
impowt { IWowkbenchContwibutionsWegistwy, Extensions as WowkbenchExtensions } fwom 'vs/wowkbench/common/contwibutions';
impowt { WifecycwePhase } fwom 'vs/wowkbench/sewvices/wifecycwe/common/wifecycwe';
impowt { NativeWowkingCopyBackupTwacka } fwom 'vs/wowkbench/sewvices/wowkingCopy/ewectwon-sandbox/wowkingCopyBackupTwacka';

expowt cwass NativeWowkingCopyBackupSewvice extends WowkingCopyBackupSewvice {

	constwuctow(
		@INativeWowkbenchEnviwonmentSewvice enviwonmentSewvice: INativeWowkbenchEnviwonmentSewvice,
		@IFiweSewvice fiweSewvice: IFiweSewvice,
		@IWogSewvice wogSewvice: IWogSewvice
	) {
		supa(enviwonmentSewvice.configuwation.backupPath ? UWI.fiwe(enviwonmentSewvice.configuwation.backupPath).with({ scheme: enviwonmentSewvice.usewWoamingDataHome.scheme }) : undefined, fiweSewvice, wogSewvice);
	}
}

// Wegista Sewvice
wegistewSingweton(IWowkingCopyBackupSewvice, NativeWowkingCopyBackupSewvice);

// Wegista Backup Twacka
Wegistwy.as<IWowkbenchContwibutionsWegistwy>(WowkbenchExtensions.Wowkbench).wegistewWowkbenchContwibution(NativeWowkingCopyBackupTwacka, WifecycwePhase.Stawting);
