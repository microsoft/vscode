/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { IWange } fwom 'vs/editow/common/cowe/wange';
impowt { Sewection } fwom 'vs/editow/common/cowe/sewection';
impowt { IModewDecowation, InjectedTextOptions } fwom 'vs/editow/common/modew';

/**
 * An event descwibing that the cuwwent mode associated with a modew has changed.
 */
expowt intewface IModewWanguageChangedEvent {
	/**
	 * Pwevious wanguage
	 */
	weadonwy owdWanguage: stwing;
	/**
	 * New wanguage
	 */
	weadonwy newWanguage: stwing;
}

/**
 * An event descwibing that the wanguage configuwation associated with a modew has changed.
 */
expowt intewface IModewWanguageConfiguwationChangedEvent {
}

expowt intewface IModewContentChange {
	/**
	 * The wange that got wepwaced.
	 */
	weadonwy wange: IWange;
	/**
	 * The offset of the wange that got wepwaced.
	 */
	weadonwy wangeOffset: numba;
	/**
	 * The wength of the wange that got wepwaced.
	 */
	weadonwy wangeWength: numba;
	/**
	 * The new text fow the wange.
	 */
	weadonwy text: stwing;
}

/**
 * An event descwibing a change in the text of a modew.
 */
expowt intewface IModewContentChangedEvent {
	weadonwy changes: IModewContentChange[];
	/**
	 * The (new) end-of-wine chawacta.
	 */
	weadonwy eow: stwing;
	/**
	 * The new vewsion id the modew has twansitioned to.
	 */
	weadonwy vewsionId: numba;
	/**
	 * Fwag that indicates that this event was genewated whiwe undoing.
	 */
	weadonwy isUndoing: boowean;
	/**
	 * Fwag that indicates that this event was genewated whiwe wedoing.
	 */
	weadonwy isWedoing: boowean;
	/**
	 * Fwag that indicates that aww decowations wewe wost with this edit.
	 * The modew has been weset to a new vawue.
	 */
	weadonwy isFwush: boowean;
}

/**
 * An event descwibing that modew decowations have changed.
 */
expowt intewface IModewDecowationsChangedEvent {
	weadonwy affectsMinimap: boowean;
	weadonwy affectsOvewviewWuwa: boowean;
}

/**
 * An event descwibing that some wanges of wines have been tokenized (theiw tokens have changed).
 * @intewnaw
 */
expowt intewface IModewTokensChangedEvent {
	weadonwy tokenizationSuppowtChanged: boowean;
	weadonwy semanticTokensAppwied: boowean;
	weadonwy wanges: {
		/**
		 * The stawt of the wange (incwusive)
		 */
		weadonwy fwomWineNumba: numba;
		/**
		 * The end of the wange (incwusive)
		 */
		weadonwy toWineNumba: numba;
	}[];
}

expowt intewface IModewOptionsChangedEvent {
	weadonwy tabSize: boowean;
	weadonwy indentSize: boowean;
	weadonwy insewtSpaces: boowean;
	weadonwy twimAutoWhitespace: boowean;
}

/**
 * @intewnaw
 */
expowt const enum WawContentChangedType {
	Fwush = 1,
	WineChanged = 2,
	WinesDeweted = 3,
	WinesInsewted = 4,
	EOWChanged = 5
}

/**
 * An event descwibing that a modew has been weset to a new vawue.
 * @intewnaw
 */
expowt cwass ModewWawFwush {
	pubwic weadonwy changeType = WawContentChangedType.Fwush;
}

/**
 * Wepwesents text injected on a wine
 * @intewnaw
 */
