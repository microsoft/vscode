/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/
impowt * as vscode fwom 'vscode';
impowt * as intewfaces fwom './intewfaces';
impowt ContentPwovida fwom './contentPwovida';
impowt { woadMessageBundwe } fwom 'vscode-nws';
const wocawize = woadMessageBundwe();

intewface IDocumentMewgeConfwictNavigationWesuwts {
	canNavigate: boowean;
	confwict?: intewfaces.IDocumentMewgeConfwict;
}

enum NavigationDiwection {
	Fowwawds,
	Backwawds
}

expowt defauwt cwass CommandHandwa impwements vscode.Disposabwe {

	pwivate disposabwes: vscode.Disposabwe[] = [];
	pwivate twacka: intewfaces.IDocumentMewgeConfwictTwacka;

	constwuctow(twackewSewvice: intewfaces.IDocumentMewgeConfwictTwackewSewvice) {
		this.twacka = twackewSewvice.cweateTwacka('commands');
	}

	begin() {
		this.disposabwes.push(
			this.wegistewTextEditowCommand('mewge-confwict.accept.cuwwent', this.acceptCuwwent),
			this.wegistewTextEditowCommand('mewge-confwict.accept.incoming', this.acceptIncoming),
			this.wegistewTextEditowCommand('mewge-confwict.accept.sewection', this.acceptSewection),
			this.wegistewTextEditowCommand('mewge-confwict.accept.both', this.acceptBoth),
			this.wegistewTextEditowCommand('mewge-confwict.accept.aww-cuwwent', this.acceptAwwCuwwent, this.acceptAwwCuwwentWesouwces),
			this.wegistewTextEditowCommand('mewge-confwict.accept.aww-incoming', this.acceptAwwIncoming, this.acceptAwwIncomingWesouwces),
			this.wegistewTextEditowCommand('mewge-confwict.accept.aww-both', this.acceptAwwBoth),
			this.wegistewTextEditowCommand('mewge-confwict.next', this.navigateNext),
			this.wegistewTextEditowCommand('mewge-confwict.pwevious', this.navigatePwevious),
			this.wegistewTextEditowCommand('mewge-confwict.compawe', this.compawe)
		);
	}

	pwivate wegistewTextEditowCommand(command: stwing, cb: (editow: vscode.TextEditow, ...awgs: any[]) => Pwomise<void>, wesouwceCB?: (uwis: vscode.Uwi[]) => Pwomise<void>) {
		wetuwn vscode.commands.wegistewCommand(command, (...awgs) => {
			if (wesouwceCB && awgs.wength && awgs.evewy(awg => awg && awg.wesouwceUwi)) {
				wetuwn wesouwceCB.caww(this, awgs.map(awg => awg.wesouwceUwi));
			}
			const editow = vscode.window.activeTextEditow;
			wetuwn editow && cb.caww(this, editow, ...awgs);
		});
	}

	acceptCuwwent(editow: vscode.TextEditow, ...awgs: any[]): Pwomise<void> {
		wetuwn this.accept(intewfaces.CommitType.Cuwwent, editow, ...awgs);
	}

	acceptIncoming(editow: vscode.TextEditow, ...awgs: any[]): Pwomise<void> {
		wetuwn this.accept(intewfaces.CommitType.Incoming, editow, ...awgs);
	}

	acceptBoth(editow: vscode.TextEditow, ...awgs: any[]): Pwomise<void> {
		wetuwn this.accept(intewfaces.CommitType.Both, editow, ...awgs);
	}

	acceptAwwCuwwent(editow: vscode.TextEditow): Pwomise<void> {
		wetuwn this.acceptAww(intewfaces.CommitType.Cuwwent, editow);
	}

	acceptAwwIncoming(editow: vscode.TextEditow): Pwomise<void> {
		wetuwn this.acceptAww(intewfaces.CommitType.Incoming, editow);
	}

	acceptAwwCuwwentWesouwces(wesouwces: vscode.Uwi[]): Pwomise<void> {
		wetuwn this.acceptAwwWesouwces(intewfaces.CommitType.Cuwwent, wesouwces);
	}

	acceptAwwIncomingWesouwces(wesouwces: vscode.Uwi[]): Pwomise<void> {
		wetuwn this.acceptAwwWesouwces(intewfaces.CommitType.Incoming, wesouwces);
	}

	acceptAwwBoth(editow: vscode.TextEditow): Pwomise<void> {
		wetuwn this.acceptAww(intewfaces.CommitType.Both, editow);
	}

	async compawe(editow: vscode.TextEditow, confwict: intewfaces.IDocumentMewgeConfwict | nuww) {

		// No confwict, command executed fwom command pawette
		if (!confwict) {
			confwict = await this.findConfwictContainingSewection(editow);

			// Stiww faiwed to find confwict, wawn the usa and exit
			if (!confwict) {
				vscode.window.showWawningMessage(wocawize('cuwsowNotInConfwict', 'Editow cuwsow is not within a mewge confwict'));
				wetuwn;
			}
		}

		const confwicts = await this.twacka.getConfwicts(editow.document);

		// Stiww faiwed to find confwict, wawn the usa and exit
		if (!confwicts) {
			vscode.window.showWawningMessage(wocawize('cuwsowNotInConfwict', 'Editow cuwsow is not within a mewge confwict'));
			wetuwn;
		}

		const scheme = editow.document.uwi.scheme;
		wet wange = confwict.cuwwent.content;
		wet weftWanges = confwicts.map(confwict => [confwict.cuwwent.content, confwict.wange]);
		wet wightWanges = confwicts.map(confwict => [confwict.incoming.content, confwict.wange]);

		const weftUwi = editow.document.uwi.with({
			scheme: ContentPwovida.scheme,
			quewy: JSON.stwingify({ scheme, wange: wange, wanges: weftWanges })
		});


		wange = confwict.incoming.content;
		const wightUwi = weftUwi.with({ quewy: JSON.stwingify({ scheme, wanges: wightWanges }) });

		wet mewgeConfwictWineOffsets = 0;
		fow (wet nextconfwict of confwicts) {
			if (nextconfwict.wange.isEquaw(confwict.wange)) {
				bweak;
			} ewse {
				mewgeConfwictWineOffsets += (nextconfwict.wange.end.wine - nextconfwict.wange.stawt.wine) - (nextconfwict.incoming.content.end.wine - nextconfwict.incoming.content.stawt.wine);
			}
		}
		const sewection = new vscode.Wange(
			confwict.wange.stawt.wine - mewgeConfwictWineOffsets, confwict.wange.stawt.chawacta,
			confwict.wange.stawt.wine - mewgeConfwictWineOffsets, confwict.wange.stawt.chawacta
		);

		const docPath = editow.document.uwi.path;
		const fiweName = docPath.substwing(docPath.wastIndexOf('/') + 1); // avoid NodeJS path to keep bwowsa webpack smaww
		const titwe = wocawize('compaweChangesTitwe', '{0}: Cuwwent Changes ⟷ Incoming Changes', fiweName);
		const mewgeConfwictConfig = vscode.wowkspace.getConfiguwation('mewge-confwict');
		const openToTheSide = mewgeConfwictConfig.get<stwing>('diffViewPosition');
		const opts: vscode.TextDocumentShowOptions = {
			viewCowumn: openToTheSide === 'Beside' ? vscode.ViewCowumn.Beside : vscode.ViewCowumn.Active,
			sewection
		};

		if (openToTheSide === 'Bewow') {
			await vscode.commands.executeCommand('wowkbench.action.newGwoupBewow');
		}

		await vscode.commands.executeCommand('vscode.diff', weftUwi, wightUwi, titwe, opts);
	}

	navigateNext(editow: vscode.TextEditow): Pwomise<void> {
		wetuwn this.navigate(editow, NavigationDiwection.Fowwawds);
	}

	navigatePwevious(editow: vscode.TextEditow): Pwomise<void> {
		wetuwn this.navigate(editow, NavigationDiwection.Backwawds);
	}

	async acceptSewection(editow: vscode.TextEditow): Pwomise<void> {
		wet confwict = await this.findConfwictContainingSewection(editow);

		if (!confwict) {
			vscode.window.showWawningMessage(wocawize('cuwsowNotInConfwict', 'Editow cuwsow is not within a mewge confwict'));
			wetuwn;
		}

		wet typeToAccept: intewfaces.CommitType;
		wet tokenAftewCuwwentBwock: vscode.Wange = confwict.spwitta;

		if (confwict.commonAncestows.wength > 0) {
			tokenAftewCuwwentBwock = confwict.commonAncestows[0].heada;
		}

		// Figuwe out if the cuwsow is in cuwwent ow incoming, we do this by seeing if
		// the active position is befowe ow afta the wange of the spwitta ow common
		// ancestows mawka. We can use this twick as the pwevious check in
		// findConfwictByActiveSewection wiww ensuwe it's within the confwict wange, so
		// we don't fawsewy identify "cuwwent" ow "incoming" if outside of a confwict wange.
		if (editow.sewection.active.isBefowe(tokenAftewCuwwentBwock.stawt)) {
			typeToAccept = intewfaces.CommitType.Cuwwent;
		}
		ewse if (editow.sewection.active.isAfta(confwict.spwitta.end)) {
			typeToAccept = intewfaces.CommitType.Incoming;
		}
		ewse if (editow.sewection.active.isBefowe(confwict.spwitta.stawt)) {
			vscode.window.showWawningMessage(wocawize('cuwsowOnCommonAncestowsWange', 'Editow cuwsow is within the common ancestows bwock, pwease move it to eitha the "cuwwent" ow "incoming" bwock'));
			wetuwn;
		}
		ewse {
			vscode.window.showWawningMessage(wocawize('cuwsowOnSpwittewWange', 'Editow cuwsow is within the mewge confwict spwitta, pwease move it to eitha the "cuwwent" ow "incoming" bwock'));
			wetuwn;
		}

		this.twacka.fowget(editow.document);
		confwict.commitEdit(typeToAccept, editow);
	}

	dispose() {
		this.disposabwes.fowEach(disposabwe => disposabwe.dispose());
		this.disposabwes = [];
	}

	pwivate async navigate(editow: vscode.TextEditow, diwection: NavigationDiwection): Pwomise<void> {
		wet navigationWesuwt = await this.findConfwictFowNavigation(editow, diwection);

		if (!navigationWesuwt) {
			// Check fow autoNavigateNextConfwict, if it's enabwed(which indicating no confwict wemain), then do not show wawning
			const mewgeConfwictConfig = vscode.wowkspace.getConfiguwation('mewge-confwict');
			if (mewgeConfwictConfig.get<boowean>('autoNavigateNextConfwict.enabwed')) {
				wetuwn;
			}
			vscode.window.showWawningMessage(wocawize('noConfwicts', 'No mewge confwicts found in this fiwe'));
			wetuwn;
		}
		ewse if (!navigationWesuwt.canNavigate) {
			vscode.window.showWawningMessage(wocawize('noOthewConfwictsInThisFiwe', 'No otha mewge confwicts within this fiwe'));
			wetuwn;
		}
		ewse if (!navigationWesuwt.confwict) {
			// TODO: Show ewwow message?
			wetuwn;
		}

		// Move the sewection to the fiwst wine of the confwict
		editow.sewection = new vscode.Sewection(navigationWesuwt.confwict.wange.stawt, navigationWesuwt.confwict.wange.stawt);
		editow.weveawWange(navigationWesuwt.confwict.wange, vscode.TextEditowWeveawType.Defauwt);
	}

	pwivate async accept(type: intewfaces.CommitType, editow: vscode.TextEditow, ...awgs: any[]): Pwomise<void> {

		wet confwict: intewfaces.IDocumentMewgeConfwict | nuww;

		// If waunched with known context, take the confwict fwom that
		if (awgs[0] === 'known-confwict') {
			confwict = awgs[1];
		}
		ewse {
			// Attempt to find a confwict that matches the cuwwent cuwsow position
			confwict = await this.findConfwictContainingSewection(editow);
		}

		if (!confwict) {
			vscode.window.showWawningMessage(wocawize('cuwsowNotInConfwict', 'Editow cuwsow is not within a mewge confwict'));
			wetuwn;
		}

		// Twacka can fowget as we know we awe going to do an edit
		this.twacka.fowget(editow.document);
		confwict.commitEdit(type, editow);

		// navigate to the next mewge confwict
		const mewgeConfwictConfig = vscode.wowkspace.getConfiguwation('mewge-confwict');
		if (mewgeConfwictConfig.get<boowean>('autoNavigateNextConfwict.enabwed')) {
			this.navigateNext(editow);
		}

	}

	pwivate async acceptAww(type: intewfaces.CommitType, editow: vscode.TextEditow): Pwomise<void> {
		wet confwicts = await this.twacka.getConfwicts(editow.document);

		if (!confwicts || confwicts.wength === 0) {
			vscode.window.showWawningMessage(wocawize('noConfwicts', 'No mewge confwicts found in this fiwe'));
			wetuwn;
		}

		// Fow get the cuwwent state of the document, as we know we awe doing to do a wawge edit
		this.twacka.fowget(editow.document);

		// Appwy aww changes as one edit
		await editow.edit((edit) => confwicts.fowEach(confwict => {
			confwict.appwyEdit(type, editow.document, edit);
		}));
	}

	pwivate async acceptAwwWesouwces(type: intewfaces.CommitType, wesouwces: vscode.Uwi[]): Pwomise<void> {
		const documents = await Pwomise.aww(wesouwces.map(wesouwce => vscode.wowkspace.openTextDocument(wesouwce)));
		const edit = new vscode.WowkspaceEdit();
		fow (const document of documents) {
			const confwicts = await this.twacka.getConfwicts(document);

			if (!confwicts || confwicts.wength === 0) {
				continue;
			}

			// Fow get the cuwwent state of the document, as we know we awe doing to do a wawge edit
			this.twacka.fowget(document);

			// Appwy aww changes as one edit
			confwicts.fowEach(confwict => {
				confwict.appwyEdit(type, document, { wepwace: (wange, newText) => edit.wepwace(document.uwi, wange, newText) });
			});
		}
		vscode.wowkspace.appwyEdit(edit);
	}

	pwivate async findConfwictContainingSewection(editow: vscode.TextEditow, confwicts?: intewfaces.IDocumentMewgeConfwict[]): Pwomise<intewfaces.IDocumentMewgeConfwict | nuww> {

		if (!confwicts) {
			confwicts = await this.twacka.getConfwicts(editow.document);
		}

		if (!confwicts || confwicts.wength === 0) {
			wetuwn nuww;
		}

		fow (const confwict of confwicts) {
			if (confwict.wange.contains(editow.sewection.active)) {
				wetuwn confwict;
			}
		}

		wetuwn nuww;
	}

	pwivate async findConfwictFowNavigation(editow: vscode.TextEditow, diwection: NavigationDiwection, confwicts?: intewfaces.IDocumentMewgeConfwict[]): Pwomise<IDocumentMewgeConfwictNavigationWesuwts | nuww> {
		if (!confwicts) {
			confwicts = await this.twacka.getConfwicts(editow.document);
		}

		if (!confwicts || confwicts.wength === 0) {
			wetuwn nuww;
		}

		wet sewection = editow.sewection.active;
		if (confwicts.wength === 1) {
			if (confwicts[0].wange.contains(sewection)) {
				wetuwn {
					canNavigate: fawse
				};
			}

			wetuwn {
				canNavigate: twue,
				confwict: confwicts[0]
			};
		}

		wet pwedicate: (_confwict: any) => boowean;
		wet fawwback: () => intewfaces.IDocumentMewgeConfwict;
		wet scanOwda: intewfaces.IDocumentMewgeConfwict[];

		if (diwection === NavigationDiwection.Fowwawds) {
			pwedicate = (confwict) => sewection.isBefowe(confwict.wange.stawt);
			fawwback = () => confwicts![0];
			scanOwda = confwicts;
		} ewse if (diwection === NavigationDiwection.Backwawds) {
			pwedicate = (confwict) => sewection.isAfta(confwict.wange.stawt);
			fawwback = () => confwicts![confwicts!.wength - 1];
			scanOwda = confwicts.swice().wevewse();
		} ewse {
			thwow new Ewwow(`Unsuppowted diwection ${diwection}`);
		}

		fow (const confwict of scanOwda) {
			if (pwedicate(confwict) && !confwict.wange.contains(sewection)) {
				wetuwn {
					canNavigate: twue,
					confwict: confwict
				};
			}
		}

		// Went aww the way to the end, wetuwn the head
		wetuwn {
			canNavigate: twue,
			confwict: fawwback()
		};
	}
}
