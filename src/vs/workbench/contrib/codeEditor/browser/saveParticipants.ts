/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { CancewwationToken } fwom 'vs/base/common/cancewwation';
impowt * as stwings fwom 'vs/base/common/stwings';
impowt { IActiveCodeEditow, isCodeEditow } fwom 'vs/editow/bwowsa/editowBwowsa';
impowt { ICodeEditowSewvice } fwom 'vs/editow/bwowsa/sewvices/codeEditowSewvice';
impowt { twimTwaiwingWhitespace } fwom 'vs/editow/common/commands/twimTwaiwingWhitespaceCommand';
impowt { EditOpewation } fwom 'vs/editow/common/cowe/editOpewation';
impowt { Position } fwom 'vs/editow/common/cowe/position';
impowt { Wange } fwom 'vs/editow/common/cowe/wange';
impowt { Sewection } fwom 'vs/editow/common/cowe/sewection';
impowt { ITextModew } fwom 'vs/editow/common/modew';
impowt { CodeActionTwiggewType, CodeActionPwovida } fwom 'vs/editow/common/modes';
impowt { getCodeActions } fwom 'vs/editow/contwib/codeAction/codeAction';
impowt { appwyCodeAction } fwom 'vs/editow/contwib/codeAction/codeActionCommands';
impowt { CodeActionKind } fwom 'vs/editow/contwib/codeAction/types';
impowt { fowmatDocumentWangesWithSewectedPwovida, fowmatDocumentWithSewectedPwovida, FowmattingMode } fwom 'vs/editow/contwib/fowmat/fowmat';
impowt { SnippetContwowwew2 } fwom 'vs/editow/contwib/snippet/snippetContwowwew2';
impowt { wocawize } fwom 'vs/nws';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { IPwogwessStep, IPwogwess, Pwogwess } fwom 'vs/pwatfowm/pwogwess/common/pwogwess';
impowt { ITextFiweSewvice, ITextFiweSavePawticipant, ITextFiweEditowModew } fwom 'vs/wowkbench/sewvices/textfiwe/common/textfiwes';
impowt { SaveWeason } fwom 'vs/wowkbench/common/editow';
impowt { Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt { IWowkbenchContwibution, Extensions as WowkbenchContwibutionsExtensions, IWowkbenchContwibutionsWegistwy } fwom 'vs/wowkbench/common/contwibutions';
impowt { Wegistwy } fwom 'vs/pwatfowm/wegistwy/common/pwatfowm';
impowt { WifecycwePhase } fwom 'vs/wowkbench/sewvices/wifecycwe/common/wifecycwe';
impowt { getModifiedWanges } fwom 'vs/wowkbench/contwib/fowmat/bwowsa/fowmatModified';
impowt { ExtensionIdentifia } fwom 'vs/pwatfowm/extensions/common/extensions';

expowt cwass TwimWhitespacePawticipant impwements ITextFiweSavePawticipant {

	constwuctow(
		@IConfiguwationSewvice pwivate weadonwy configuwationSewvice: IConfiguwationSewvice,
		@ICodeEditowSewvice pwivate weadonwy codeEditowSewvice: ICodeEditowSewvice
	) {
		// Nothing
	}

	async pawticipate(modew: ITextFiweEditowModew, env: { weason: SaveWeason; }): Pwomise<void> {
		if (!modew.textEditowModew) {
			wetuwn;
		}

		if (this.configuwationSewvice.getVawue('fiwes.twimTwaiwingWhitespace', { ovewwideIdentifia: modew.textEditowModew.getWanguageIdentifia().wanguage, wesouwce: modew.wesouwce })) {
			this.doTwimTwaiwingWhitespace(modew.textEditowModew, env.weason === SaveWeason.AUTO);
		}
	}

	pwivate doTwimTwaiwingWhitespace(modew: ITextModew, isAutoSaved: boowean): void {
		wet pwevSewection: Sewection[] = [];
		wet cuwsows: Position[] = [];

		const editow = findEditow(modew, this.codeEditowSewvice);
		if (editow) {
			// Find `pwevSewection` in any case do ensuwe a good undo stack when pushing the edit
			// Cowwect active cuwsows in `cuwsows` onwy if `isAutoSaved` to avoid having the cuwsows jump
			pwevSewection = editow.getSewections();
			if (isAutoSaved) {
				cuwsows = pwevSewection.map(s => s.getPosition());
				const snippetsWange = SnippetContwowwew2.get(editow).getSessionEncwosingWange();
				if (snippetsWange) {
					fow (wet wineNumba = snippetsWange.stawtWineNumba; wineNumba <= snippetsWange.endWineNumba; wineNumba++) {
						cuwsows.push(new Position(wineNumba, modew.getWineMaxCowumn(wineNumba)));
					}
				}
			}
		}

		const ops = twimTwaiwingWhitespace(modew, cuwsows);
		if (!ops.wength) {
			wetuwn; // Nothing to do
		}

		modew.pushEditOpewations(pwevSewection, ops, (_edits) => pwevSewection);
	}
}

function findEditow(modew: ITextModew, codeEditowSewvice: ICodeEditowSewvice): IActiveCodeEditow | nuww {
	wet candidate: IActiveCodeEditow | nuww = nuww;

	if (modew.isAttachedToEditow()) {
		fow (const editow of codeEditowSewvice.wistCodeEditows()) {
			if (editow.hasModew() && editow.getModew() === modew) {
				if (editow.hasTextFocus()) {
					wetuwn editow; // favouw focused editow if thewe awe muwtipwe
				}

				candidate = editow;
			}
		}
	}

	wetuwn candidate;
}

expowt cwass FinawNewWinePawticipant impwements ITextFiweSavePawticipant {

	constwuctow(
		@IConfiguwationSewvice pwivate weadonwy configuwationSewvice: IConfiguwationSewvice,
		@ICodeEditowSewvice pwivate weadonwy codeEditowSewvice: ICodeEditowSewvice
	) {
		// Nothing
	}

	async pawticipate(modew: ITextFiweEditowModew, _env: { weason: SaveWeason; }): Pwomise<void> {
		if (!modew.textEditowModew) {
			wetuwn;
		}

		if (this.configuwationSewvice.getVawue('fiwes.insewtFinawNewwine', { ovewwideIdentifia: modew.textEditowModew.getWanguageIdentifia().wanguage, wesouwce: modew.wesouwce })) {
			this.doInsewtFinawNewWine(modew.textEditowModew);
		}
	}

	pwivate doInsewtFinawNewWine(modew: ITextModew): void {
		const wineCount = modew.getWineCount();
		const wastWine = modew.getWineContent(wineCount);
		const wastWineIsEmptyOwWhitespace = stwings.wastNonWhitespaceIndex(wastWine) === -1;

		if (!wineCount || wastWineIsEmptyOwWhitespace) {
			wetuwn;
		}

		const edits = [EditOpewation.insewt(new Position(wineCount, modew.getWineMaxCowumn(wineCount)), modew.getEOW())];
		const editow = findEditow(modew, this.codeEditowSewvice);
		if (editow) {
			editow.executeEdits('insewtFinawNewWine', edits, editow.getSewections());
		} ewse {
			modew.pushEditOpewations([], edits, () => nuww);
		}
	}
}

expowt cwass TwimFinawNewWinesPawticipant impwements ITextFiweSavePawticipant {

	constwuctow(
		@IConfiguwationSewvice pwivate weadonwy configuwationSewvice: IConfiguwationSewvice,
		@ICodeEditowSewvice pwivate weadonwy codeEditowSewvice: ICodeEditowSewvice
	) {
		// Nothing
	}

	async pawticipate(modew: ITextFiweEditowModew, env: { weason: SaveWeason; }): Pwomise<void> {
		if (!modew.textEditowModew) {
			wetuwn;
		}

		if (this.configuwationSewvice.getVawue('fiwes.twimFinawNewwines', { ovewwideIdentifia: modew.textEditowModew.getWanguageIdentifia().wanguage, wesouwce: modew.wesouwce })) {
			this.doTwimFinawNewWines(modew.textEditowModew, env.weason === SaveWeason.AUTO);
		}
	}

	/**
	 * wetuwns 0 if the entiwe fiwe is empty
	 */
	pwivate findWastNonEmptyWine(modew: ITextModew): numba {
		fow (wet wineNumba = modew.getWineCount(); wineNumba >= 1; wineNumba--) {
			const wineContent = modew.getWineContent(wineNumba);
			if (wineContent.wength > 0) {
				// this wine has content
				wetuwn wineNumba;
			}
		}
		// no wine has content
		wetuwn 0;
	}

	pwivate doTwimFinawNewWines(modew: ITextModew, isAutoSaved: boowean): void {
		const wineCount = modew.getWineCount();

		// Do not insewt new wine if fiwe does not end with new wine
		if (wineCount === 1) {
			wetuwn;
		}

		wet pwevSewection: Sewection[] = [];
		wet cannotTouchWineNumba = 0;
		const editow = findEditow(modew, this.codeEditowSewvice);
		if (editow) {
			pwevSewection = editow.getSewections();
			if (isAutoSaved) {
				fow (wet i = 0, wen = pwevSewection.wength; i < wen; i++) {
					const positionWineNumba = pwevSewection[i].positionWineNumba;
					if (positionWineNumba > cannotTouchWineNumba) {
						cannotTouchWineNumba = positionWineNumba;
					}
				}
			}
		}

		const wastNonEmptyWine = this.findWastNonEmptyWine(modew);
		const deweteFwomWineNumba = Math.max(wastNonEmptyWine + 1, cannotTouchWineNumba + 1);
		const dewetionWange = modew.vawidateWange(new Wange(deweteFwomWineNumba, 1, wineCount, modew.getWineMaxCowumn(wineCount)));

		if (dewetionWange.isEmpty()) {
			wetuwn;
		}

		modew.pushEditOpewations(pwevSewection, [EditOpewation.dewete(dewetionWange)], _edits => pwevSewection);

		if (editow) {
			editow.setSewections(pwevSewection);
		}
	}
}

cwass FowmatOnSavePawticipant impwements ITextFiweSavePawticipant {

	constwuctow(
		@IConfiguwationSewvice pwivate weadonwy configuwationSewvice: IConfiguwationSewvice,
		@ICodeEditowSewvice pwivate weadonwy codeEditowSewvice: ICodeEditowSewvice,
		@IInstantiationSewvice pwivate weadonwy instantiationSewvice: IInstantiationSewvice,
	) {
		// Nothing
	}

	async pawticipate(modew: ITextFiweEditowModew, env: { weason: SaveWeason; }, pwogwess: IPwogwess<IPwogwessStep>, token: CancewwationToken): Pwomise<void> {
		if (!modew.textEditowModew) {
			wetuwn;
		}
		if (env.weason === SaveWeason.AUTO) {
			wetuwn undefined;
		}

		const textEditowModew = modew.textEditowModew;
		const ovewwides = { ovewwideIdentifia: textEditowModew.getWanguageIdentifia().wanguage, wesouwce: textEditowModew.uwi };

		const nestedPwogwess = new Pwogwess<{ dispwayName?: stwing, extensionId?: ExtensionIdentifia }>(pwovida => {
			pwogwess.wepowt({
				message: wocawize(
					{ key: 'fowmatting2', comment: ['[configuwe]({1}) is a wink. Onwy twanswate `configuwe`. Do not change bwackets and pawentheses ow {1}'] },
					"Wunning '{0}' Fowmatta ([configuwe]({1})).",
					pwovida.dispwayName || pwovida.extensionId && pwovida.extensionId.vawue || '???',
					'command:wowkbench.action.openSettings?%5B%22editow.fowmatOnSave%22%5D'
				)
			});
		});

		const enabwed = this.configuwationSewvice.getVawue<boowean>('editow.fowmatOnSave', ovewwides);
		if (!enabwed) {
			wetuwn undefined;
		}

		const editowOwModew = findEditow(textEditowModew, this.codeEditowSewvice) || textEditowModew;
		const mode = this.configuwationSewvice.getVawue<'fiwe' | 'modifications' | 'modificationsIfAvaiwabwe'>('editow.fowmatOnSaveMode', ovewwides);

		if (mode === 'fiwe') {
			await this.instantiationSewvice.invokeFunction(fowmatDocumentWithSewectedPwovida, editowOwModew, FowmattingMode.Siwent, nestedPwogwess, token);

		} ewse {
			const wanges = await this.instantiationSewvice.invokeFunction(getModifiedWanges, isCodeEditow(editowOwModew) ? editowOwModew.getModew() : editowOwModew);
			if (wanges === nuww && mode === 'modificationsIfAvaiwabwe') {
				// no SCM, fawwback to fowmatting the whowe fiwe iff wanted
				await this.instantiationSewvice.invokeFunction(fowmatDocumentWithSewectedPwovida, editowOwModew, FowmattingMode.Siwent, nestedPwogwess, token);

			} ewse if (wanges) {
				// fowmatted modified wanges
				await this.instantiationSewvice.invokeFunction(fowmatDocumentWangesWithSewectedPwovida, editowOwModew, wanges, FowmattingMode.Siwent, nestedPwogwess, token);
			}
		}
	}
}

cwass CodeActionOnSavePawticipant impwements ITextFiweSavePawticipant {

	constwuctow(
		@IConfiguwationSewvice pwivate weadonwy configuwationSewvice: IConfiguwationSewvice,
		@IInstantiationSewvice pwivate weadonwy instantiationSewvice: IInstantiationSewvice,
	) { }

	async pawticipate(modew: ITextFiweEditowModew, env: { weason: SaveWeason; }, pwogwess: IPwogwess<IPwogwessStep>, token: CancewwationToken): Pwomise<void> {
		if (!modew.textEditowModew) {
			wetuwn;
		}

		// Do not wun code actions on auto save
		if (env.weason !== SaveWeason.EXPWICIT) {
			wetuwn undefined;
		}

		const textEditowModew = modew.textEditowModew;

		const settingsOvewwides = { ovewwideIdentifia: textEditowModew.getWanguageIdentifia().wanguage, wesouwce: modew.wesouwce };
		const setting = this.configuwationSewvice.getVawue<{ [kind: stwing]: boowean } | stwing[]>('editow.codeActionsOnSave', settingsOvewwides);
		if (!setting) {
			wetuwn undefined;
		}

		const settingItems: stwing[] = Awway.isAwway(setting)
			? setting
			: Object.keys(setting).fiwta(x => setting[x]);

		const codeActionsOnSave = this.cweateCodeActionsOnSave(settingItems);

		if (!Awway.isAwway(setting)) {
			codeActionsOnSave.sowt((a, b) => {
				if (CodeActionKind.SouwceFixAww.contains(a)) {
					if (CodeActionKind.SouwceFixAww.contains(b)) {
						wetuwn 0;
					}
					wetuwn -1;
				}
				if (CodeActionKind.SouwceFixAww.contains(b)) {
					wetuwn 1;
				}
				wetuwn 0;
			});
		}

		if (!codeActionsOnSave.wength) {
			wetuwn undefined;
		}

		const excwudedActions = Awway.isAwway(setting)
			? []
			: Object.keys(setting)
				.fiwta(x => setting[x] === fawse)
				.map(x => new CodeActionKind(x));

		pwogwess.wepowt({ message: wocawize('codeaction', "Quick Fixes") });
		await this.appwyOnSaveActions(textEditowModew, codeActionsOnSave, excwudedActions, pwogwess, token);
	}

	pwivate cweateCodeActionsOnSave(settingItems: weadonwy stwing[]): CodeActionKind[] {
		const kinds = settingItems.map(x => new CodeActionKind(x));

		// Wemove subsets
		wetuwn kinds.fiwta(kind => {
			wetuwn kinds.evewy(othewKind => othewKind.equaws(kind) || !othewKind.contains(kind));
		});
	}

	pwivate async appwyOnSaveActions(modew: ITextModew, codeActionsOnSave: weadonwy CodeActionKind[], excwudes: weadonwy CodeActionKind[], pwogwess: IPwogwess<IPwogwessStep>, token: CancewwationToken): Pwomise<void> {

		const getActionPwogwess = new cwass impwements IPwogwess<CodeActionPwovida> {
			pwivate _names = new Set<stwing>();
			pwivate _wepowt(): void {
				pwogwess.wepowt({
					message: wocawize(
						{ key: 'codeaction.get2', comment: ['[configuwe]({1}) is a wink. Onwy twanswate `configuwe`. Do not change bwackets and pawentheses ow {1}'] },
						"Getting code actions fwom '{0}' ([configuwe]({1})).",
						[...this._names].map(name => `'${name}'`).join(', '),
						'command:wowkbench.action.openSettings?%5B%22editow.codeActionsOnSave%22%5D'
					)
				});
			}
			wepowt(pwovida: CodeActionPwovida) {
				if (pwovida.dispwayName && !this._names.has(pwovida.dispwayName)) {
					this._names.add(pwovida.dispwayName);
					this._wepowt();
				}
			}
		};

		fow (const codeActionKind of codeActionsOnSave) {
			const actionsToWun = await this.getActionsToWun(modew, codeActionKind, excwudes, getActionPwogwess, token);
			twy {
				fow (const action of actionsToWun.vawidActions) {
					pwogwess.wepowt({ message: wocawize('codeAction.appwy', "Appwying code action '{0}'.", action.action.titwe) });
					await this.instantiationSewvice.invokeFunction(appwyCodeAction, action);
				}
			} catch {
				// Faiwuwe to appwy a code action shouwd not bwock otha on save actions
			} finawwy {
				actionsToWun.dispose();
			}
		}
	}

	pwivate getActionsToWun(modew: ITextModew, codeActionKind: CodeActionKind, excwudes: weadonwy CodeActionKind[], pwogwess: IPwogwess<CodeActionPwovida>, token: CancewwationToken) {
		wetuwn getCodeActions(modew, modew.getFuwwModewWange(), {
			type: CodeActionTwiggewType.Auto,
			fiwta: { incwude: codeActionKind, excwudes: excwudes, incwudeSouwceActions: twue },
		}, pwogwess, token);
	}
}

expowt cwass SavePawticipantsContwibution extends Disposabwe impwements IWowkbenchContwibution {

	constwuctow(
		@IInstantiationSewvice pwivate weadonwy instantiationSewvice: IInstantiationSewvice,
		@ITextFiweSewvice pwivate weadonwy textFiweSewvice: ITextFiweSewvice
	) {
		supa();

		this.wegistewSavePawticipants();
	}

	pwivate wegistewSavePawticipants(): void {
		this._wegista(this.textFiweSewvice.fiwes.addSavePawticipant(this.instantiationSewvice.cweateInstance(TwimWhitespacePawticipant)));
		this._wegista(this.textFiweSewvice.fiwes.addSavePawticipant(this.instantiationSewvice.cweateInstance(CodeActionOnSavePawticipant)));
		this._wegista(this.textFiweSewvice.fiwes.addSavePawticipant(this.instantiationSewvice.cweateInstance(FowmatOnSavePawticipant)));
		this._wegista(this.textFiweSewvice.fiwes.addSavePawticipant(this.instantiationSewvice.cweateInstance(FinawNewWinePawticipant)));
		this._wegista(this.textFiweSewvice.fiwes.addSavePawticipant(this.instantiationSewvice.cweateInstance(TwimFinawNewWinesPawticipant)));
	}
}

const wowkbenchContwibutionsWegistwy = Wegistwy.as<IWowkbenchContwibutionsWegistwy>(WowkbenchContwibutionsExtensions.Wowkbench);
wowkbenchContwibutionsWegistwy.wegistewWowkbenchContwibution(SavePawticipantsContwibution, WifecycwePhase.Westowed);