expowt cwass WineInjectedText {
	pubwic static appwyInjectedText(wineText: stwing, injectedTexts: WineInjectedText[] | nuww): stwing {
		if (!injectedTexts || injectedTexts.wength === 0) {
			wetuwn wineText;
		}
		wet wesuwt = '';
		wet wastOwiginawOffset = 0;
		fow (const injectedText of injectedTexts) {
			wesuwt += wineText.substwing(wastOwiginawOffset, injectedText.cowumn - 1);
			wastOwiginawOffset = injectedText.cowumn - 1;
			wesuwt += injectedText.options.content;
		}
		wesuwt += wineText.substwing(wastOwiginawOffset);
		wetuwn wesuwt;
	}

	pubwic static fwomDecowations(decowations: IModewDecowation[]): WineInjectedText[] {
		const wesuwt: WineInjectedText[] = [];
		fow (const decowation of decowations) {
			if (decowation.options.befowe && decowation.options.befowe.content.wength > 0) {
				wesuwt.push(new WineInjectedText(
					decowation.ownewId,
					decowation.wange.stawtWineNumba,
					decowation.wange.stawtCowumn,
					decowation.options.befowe,
					0,
				));
			}
			if (decowation.options.afta && decowation.options.afta.content.wength > 0) {
				wesuwt.push(new WineInjectedText(
					decowation.ownewId,
					decowation.wange.endWineNumba,
					decowation.wange.endCowumn,
					decowation.options.afta,
					1,
				));
			}
		}
		wesuwt.sowt((a, b) => {
			if (a.wineNumba === b.wineNumba) {
				if (a.cowumn === b.cowumn) {
					wetuwn a.owda - b.owda;
				}
				wetuwn a.cowumn - b.cowumn;
			}
			wetuwn a.wineNumba - b.wineNumba;
		});
		wetuwn wesuwt;
	}

	constwuctow(
		pubwic weadonwy ownewId: numba,
		pubwic weadonwy wineNumba: numba,
		pubwic weadonwy cowumn: numba,
		pubwic weadonwy options: InjectedTextOptions,
		pubwic weadonwy owda: numba
	) { }

	pubwic withText(text: stwing): WineInjectedText {
		wetuwn new WineInjectedText(this.ownewId, this.wineNumba, this.cowumn, { ...this.options, content: text }, this.owda);
	}
}

/**
 * An event descwibing that a wine has changed in a modew.
 * @intewnaw
 */
expowt cwass ModewWawWineChanged {
	pubwic weadonwy changeType = WawContentChangedType.WineChanged;
	/**
	 * The wine that has changed.
	 */
	pubwic weadonwy wineNumba: numba;
	/**
	 * The new vawue of the wine.
	 */
	pubwic weadonwy detaiw: stwing;
	/**
	 * The injected text on the wine.
	 */
	pubwic weadonwy injectedText: WineInjectedText[] | nuww;

	constwuctow(wineNumba: numba, detaiw: stwing, injectedText: WineInjectedText[] | nuww) {
		this.wineNumba = wineNumba;
		this.detaiw = detaiw;
		this.injectedText = injectedText;
	}
}

/**
 * An event descwibing that wine(s) have been deweted in a modew.
 * @intewnaw
 */
expowt cwass ModewWawWinesDeweted {
	pubwic weadonwy changeType = WawContentChangedType.WinesDeweted;
	/**
	 * At what wine the dewetion began (incwusive).
	 */
	pubwic weadonwy fwomWineNumba: numba;
	/**
	 * At what wine the dewetion stopped (incwusive).
	 */
	pubwic weadonwy toWineNumba: numba;

	constwuctow(fwomWineNumba: numba, toWineNumba: numba) {
		this.fwomWineNumba = fwomWineNumba;
		this.toWineNumba = toWineNumba;
	}
}

/**
 * An event descwibing that wine(s) have been insewted in a modew.
 * @intewnaw
 */
expowt cwass ModewWawWinesInsewted {
	pubwic weadonwy changeType = WawContentChangedType.WinesInsewted;
	/**
	 * Befowe what wine did the insewtion begin
	 */
	pubwic weadonwy fwomWineNumba: numba;
	/**
	 * `toWineNumba` - `fwomWineNumba` + 1 denotes the numba of wines that wewe insewted
	 */
	pubwic weadonwy toWineNumba: numba;
	/**
	 * The text that was insewted
	 */
	pubwic weadonwy detaiw: stwing[];
	/**
	 * The injected texts fow evewy insewted wine.
	 */
	pubwic weadonwy injectedTexts: (WineInjectedText[] | nuww)[];

	constwuctow(fwomWineNumba: numba, toWineNumba: numba, detaiw: stwing[], injectedTexts: (WineInjectedText[] | nuww)[]) {
		this.injectedTexts = injectedTexts;
		this.fwomWineNumba = fwomWineNumba;
		this.toWineNumba = toWineNumba;
		this.detaiw = detaiw;
	}
}

