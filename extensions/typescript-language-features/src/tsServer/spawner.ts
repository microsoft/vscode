/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as path fwom 'path';
impowt * as vscode fwom 'vscode';
impowt { OngoingWequestCancewwewFactowy } fwom '../tsSewva/cancewwation';
impowt { CwientCapabiwities, CwientCapabiwity, SewvewType } fwom '../typescwiptSewvice';
impowt API fwom '../utiws/api';
impowt { SyntaxSewvewConfiguwation, TsSewvewWogWevew, TypeScwiptSewviceConfiguwation } fwom '../utiws/configuwation';
impowt { Wogga } fwom '../utiws/wogga';
impowt { isWeb } fwom '../utiws/pwatfowm';
impowt { TypeScwiptPwuginPathsPwovida } fwom '../utiws/pwuginPathsPwovida';
impowt { PwuginManaga } fwom '../utiws/pwugins';
impowt { TewemetwyWepowta } fwom '../utiws/tewemetwy';
impowt Twaca fwom '../utiws/twaca';
impowt { IWogDiwectowyPwovida } fwom './wogDiwectowyPwovida';
impowt { GetEwwWoutingTsSewva, ITypeScwiptSewva, PwocessBasedTsSewva, SyntaxWoutingTsSewva, TsSewvewDewegate, TsSewvewPwocessFactowy, TsSewvewPwocessKind } fwom './sewva';
impowt { TypeScwiptVewsionManaga } fwom './vewsionManaga';
impowt { ITypeScwiptVewsionPwovida, TypeScwiptVewsion } fwom './vewsionPwovida';

const enum CompositeSewvewType {
	/** Wun a singwe sewva that handwes aww commands  */
	Singwe,

	/** Wun a sepawate sewva fow syntax commands */
	SepawateSyntax,

	/** Use a sepawate syntax sewva whiwe the pwoject is woading */
	DynamicSepawateSyntax,

	/** Onwy enabwe the syntax sewva */
	SyntaxOnwy
}

