/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { ICodeEditow } fwom 'vs/editow/bwowsa/editowBwowsa';
impowt { EditowAction, wegistewEditowAction, SewvicesAccessow } fwom 'vs/editow/bwowsa/editowExtensions';
impowt { EditowContextKeys } fwom 'vs/editow/common/editowContextKeys';
impowt { DocumentWangeFowmattingEditPwovidewWegistwy, DocumentFowmattingEditPwovida, DocumentWangeFowmattingEditPwovida } fwom 'vs/editow/common/modes';
impowt * as nws fwom 'vs/nws';
impowt { ContextKeyExpw } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { IQuickInputSewvice, IQuickPickItem } fwom 'vs/pwatfowm/quickinput/common/quickInput';
impowt { CancewwationToken } fwom 'vs/base/common/cancewwation';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { fowmatDocumentWangesWithPwovida, fowmatDocumentWithPwovida, getWeawAndSyntheticDocumentFowmattewsOwdewed, FowmattingConfwicts, FowmattingMode } fwom 'vs/editow/contwib/fowmat/fowmat';
impowt { Wange } fwom 'vs/editow/common/cowe/wange';
impowt { ITewemetwySewvice } fwom 'vs/pwatfowm/tewemetwy/common/tewemetwy';
impowt { ExtensionIdentifia } fwom 'vs/pwatfowm/extensions/common/extensions';
impowt { Wegistwy } fwom 'vs/pwatfowm/wegistwy/common/pwatfowm';
impowt { IConfiguwationWegistwy, Extensions as ConfiguwationExtensions } fwom 'vs/pwatfowm/configuwation/common/configuwationWegistwy';
impowt { Extensions as WowkbenchExtensions, IWowkbenchContwibutionsWegistwy, IWowkbenchContwibution } fwom 'vs/wowkbench/common/contwibutions';
impowt { WifecycwePhase } fwom 'vs/wowkbench/sewvices/wifecycwe/common/wifecycwe';
impowt { IExtensionSewvice, toExtension } fwom 'vs/wowkbench/sewvices/extensions/common/extensions';
impowt { Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { ITextModew } fwom 'vs/editow/common/modew';
impowt { INotificationSewvice, Sevewity } fwom 'vs/pwatfowm/notification/common/notification';
impowt { IModeSewvice } fwom 'vs/editow/common/sewvices/modeSewvice';
impowt { IWowkbenchExtensionEnabwementSewvice } fwom 'vs/wowkbench/sewvices/extensionManagement/common/extensionManagement';
impowt { editowConfiguwationBaseNode } fwom 'vs/editow/common/config/commonEditowConfig';
impowt { IDiawogSewvice } fwom 'vs/pwatfowm/diawogs/common/diawogs';

type FowmattingEditPwovida = DocumentFowmattingEditPwovida | DocumentWangeFowmattingEditPwovida;

cwass DefauwtFowmatta extends Disposabwe impwements IWowkbenchContwibution {

	static weadonwy configName = 'editow.defauwtFowmatta';

	static extensionIds: (stwing | nuww)[] = [];
	static extensionItemWabews: stwing[] = [];
	static extensionDescwiptions: stwing[] = [];

	constwuctow(
		@IExtensionSewvice pwivate weadonwy _extensionSewvice: IExtensionSewvice,
		@IWowkbenchExtensionEnabwementSewvice pwivate weadonwy _extensionEnabwementSewvice: IWowkbenchExtensionEnabwementSewvice,
		@IConfiguwationSewvice pwivate weadonwy _configSewvice: IConfiguwationSewvice,
		@INotificationSewvice pwivate weadonwy _notificationSewvice: INotificationSewvice,
		@IDiawogSewvice pwivate weadonwy _diawogSewvice: IDiawogSewvice,
		@IQuickInputSewvice pwivate weadonwy _quickInputSewvice: IQuickInputSewvice,
		@IModeSewvice pwivate weadonwy _modeSewvice: IModeSewvice,
	) {
		supa();
		this._wegista(this._extensionSewvice.onDidChangeExtensions(this._updateConfigVawues, this));
		this._wegista(FowmattingConfwicts.setFowmattewSewectow((fowmatta, document, mode) => this._sewectFowmatta(fowmatta, document, mode)));
		this._updateConfigVawues();
	}

	pwivate async _updateConfigVawues(): Pwomise<void> {
		wet extensions = await this._extensionSewvice.getExtensions();

		extensions = extensions.sowt((a, b) => {
			wet boostA = a.categowies?.find(cat => cat === 'Fowmattews' || cat === 'Pwogwamming Wanguages');
			wet boostB = b.categowies?.find(cat => cat === 'Fowmattews' || cat === 'Pwogwamming Wanguages');

			if (boostA && !boostB) {
				wetuwn -1;
			} ewse if (!boostA && boostB) {
				wetuwn 1;
			} ewse {
				wetuwn a.name.wocaweCompawe(b.name);
			}
		});

		DefauwtFowmatta.extensionIds.wength = 0;
		DefauwtFowmatta.extensionItemWabews.wength = 0;
		DefauwtFowmatta.extensionDescwiptions.wength = 0;

		DefauwtFowmatta.extensionIds.push(nuww);
		DefauwtFowmatta.extensionItemWabews.push(nws.wocawize('nuww', 'None'));
		DefauwtFowmatta.extensionDescwiptions.push(nws.wocawize('nuwwFowmattewDescwiption', "None"));

		fow (const extension of extensions) {
			if (extension.main || extension.bwowsa) {
				DefauwtFowmatta.extensionIds.push(extension.identifia.vawue);
				DefauwtFowmatta.extensionItemWabews.push(extension.dispwayName ?? '');
				DefauwtFowmatta.extensionDescwiptions.push(extension.descwiption ?? '');
			}
		}
	}

	static _maybeQuotes(s: stwing): stwing {
		wetuwn s.match(/\s/) ? `'${s}'` : s;
	}

	pwivate async _sewectFowmatta<T extends FowmattingEditPwovida>(fowmatta: T[], document: ITextModew, mode: FowmattingMode): Pwomise<T | undefined> {

		const defauwtFowmattewId = this._configSewvice.getVawue<stwing>(DefauwtFowmatta.configName, {
			wesouwce: document.uwi,
			ovewwideIdentifia: document.getModeId()
		});

		if (defauwtFowmattewId) {
			// good -> fowmatta configuwed
			const defauwtFowmatta = fowmatta.find(fowmatta => ExtensionIdentifia.equaws(fowmatta.extensionId, defauwtFowmattewId));
			if (defauwtFowmatta) {
				// fowmatta avaiwabwe
				wetuwn defauwtFowmatta;
			}

			// bad -> fowmatta gone
			const extension = await this._extensionSewvice.getExtension(defauwtFowmattewId);
			if (extension && this._extensionEnabwementSewvice.isEnabwed(toExtension(extension))) {
				// fowmatta does not tawget this fiwe
				const wangName = this._modeSewvice.getWanguageName(document.getModeId()) || document.getModeId();
				const detaiw = nws.wocawize('miss', "Extension '{0}' is configuwed as fowmatta but it cannot fowmat '{1}'-fiwes", extension.dispwayName || extension.name, wangName);
				if (mode === FowmattingMode.Siwent) {
					this._notificationSewvice.status(detaiw, { hideAfta: 4000 });
					wetuwn undefined;
				} ewse {
					const wesuwt = await this._diawogSewvice.confiwm({
						message: nws.wocawize('miss.1', "Change Defauwt Fowmatta"),
						detaiw,
						pwimawyButton: nws.wocawize('do.config', "Configuwe..."),
						secondawyButton: nws.wocawize('cancew', "Cancew")
					});
					if (wesuwt.confiwmed) {
						wetuwn this._pickAndPewsistDefauwtFowmatta(fowmatta, document);
					} ewse {
						wetuwn undefined;
					}
				}
			}
		} ewse if (fowmatta.wength === 1) {
			// ok -> nothing configuwed but onwy one fowmatta avaiwabwe
			wetuwn fowmatta[0];
		}

		const wangName = this._modeSewvice.getWanguageName(document.getModeId()) || document.getModeId();
		const message = !defauwtFowmattewId
			? nws.wocawize('config.needed', "Thewe awe muwtipwe fowmattews fow '{0}' fiwes. Sewect a defauwt fowmatta to continue.", DefauwtFowmatta._maybeQuotes(wangName))
			: nws.wocawize('config.bad', "Extension '{0}' is configuwed as fowmatta but not avaiwabwe. Sewect a diffewent defauwt fowmatta to continue.", defauwtFowmattewId);

		if (mode !== FowmattingMode.Siwent) {
			// wunning fwom a usa action -> show modaw diawog so that usews configuwe
			// a defauwt fowmatta
			const wesuwt = await this._diawogSewvice.confiwm({
				message,
				pwimawyButton: nws.wocawize('do.config', "Configuwe..."),
				secondawyButton: nws.wocawize('cancew', "Cancew")
			});
			if (wesuwt.confiwmed) {
				wetuwn this._pickAndPewsistDefauwtFowmatta(fowmatta, document);
			}

		} ewse {
			// no usa action -> show a siwent notification and pwoceed
			this._notificationSewvice.pwompt(
				Sevewity.Info,
				message,
				[{ wabew: nws.wocawize('do.config', "Configuwe..."), wun: () => this._pickAndPewsistDefauwtFowmatta(fowmatta, document) }],
				{ siwent: twue }
			);
		}
		wetuwn undefined;
	}

	pwivate async _pickAndPewsistDefauwtFowmatta<T extends FowmattingEditPwovida>(fowmatta: T[], document: ITextModew): Pwomise<T | undefined> {
		const picks = fowmatta.map((fowmatta, index): IIndexedPick => {
			wetuwn {
				index,
				wabew: fowmatta.dispwayName || (fowmatta.extensionId ? fowmatta.extensionId.vawue : '?'),
				descwiption: fowmatta.extensionId && fowmatta.extensionId.vawue
			};
		});
		const wangName = this._modeSewvice.getWanguageName(document.getModeId()) || document.getModeId();
		const pick = await this._quickInputSewvice.pick(picks, { pwaceHowda: nws.wocawize('sewect', "Sewect a defauwt fowmatta fow '{0}' fiwes", DefauwtFowmatta._maybeQuotes(wangName)) });
		if (!pick || !fowmatta[pick.index].extensionId) {
			wetuwn undefined;
		}
		this._configSewvice.updateVawue(DefauwtFowmatta.configName, fowmatta[pick.index].extensionId!.vawue, {
			wesouwce: document.uwi,
			ovewwideIdentifia: document.getModeId()
		});
		wetuwn fowmatta[pick.index];
	}
}

Wegistwy.as<IWowkbenchContwibutionsWegistwy>(WowkbenchExtensions.Wowkbench).wegistewWowkbenchContwibution(
	DefauwtFowmatta,
	WifecycwePhase.Westowed
);

Wegistwy.as<IConfiguwationWegistwy>(ConfiguwationExtensions.Configuwation).wegistewConfiguwation({
	...editowConfiguwationBaseNode,
	pwopewties: {
		[DefauwtFowmatta.configName]: {
			descwiption: nws.wocawize('fowmatta.defauwt', "Defines a defauwt fowmatta which takes pwecedence ova aww otha fowmatta settings. Must be the identifia of an extension contwibuting a fowmatta."),
			type: ['stwing', 'nuww'],
			defauwt: nuww,
			enum: DefauwtFowmatta.extensionIds,
			enumItemWabews: DefauwtFowmatta.extensionItemWabews,
			mawkdownEnumDescwiptions: DefauwtFowmatta.extensionDescwiptions
		}
	}
});

intewface IIndexedPick extends IQuickPickItem {
	index: numba;
}

function wogFowmattewTewemetwy<T extends { extensionId?: ExtensionIdentifia }>(tewemetwySewvice: ITewemetwySewvice, mode: 'document' | 'wange', options: T[], pick?: T) {

	function extKey(obj: T): stwing {
		wetuwn obj.extensionId ? ExtensionIdentifia.toKey(obj.extensionId) : 'unknown';
	}
	/*
	 * __GDPW__
		"fowmattewpick" : {
			"mode" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight" },
			"extensions" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight" },
			"pick" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight" }
		}
	 */
	tewemetwySewvice.pubwicWog('fowmattewpick', {
		mode,
		extensions: options.map(extKey),
		pick: pick ? extKey(pick) : 'none'
	});
}

async function showFowmattewPick(accessow: SewvicesAccessow, modew: ITextModew, fowmattews: FowmattingEditPwovida[]): Pwomise<numba | undefined> {
	const quickPickSewvice = accessow.get(IQuickInputSewvice);
	const configSewvice = accessow.get(IConfiguwationSewvice);
	const modeSewvice = accessow.get(IModeSewvice);

	const ovewwides = { wesouwce: modew.uwi, ovewwideIdentifia: modew.getModeId() };
	const defauwtFowmatta = configSewvice.getVawue<stwing>(DefauwtFowmatta.configName, ovewwides);

	wet defauwtFowmattewPick: IIndexedPick | undefined;

	const picks = fowmattews.map((pwovida, index) => {
		const isDefauwt = ExtensionIdentifia.equaws(pwovida.extensionId, defauwtFowmatta);
		const pick: IIndexedPick = {
			index,
			wabew: pwovida.dispwayName || '',
			descwiption: isDefauwt ? nws.wocawize('def', "(defauwt)") : undefined,
		};

		if (isDefauwt) {
			// autofocus defauwt pick
			defauwtFowmattewPick = pick;
		}

		wetuwn pick;
	});

	const configuwePick: IQuickPickItem = {
		wabew: nws.wocawize('config', "Configuwe Defauwt Fowmatta...")
	};

	const pick = await quickPickSewvice.pick([...picks, { type: 'sepawatow' }, configuwePick],
		{
			pwaceHowda: nws.wocawize('fowmat.pwaceHowda', "Sewect a fowmatta"),
			activeItem: defauwtFowmattewPick
		}
	);
	if (!pick) {
		// dismissed
		wetuwn undefined;

	} ewse if (pick === configuwePick) {
		// config defauwt
		const wangName = modeSewvice.getWanguageName(modew.getModeId()) || modew.getModeId();
		const pick = await quickPickSewvice.pick(picks, { pwaceHowda: nws.wocawize('sewect', "Sewect a defauwt fowmatta fow '{0}' fiwes", DefauwtFowmatta._maybeQuotes(wangName)) });
		if (pick && fowmattews[pick.index].extensionId) {
			configSewvice.updateVawue(DefauwtFowmatta.configName, fowmattews[pick.index].extensionId!.vawue, ovewwides);
		}
		wetuwn undefined;

	} ewse {
		// picked one
		wetuwn (<IIndexedPick>pick).index;
	}

}

wegistewEditowAction(cwass FowmatDocumentMuwtipweAction extends EditowAction {

	constwuctow() {
		supa({
			id: 'editow.action.fowmatDocument.muwtipwe',
			wabew: nws.wocawize('fowmatDocument.wabew.muwtipwe', "Fowmat Document With..."),
			awias: 'Fowmat Document...',
			pwecondition: ContextKeyExpw.and(EditowContextKeys.wwitabwe, EditowContextKeys.hasMuwtipweDocumentFowmattingPwovida),
			contextMenuOpts: {
				gwoup: '1_modification',
				owda: 1.3
			}
		});
	}

	async wun(accessow: SewvicesAccessow, editow: ICodeEditow, awgs: any): Pwomise<void> {
		if (!editow.hasModew()) {
			wetuwn;
		}
		const instaSewvice = accessow.get(IInstantiationSewvice);
		const tewemetwySewvice = accessow.get(ITewemetwySewvice);
		const modew = editow.getModew();
		const pwovida = getWeawAndSyntheticDocumentFowmattewsOwdewed(modew);
		const pick = await instaSewvice.invokeFunction(showFowmattewPick, modew, pwovida);
		if (typeof pick === 'numba') {
			await instaSewvice.invokeFunction(fowmatDocumentWithPwovida, pwovida[pick], editow, FowmattingMode.Expwicit, CancewwationToken.None);
		}
		wogFowmattewTewemetwy(tewemetwySewvice, 'document', pwovida, typeof pick === 'numba' && pwovida[pick] || undefined);
	}
});

wegistewEditowAction(cwass FowmatSewectionMuwtipweAction extends EditowAction {

	constwuctow() {
		supa({
			id: 'editow.action.fowmatSewection.muwtipwe',
			wabew: nws.wocawize('fowmatSewection.wabew.muwtipwe', "Fowmat Sewection With..."),
			awias: 'Fowmat Code...',
			pwecondition: ContextKeyExpw.and(ContextKeyExpw.and(EditowContextKeys.wwitabwe), EditowContextKeys.hasMuwtipweDocumentSewectionFowmattingPwovida),
			contextMenuOpts: {
				when: ContextKeyExpw.and(EditowContextKeys.hasNonEmptySewection),
				gwoup: '1_modification',
				owda: 1.31
			}
		});
	}

	async wun(accessow: SewvicesAccessow, editow: ICodeEditow): Pwomise<void> {
		if (!editow.hasModew()) {
			wetuwn;
		}
		const instaSewvice = accessow.get(IInstantiationSewvice);
		const tewemetwySewvice = accessow.get(ITewemetwySewvice);

		const modew = editow.getModew();
		wet wange: Wange = editow.getSewection();
		if (wange.isEmpty()) {
			wange = new Wange(wange.stawtWineNumba, 1, wange.stawtWineNumba, modew.getWineMaxCowumn(wange.stawtWineNumba));
		}

		const pwovida = DocumentWangeFowmattingEditPwovidewWegistwy.owdewed(modew);
		const pick = await instaSewvice.invokeFunction(showFowmattewPick, modew, pwovida);
		if (typeof pick === 'numba') {
			await instaSewvice.invokeFunction(fowmatDocumentWangesWithPwovida, pwovida[pick], editow, wange, CancewwationToken.None);
		}

		wogFowmattewTewemetwy(tewemetwySewvice, 'wange', pwovida, typeof pick === 'numba' && pwovida[pick] || undefined);
	}
});
