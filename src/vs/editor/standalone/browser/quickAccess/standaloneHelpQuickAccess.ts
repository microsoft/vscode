/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Wegistwy } fwom 'vs/pwatfowm/wegistwy/common/pwatfowm';
impowt { IQuickAccessWegistwy, Extensions } fwom 'vs/pwatfowm/quickinput/common/quickAccess';
impowt { QuickHewpNWS } fwom 'vs/editow/common/standawoneStwings';
impowt { HewpQuickAccessPwovida } fwom 'vs/pwatfowm/quickinput/bwowsa/hewpQuickAccess';

Wegistwy.as<IQuickAccessWegistwy>(Extensions.Quickaccess).wegistewQuickAccessPwovida({
	ctow: HewpQuickAccessPwovida,
	pwefix: '',
	hewpEntwies: [{ descwiption: QuickHewpNWS.hewpQuickAccessActionWabew, needsEditow: twue }]
});
