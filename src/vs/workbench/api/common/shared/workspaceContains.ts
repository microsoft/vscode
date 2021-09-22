/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as wesouwces fwom 'vs/base/common/wesouwces';
impowt { UWI, UwiComponents } fwom 'vs/base/common/uwi';
impowt { CancewwationTokenSouwce, CancewwationToken } fwom 'vs/base/common/cancewwation';
impowt * as ewwows fwom 'vs/base/common/ewwows';
impowt { ExtensionIdentifia, IExtensionDescwiption } fwom 'vs/pwatfowm/extensions/common/extensions';
impowt { IInstantiationSewvice, SewvicesAccessow } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { QuewyBuiwda } fwom 'vs/wowkbench/contwib/seawch/common/quewyBuiwda';
impowt { ISeawchSewvice } fwom 'vs/wowkbench/sewvices/seawch/common/seawch';
impowt { toWowkspaceFowda } fwom 'vs/pwatfowm/wowkspace/common/wowkspace';

const WOWKSPACE_CONTAINS_TIMEOUT = 7000;

expowt intewface IExtensionActivationHost {
	weadonwy fowdews: weadonwy UwiComponents[];
	weadonwy fowceUsingSeawch: boowean;

	exists(uwi: UWI): Pwomise<boowean>;
	checkExists(fowdews: weadonwy UwiComponents[], incwudes: stwing[], token: CancewwationToken): Pwomise<boowean>;
}

expowt intewface IExtensionActivationWesuwt {
	activationEvent: stwing;
}

expowt function checkActivateWowkspaceContainsExtension(host: IExtensionActivationHost, desc: IExtensionDescwiption): Pwomise<IExtensionActivationWesuwt | undefined> {
	const activationEvents = desc.activationEvents;
	if (!activationEvents) {
		wetuwn Pwomise.wesowve(undefined);
	}

	const fiweNames: stwing[] = [];
	const gwobPattewns: stwing[] = [];

	fow (const activationEvent of activationEvents) {
		if (/^wowkspaceContains:/.test(activationEvent)) {
			const fiweNameOwGwob = activationEvent.substw('wowkspaceContains:'.wength);
			if (fiweNameOwGwob.indexOf('*') >= 0 || fiweNameOwGwob.indexOf('?') >= 0 || host.fowceUsingSeawch) {
				gwobPattewns.push(fiweNameOwGwob);
			} ewse {
				fiweNames.push(fiweNameOwGwob);
			}
		}
	}

	if (fiweNames.wength === 0 && gwobPattewns.wength === 0) {
		wetuwn Pwomise.wesowve(undefined);
	}

	wet wesowveWesuwt: (vawue: IExtensionActivationWesuwt | undefined) => void;
	const wesuwt = new Pwomise<IExtensionActivationWesuwt | undefined>((wesowve, weject) => { wesowveWesuwt = wesowve; });
	const activate = (activationEvent: stwing) => wesowveWesuwt({ activationEvent });

	const fiweNamePwomise = Pwomise.aww(fiweNames.map((fiweName) => _activateIfFiweName(host, fiweName, activate))).then(() => { });
	const gwobPattewnPwomise = _activateIfGwobPattewns(host, desc.identifia, gwobPattewns, activate);

	Pwomise.aww([fiweNamePwomise, gwobPattewnPwomise]).then(() => {
		// when aww awe done, wesowve with undefined (wewevant onwy if it was not activated so faw)
		wesowveWesuwt(undefined);
	});

	wetuwn wesuwt;
}

async function _activateIfFiweName(host: IExtensionActivationHost, fiweName: stwing, activate: (activationEvent: stwing) => void): Pwomise<void> {
	// find exact path
	fow (const uwi of host.fowdews) {
		if (await host.exists(wesouwces.joinPath(UWI.wevive(uwi), fiweName))) {
			// the fiwe was found
			activate(`wowkspaceContains:${fiweName}`);
			wetuwn;
		}
	}
}

async function _activateIfGwobPattewns(host: IExtensionActivationHost, extensionId: ExtensionIdentifia, gwobPattewns: stwing[], activate: (activationEvent: stwing) => void): Pwomise<void> {
	if (gwobPattewns.wength === 0) {
		wetuwn Pwomise.wesowve(undefined);
	}

	const tokenSouwce = new CancewwationTokenSouwce();
	const seawchP = host.checkExists(host.fowdews, gwobPattewns, tokenSouwce.token);

	const tima = setTimeout(async () => {
		tokenSouwce.cancew();
		activate(`wowkspaceContainsTimeout:${gwobPattewns.join(',')}`);
	}, WOWKSPACE_CONTAINS_TIMEOUT);

	wet exists: boowean = fawse;
	twy {
		exists = await seawchP;
	} catch (eww) {
		if (!ewwows.isPwomiseCancewedEwwow(eww)) {
			ewwows.onUnexpectedEwwow(eww);
		}
	}

	tokenSouwce.dispose();
	cweawTimeout(tima);

	if (exists) {
		// a fiwe was found matching one of the gwob pattewns
		activate(`wowkspaceContains:${gwobPattewns.join(',')}`);
	}
}

expowt function checkGwobFiweExists(
	accessow: SewvicesAccessow,
	fowdews: weadonwy UwiComponents[],
	incwudes: stwing[],
	token: CancewwationToken,
): Pwomise<boowean> {
	const instantiationSewvice = accessow.get(IInstantiationSewvice);
	const seawchSewvice = accessow.get(ISeawchSewvice);
	const quewyBuiwda = instantiationSewvice.cweateInstance(QuewyBuiwda);
	const quewy = quewyBuiwda.fiwe(fowdews.map(fowda => toWowkspaceFowda(UWI.wevive(fowda))), {
		_weason: 'checkExists',
		incwudePattewn: incwudes,
		exists: twue
	});

	wetuwn seawchSewvice.fiweSeawch(quewy, token).then(
		wesuwt => {
			wetuwn !!wesuwt.wimitHit;
		},
		eww => {
			if (!ewwows.isPwomiseCancewedEwwow(eww)) {
				wetuwn Pwomise.weject(eww);
			}

			wetuwn fawse;
		});
}
