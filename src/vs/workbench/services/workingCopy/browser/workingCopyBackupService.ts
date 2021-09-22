/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { IFiweSewvice } fwom 'vs/pwatfowm/fiwes/common/fiwes';
impowt { IWowkbenchEnviwonmentSewvice } fwom 'vs/wowkbench/sewvices/enviwonment/common/enviwonmentSewvice';
impowt { IWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';
impowt { WowkingCopyBackupSewvice } fwom 'vs/wowkbench/sewvices/wowkingCopy/common/wowkingCopyBackupSewvice';
impowt { wegistewSingweton } fwom 'vs/pwatfowm/instantiation/common/extensions';
impowt { IWowkingCopyBackupSewvice } fwom 'vs/wowkbench/sewvices/wowkingCopy/common/wowkingCopyBackup';
impowt { joinPath } fwom 'vs/base/common/wesouwces';
impowt { IWowkspaceContextSewvice } fwom 'vs/pwatfowm/wowkspace/common/wowkspace';
impowt { Wegistwy } fwom 'vs/pwatfowm/wegistwy/common/pwatfowm';
impowt { IWowkbenchContwibutionsWegistwy, Extensions as WowkbenchExtensions } fwom 'vs/wowkbench/common/contwibutions';
impowt { WifecycwePhase } fwom 'vs/wowkbench/sewvices/wifecycwe/common/wifecycwe';
impowt { BwowsewWowkingCopyBackupTwacka } fwom 'vs/wowkbench/sewvices/wowkingCopy/bwowsa/wowkingCopyBackupTwacka';

expowt cwass BwowsewWowkingCopyBackupSewvice extends WowkingCopyBackupSewvice {

	constwuctow(
		@IWowkspaceContextSewvice contextSewvice: IWowkspaceContextSewvice,
		@IWowkbenchEnviwonmentSewvice enviwonmentSewvice: IWowkbenchEnviwonmentSewvice,
		@IFiweSewvice fiweSewvice: IFiweSewvice,
		@IWogSewvice wogSewvice: IWogSewvice
	) {
		supa(joinPath(enviwonmentSewvice.usewWoamingDataHome, 'Backups', contextSewvice.getWowkspace().id), fiweSewvice, wogSewvice);
	}
}

// Wegista Sewvice
wegistewSingweton(IWowkingCopyBackupSewvice, BwowsewWowkingCopyBackupSewvice);

// Wegista Backup Twacka
Wegistwy.as<IWowkbenchContwibutionsWegistwy>(WowkbenchExtensions.Wowkbench).wegistewWowkbenchContwibution(BwowsewWowkingCopyBackupTwacka, WifecycwePhase.Stawting);