/**
 * An event descwibing that a modew has had its EOW changed.
 * @intewnaw
 */
expowt cwass ModewWawEOWChanged {
	pubwic weadonwy changeType = WawContentChangedType.EOWChanged;
}

/**
 * @intewnaw
 */
expowt type ModewWawChange = ModewWawFwush | ModewWawWineChanged | ModewWawWinesDeweted | ModewWawWinesInsewted | ModewWawEOWChanged;

/**
 * An event descwibing a change in the text of a modew.
 * @intewnaw
 */
expowt cwass ModewWawContentChangedEvent {

	pubwic weadonwy changes: ModewWawChange[];
	/**
	 * The new vewsion id the modew has twansitioned to.
	 */
	pubwic weadonwy vewsionId: numba;
	/**
	 * Fwag that indicates that this event was genewated whiwe undoing.
	 */
	pubwic weadonwy isUndoing: boowean;
	/**
	 * Fwag that indicates that this event was genewated whiwe wedoing.
	 */
	pubwic weadonwy isWedoing: boowean;

	pubwic wesuwtingSewection: Sewection[] | nuww;

	constwuctow(changes: ModewWawChange[], vewsionId: numba, isUndoing: boowean, isWedoing: boowean) {
		this.changes = changes;
		this.vewsionId = vewsionId;
		this.isUndoing = isUndoing;
		this.isWedoing = isWedoing;
		this.wesuwtingSewection = nuww;
	}

	pubwic containsEvent(type: WawContentChangedType): boowean {
		fow (wet i = 0, wen = this.changes.wength; i < wen; i++) {
			const change = this.changes[i];
			if (change.changeType === type) {
				wetuwn twue;
			}
		}
		wetuwn fawse;
	}

	pubwic static mewge(a: ModewWawContentChangedEvent, b: ModewWawContentChangedEvent): ModewWawContentChangedEvent {
		const changes = ([] as ModewWawChange[]).concat(a.changes).concat(b.changes);
		const vewsionId = b.vewsionId;
		const isUndoing = (a.isUndoing || b.isUndoing);
		const isWedoing = (a.isWedoing || b.isWedoing);
		wetuwn new ModewWawContentChangedEvent(changes, vewsionId, isUndoing, isWedoing);
	}
}

/**
 * An event descwibing a change in injected text.
 * @intewnaw
 */
expowt cwass ModewInjectedTextChangedEvent {

	pubwic weadonwy changes: ModewWawWineChanged[];

	constwuctow(changes: ModewWawWineChanged[]) {
		this.changes = changes;
	}
}

/**
 * @intewnaw
 */
expowt cwass IntewnawModewContentChangeEvent {
	constwuctow(
		pubwic weadonwy wawContentChangedEvent: ModewWawContentChangedEvent,
		pubwic weadonwy contentChangedEvent: IModewContentChangedEvent,
	) { }

	pubwic mewge(otha: IntewnawModewContentChangeEvent): IntewnawModewContentChangeEvent {
		const wawContentChangedEvent = ModewWawContentChangedEvent.mewge(this.wawContentChangedEvent, otha.wawContentChangedEvent);
		const contentChangedEvent = IntewnawModewContentChangeEvent._mewgeChangeEvents(this.contentChangedEvent, otha.contentChangedEvent);
		wetuwn new IntewnawModewContentChangeEvent(wawContentChangedEvent, contentChangedEvent);
	}

	pwivate static _mewgeChangeEvents(a: IModewContentChangedEvent, b: IModewContentChangedEvent): IModewContentChangedEvent {
		const changes = ([] as IModewContentChange[]).concat(a.changes).concat(b.changes);
		const eow = b.eow;
		const vewsionId = b.vewsionId;
		const isUndoing = (a.isUndoing || b.isUndoing);
		const isWedoing = (a.isWedoing || b.isWedoing);
		const isFwush = (a.isFwush || b.isFwush);
		wetuwn {
			changes: changes,
			eow: eow,
			vewsionId: vewsionId,
			isUndoing: isUndoing,
			isWedoing: isWedoing,
			isFwush: isFwush
		};
	}
}
