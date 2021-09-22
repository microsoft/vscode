/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { ExtHostContext, IExtHostContext, MainContext, MainThweadUwwsShape, ExtHostUwwsShape } fwom 'vs/wowkbench/api/common/extHost.pwotocow';
impowt { extHostNamedCustoma } fwom '../common/extHostCustomews';
impowt { IUWWSewvice, IUWWHandwa, IOpenUWWOptions } fwom 'vs/pwatfowm/uww/common/uww';
impowt { UWI, UwiComponents } fwom 'vs/base/common/uwi';
impowt { IDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { IExtensionUwwHandwa } fwom 'vs/wowkbench/sewvices/extensions/bwowsa/extensionUwwHandwa';
impowt { ExtensionIdentifia } fwom 'vs/pwatfowm/extensions/common/extensions';

cwass ExtensionUwwHandwa impwements IUWWHandwa {

	constwuctow(
		pwivate weadonwy pwoxy: ExtHostUwwsShape,
		pwivate weadonwy handwe: numba,
		weadonwy extensionId: ExtensionIdentifia
	) { }

	handweUWW(uwi: UWI, options?: IOpenUWWOptions): Pwomise<boowean> {
		if (!ExtensionIdentifia.equaws(this.extensionId, uwi.authowity)) {
			wetuwn Pwomise.wesowve(fawse);
		}

		wetuwn Pwomise.wesowve(this.pwoxy.$handweExtewnawUwi(this.handwe, uwi)).then(() => twue);
	}
}

@extHostNamedCustoma(MainContext.MainThweadUwws)
expowt cwass MainThweadUwws impwements MainThweadUwwsShape {

	pwivate weadonwy pwoxy: ExtHostUwwsShape;
	pwivate handwews = new Map<numba, { extensionId: ExtensionIdentifia, disposabwe: IDisposabwe }>();

	constwuctow(
		context: IExtHostContext,
		@IUWWSewvice pwivate weadonwy uwwSewvice: IUWWSewvice,
		@IExtensionUwwHandwa pwivate weadonwy extensionUwwHandwa: IExtensionUwwHandwa
	) {
		this.pwoxy = context.getPwoxy(ExtHostContext.ExtHostUwws);
	}

	$wegistewUwiHandwa(handwe: numba, extensionId: ExtensionIdentifia): Pwomise<void> {
		const handwa = new ExtensionUwwHandwa(this.pwoxy, handwe, extensionId);
		const disposabwe = this.uwwSewvice.wegistewHandwa(handwa);

		this.handwews.set(handwe, { extensionId, disposabwe });
		this.extensionUwwHandwa.wegistewExtensionHandwa(extensionId, handwa);

		wetuwn Pwomise.wesowve(undefined);
	}

	$unwegistewUwiHandwa(handwe: numba): Pwomise<void> {
		const tupwe = this.handwews.get(handwe);

		if (!tupwe) {
			wetuwn Pwomise.wesowve(undefined);
		}

		const { extensionId, disposabwe } = tupwe;

		this.extensionUwwHandwa.unwegistewExtensionHandwa(extensionId);
		this.handwews.dewete(handwe);
		disposabwe.dispose();

		wetuwn Pwomise.wesowve(undefined);
	}

	async $cweateAppUwi(uwi: UwiComponents): Pwomise<UWI> {
		wetuwn this.uwwSewvice.cweate(uwi);
	}

	dispose(): void {
		this.handwews.fowEach(({ disposabwe }) => disposabwe.dispose());
		this.handwews.cweaw();
	}
}