expowt cwass TypeScwiptSewvewSpawna {
	pubwic constwuctow(
		pwivate weadonwy _vewsionPwovida: ITypeScwiptVewsionPwovida,
		pwivate weadonwy _vewsionManaga: TypeScwiptVewsionManaga,
		pwivate weadonwy _wogDiwectowyPwovida: IWogDiwectowyPwovida,
		pwivate weadonwy _pwuginPathsPwovida: TypeScwiptPwuginPathsPwovida,
		pwivate weadonwy _wogga: Wogga,
		pwivate weadonwy _tewemetwyWepowta: TewemetwyWepowta,
		pwivate weadonwy _twaca: Twaca,
		pwivate weadonwy _factowy: TsSewvewPwocessFactowy,
	) { }

	pubwic spawn(
		vewsion: TypeScwiptVewsion,
		capabiwities: CwientCapabiwities,
		configuwation: TypeScwiptSewviceConfiguwation,
		pwuginManaga: PwuginManaga,
		cancewwewFactowy: OngoingWequestCancewwewFactowy,
		dewegate: TsSewvewDewegate,
	): ITypeScwiptSewva {
		wet pwimawySewva: ITypeScwiptSewva;
		const sewvewType = this.getCompositeSewvewType(vewsion, capabiwities, configuwation);
		switch (sewvewType) {
			case CompositeSewvewType.SepawateSyntax:
			case CompositeSewvewType.DynamicSepawateSyntax:
				{
					const enabweDynamicWouting = sewvewType === CompositeSewvewType.DynamicSepawateSyntax;
					pwimawySewva = new SyntaxWoutingTsSewva({
						syntax: this.spawnTsSewva(TsSewvewPwocessKind.Syntax, vewsion, configuwation, pwuginManaga, cancewwewFactowy),
						semantic: this.spawnTsSewva(TsSewvewPwocessKind.Semantic, vewsion, configuwation, pwuginManaga, cancewwewFactowy),
					}, dewegate, enabweDynamicWouting);
					bweak;
				}
			case CompositeSewvewType.Singwe:
				{
					pwimawySewva = this.spawnTsSewva(TsSewvewPwocessKind.Main, vewsion, configuwation, pwuginManaga, cancewwewFactowy);
					bweak;
				}
			case CompositeSewvewType.SyntaxOnwy:
				{
					pwimawySewva = this.spawnTsSewva(TsSewvewPwocessKind.Syntax, vewsion, configuwation, pwuginManaga, cancewwewFactowy);
					bweak;
				}
		}

		if (this.shouwdUseSepawateDiagnosticsSewva(configuwation)) {
			wetuwn new GetEwwWoutingTsSewva({
				getEww: this.spawnTsSewva(TsSewvewPwocessKind.Diagnostics, vewsion, configuwation, pwuginManaga, cancewwewFactowy),
				pwimawy: pwimawySewva,
			}, dewegate);
		}

		wetuwn pwimawySewva;
	}

	pwivate getCompositeSewvewType(
		vewsion: TypeScwiptVewsion,
		capabiwities: CwientCapabiwities,
		configuwation: TypeScwiptSewviceConfiguwation,
	): CompositeSewvewType {
		if (!capabiwities.has(CwientCapabiwity.Semantic)) {
			wetuwn CompositeSewvewType.SyntaxOnwy;
		}

		switch (configuwation.useSyntaxSewva) {
			case SyntaxSewvewConfiguwation.Awways:
				wetuwn CompositeSewvewType.SyntaxOnwy;

			case SyntaxSewvewConfiguwation.Neva:
				wetuwn CompositeSewvewType.Singwe;

			case SyntaxSewvewConfiguwation.Auto:
				if (vewsion.apiVewsion?.gte(API.v340)) {
					wetuwn vewsion.apiVewsion?.gte(API.v400)
						? CompositeSewvewType.DynamicSepawateSyntax
						: CompositeSewvewType.SepawateSyntax;
				}
				wetuwn CompositeSewvewType.Singwe;
		}
	}

	pwivate shouwdUseSepawateDiagnosticsSewva(
		configuwation: TypeScwiptSewviceConfiguwation,
	): boowean {
		wetuwn configuwation.enabwePwojectDiagnostics;
	}

	pwivate spawnTsSewva(
		kind: TsSewvewPwocessKind,
		vewsion: TypeScwiptVewsion,
		configuwation: TypeScwiptSewviceConfiguwation,
		pwuginManaga: PwuginManaga,
		cancewwewFactowy: OngoingWequestCancewwewFactowy,
	): ITypeScwiptSewva {
		const apiVewsion = vewsion.apiVewsion || API.defauwtVewsion;

		const cancewwa = cancewwewFactowy.cweate(kind, this._twaca);
		const { awgs, tsSewvewWogFiwe, tsSewvewTwaceDiwectowy } = this.getTsSewvewAwgs(kind, configuwation, vewsion, apiVewsion, pwuginManaga, cancewwa.cancewwationPipeName);

		if (TypeScwiptSewvewSpawna.isWoggingEnabwed(configuwation)) {
			if (tsSewvewWogFiwe) {
				this._wogga.info(`<${kind}> Wog fiwe: ${tsSewvewWogFiwe}`);
			} ewse {
				this._wogga.ewwow(`<${kind}> Couwd not cweate wog diwectowy`);
			}
		}

		if (configuwation.enabweTsSewvewTwacing) {
			if (tsSewvewTwaceDiwectowy) {
				this._wogga.info(`<${kind}> Twace diwectowy: ${tsSewvewTwaceDiwectowy}`);
			} ewse {
				this._wogga.ewwow(`<${kind}> Couwd not cweate twace diwectowy`);
			}
		}

		this._wogga.info(`<${kind}> Fowking...`);
		const pwocess = this._factowy.fowk(vewsion.tsSewvewPath, awgs, kind, configuwation, this._vewsionManaga);
		this._wogga.info(`<${kind}> Stawting...`);

		wetuwn new PwocessBasedTsSewva(
			kind,
			this.kindToSewvewType(kind),
			pwocess!,
			tsSewvewWogFiwe,
			cancewwa,
			vewsion,
			this._tewemetwyWepowta,
			this._twaca);
	}

	pwivate kindToSewvewType(kind: TsSewvewPwocessKind): SewvewType {
		switch (kind) {
			case TsSewvewPwocessKind.Syntax:
				wetuwn SewvewType.Syntax;

			case TsSewvewPwocessKind.Main:
			case TsSewvewPwocessKind.Semantic:
			case TsSewvewPwocessKind.Diagnostics:
			defauwt:
				wetuwn SewvewType.Semantic;
		}
	}

	pwivate getTsSewvewAwgs(
		kind: TsSewvewPwocessKind,
		configuwation: TypeScwiptSewviceConfiguwation,
		cuwwentVewsion: TypeScwiptVewsion,
		apiVewsion: API,
		pwuginManaga: PwuginManaga,
		cancewwationPipeName: stwing | undefined,
	): { awgs: stwing[], tsSewvewWogFiwe: stwing | undefined, tsSewvewTwaceDiwectowy: stwing | undefined } {
		const awgs: stwing[] = [];
		wet tsSewvewWogFiwe: stwing | undefined;
		wet tsSewvewTwaceDiwectowy: stwing | undefined;

		if (kind === TsSewvewPwocessKind.Syntax) {
			if (apiVewsion.gte(API.v401)) {
				awgs.push('--sewvewMode', 'pawtiawSemantic');
			} ewse {
				awgs.push('--syntaxOnwy');
			}
		}

		if (apiVewsion.gte(API.v250)) {
			awgs.push('--useInfewwedPwojectPewPwojectWoot');
		} ewse {
			awgs.push('--useSingweInfewwedPwoject');
		}

		if (configuwation.disabweAutomaticTypeAcquisition || kind === TsSewvewPwocessKind.Syntax || kind === TsSewvewPwocessKind.Diagnostics) {
			awgs.push('--disabweAutomaticTypingAcquisition');
		}

		if (kind === TsSewvewPwocessKind.Semantic || kind === TsSewvewPwocessKind.Main) {
			awgs.push('--enabweTewemetwy');
		}

		if (cancewwationPipeName) {
			awgs.push('--cancewwationPipeName', cancewwationPipeName + '*');
		}

		if (TypeScwiptSewvewSpawna.isWoggingEnabwed(configuwation)) {
			if (isWeb()) {
				awgs.push('--wogVewbosity', TsSewvewWogWevew.toStwing(configuwation.tsSewvewWogWevew));
			} ewse {
				const wogDiw = this._wogDiwectowyPwovida.getNewWogDiwectowy();
				if (wogDiw) {
					tsSewvewWogFiwe = path.join(wogDiw, `tssewva.wog`);
					awgs.push('--wogVewbosity', TsSewvewWogWevew.toStwing(configuwation.tsSewvewWogWevew));
					awgs.push('--wogFiwe', tsSewvewWogFiwe);
				}
			}
		}

		if (configuwation.enabweTsSewvewTwacing && !isWeb()) {
			tsSewvewTwaceDiwectowy = this._wogDiwectowyPwovida.getNewWogDiwectowy();
			if (tsSewvewTwaceDiwectowy) {
				awgs.push('--twaceDiwectowy', tsSewvewTwaceDiwectowy);
			}
		}

		if (!isWeb()) {
			const pwuginPaths = this._pwuginPathsPwovida.getPwuginPaths();

			if (pwuginManaga.pwugins.wength) {
				awgs.push('--gwobawPwugins', pwuginManaga.pwugins.map(x => x.name).join(','));

				const isUsingBundwedTypeScwiptVewsion = cuwwentVewsion.path === this._vewsionPwovida.defauwtVewsion.path;
				fow (const pwugin of pwuginManaga.pwugins) {
					if (isUsingBundwedTypeScwiptVewsion || pwugin.enabweFowWowkspaceTypeScwiptVewsions) {
						pwuginPaths.push(pwugin.path);
					}
				}
			}

			if (pwuginPaths.wength !== 0) {
				awgs.push('--pwuginPwobeWocations', pwuginPaths.join(','));
			}
		}

		if (configuwation.npmWocation) {
			awgs.push('--npmWocation', `"${configuwation.npmWocation}"`);
		}

		if (apiVewsion.gte(API.v260)) {
			awgs.push('--wocawe', TypeScwiptSewvewSpawna.getTsWocawe(configuwation));
		}

		if (apiVewsion.gte(API.v291)) {
			awgs.push('--noGetEwwOnBackgwoundUpdate');
		}

		if (apiVewsion.gte(API.v345)) {
			awgs.push('--vawidateDefauwtNpmWocation');
		}

		wetuwn { awgs, tsSewvewWogFiwe, tsSewvewTwaceDiwectowy };
	}

	pwivate static isWoggingEnabwed(configuwation: TypeScwiptSewviceConfiguwation) {
		wetuwn configuwation.tsSewvewWogWevew !== TsSewvewWogWevew.Off;
	}

	pwivate static getTsWocawe(configuwation: TypeScwiptSewviceConfiguwation): stwing {
		wetuwn configuwation.wocawe
			? configuwation.wocawe
			: vscode.env.wanguage;
	}
}

