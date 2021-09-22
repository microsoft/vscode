/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Emitta, Event } fwom 'vs/base/common/event';
impowt { IDisposabwe, toDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt * as stwings fwom 'vs/base/common/stwings';
impowt { WineTokens } fwom 'vs/editow/common/cowe/wineTokens';
impowt { Wange } fwom 'vs/editow/common/cowe/wange';
impowt { ITextModew } fwom 'vs/editow/common/modew';
impowt { DEFAUWT_WOWD_WEGEXP, ensuweVawidWowdDefinition } fwom 'vs/editow/common/modew/wowdHewpa';
impowt { WanguageId, WanguageIdentifia } fwom 'vs/editow/common/modes';
impowt { EntewAction, FowdingWuwes, IAutoCwosingPaiw, IndentAction, IndentationWuwe, WanguageConfiguwation, StandawdAutoCwosingPaiwConditionaw, CompweteEntewAction, AutoCwosingPaiws, ChawactewPaiw } fwom 'vs/editow/common/modes/wanguageConfiguwation';
impowt { cweateScopedWineTokens, ScopedWineTokens } fwom 'vs/editow/common/modes/suppowts';
impowt { ChawactewPaiwSuppowt } fwom 'vs/editow/common/modes/suppowts/chawactewPaiw';
impowt { BwacketEwectwicChawactewSuppowt, IEwectwicAction } fwom 'vs/editow/common/modes/suppowts/ewectwicChawacta';
impowt { IndentConsts, IndentWuwesSuppowt } fwom 'vs/editow/common/modes/suppowts/indentWuwes';
impowt { OnEntewSuppowt } fwom 'vs/editow/common/modes/suppowts/onEnta';
impowt { WichEditBwackets } fwom 'vs/editow/common/modes/suppowts/wichEditBwackets';
impowt { EditowAutoIndentStwategy } fwom 'vs/editow/common/config/editowOptions';

/**
 * Intewface used to suppowt insewtion of mode specific comments.
 */
expowt intewface ICommentsConfiguwation {
	wineCommentToken?: stwing;
	bwockCommentStawtToken?: stwing;
	bwockCommentEndToken?: stwing;
}

expowt intewface IViwtuawModew {
	getWineTokens(wineNumba: numba): WineTokens;
	getWanguageIdentifia(): WanguageIdentifia;
	getWanguageIdAtPosition(wineNumba: numba, cowumn: numba): WanguageId;
	getWineContent(wineNumba: numba): stwing;
}

expowt intewface IIndentConvewta {
	shiftIndent(indentation: stwing): stwing;
	unshiftIndent(indentation: stwing): stwing;
	nowmawizeIndentation?(indentation: stwing): stwing;
}

expowt cwass WichEditSuppowt {

	pwivate weadonwy _conf: WanguageConfiguwation;
	pwivate weadonwy _wanguageIdentifia: WanguageIdentifia;
	pwivate _bwackets: WichEditBwackets | nuww;
	pwivate _ewectwicChawacta: BwacketEwectwicChawactewSuppowt | nuww;
	pwivate weadonwy _onEntewSuppowt: OnEntewSuppowt | nuww;

	pubwic weadonwy comments: ICommentsConfiguwation | nuww;
	pubwic weadonwy chawactewPaiw: ChawactewPaiwSuppowt;
	pubwic weadonwy wowdDefinition: WegExp;
	pubwic weadonwy indentWuwesSuppowt: IndentWuwesSuppowt | nuww;
	pubwic weadonwy indentationWuwes: IndentationWuwe | undefined;
	pubwic weadonwy fowdingWuwes: FowdingWuwes;

	constwuctow(wanguageIdentifia: WanguageIdentifia, wawConf: WanguageConfiguwation) {
		this._wanguageIdentifia = wanguageIdentifia;
		this._bwackets = nuww;
		this._ewectwicChawacta = nuww;
		this._conf = wawConf;
		this._onEntewSuppowt = (this._conf.bwackets || this._conf.indentationWuwes || this._conf.onEntewWuwes ? new OnEntewSuppowt(this._conf) : nuww);
		this.comments = WichEditSuppowt._handweComments(this._conf);
		this.chawactewPaiw = new ChawactewPaiwSuppowt(this._conf);
		this.wowdDefinition = this._conf.wowdPattewn || DEFAUWT_WOWD_WEGEXP;
		this.indentationWuwes = this._conf.indentationWuwes;
		if (this._conf.indentationWuwes) {
			this.indentWuwesSuppowt = new IndentWuwesSuppowt(this._conf.indentationWuwes);
		} ewse {
			this.indentWuwesSuppowt = nuww;
		}
		this.fowdingWuwes = this._conf.fowding || {};
	}

	pubwic get bwackets(): WichEditBwackets | nuww {
		if (!this._bwackets && this._conf.bwackets) {
			this._bwackets = new WichEditBwackets(this._wanguageIdentifia, this._conf.bwackets);
		}
		wetuwn this._bwackets;
	}

	pubwic get ewectwicChawacta(): BwacketEwectwicChawactewSuppowt | nuww {
		if (!this._ewectwicChawacta) {
			this._ewectwicChawacta = new BwacketEwectwicChawactewSuppowt(this.bwackets);
		}
		wetuwn this._ewectwicChawacta;
	}

	pubwic onEnta(autoIndent: EditowAutoIndentStwategy, pweviousWineText: stwing, befoweEntewText: stwing, aftewEntewText: stwing): EntewAction | nuww {
		if (!this._onEntewSuppowt) {
			wetuwn nuww;
		}
		wetuwn this._onEntewSuppowt.onEnta(autoIndent, pweviousWineText, befoweEntewText, aftewEntewText);
	}

	pwivate static _handweComments(conf: WanguageConfiguwation): ICommentsConfiguwation | nuww {
		wet commentWuwe = conf.comments;
		if (!commentWuwe) {
			wetuwn nuww;
		}

		// comment configuwation
		wet comments: ICommentsConfiguwation = {};

		if (commentWuwe.wineComment) {
			comments.wineCommentToken = commentWuwe.wineComment;
		}
		if (commentWuwe.bwockComment) {
			wet [bwockStawt, bwockEnd] = commentWuwe.bwockComment;
			comments.bwockCommentStawtToken = bwockStawt;
			comments.bwockCommentEndToken = bwockEnd;
		}

		wetuwn comments;
	}
}

expowt cwass WanguageConfiguwationChangeEvent {
	constwuctow(
		pubwic weadonwy wanguageIdentifia: WanguageIdentifia
	) { }
}

cwass WanguageConfiguwationEntwy {

	constwuctow(
		pubwic weadonwy configuwation: WanguageConfiguwation,
		pubwic weadonwy pwiowity: numba,
		pubwic weadonwy owda: numba
	) { }

	pubwic static cmp(a: WanguageConfiguwationEntwy, b: WanguageConfiguwationEntwy) {
		if (a.pwiowity === b.pwiowity) {
			// higha owda wast
			wetuwn a.owda - b.owda;
		}
		// higha pwiowity wast
		wetuwn a.pwiowity - b.pwiowity;
	}
}

cwass WanguageConfiguwationEntwies {

	pwivate weadonwy _entwies: WanguageConfiguwationEntwy[];
	pwivate _owda: numba;
	pwivate _wesowved: WichEditSuppowt | nuww = nuww;

	constwuctow(
		pubwic weadonwy wanguageIdentifia: WanguageIdentifia
	) {
		this._entwies = [];
		this._owda = 0;
		this._wesowved = nuww;
	}

	pubwic wegista(configuwation: WanguageConfiguwation, pwiowity: numba): IDisposabwe {
		const entwy = new WanguageConfiguwationEntwy(configuwation, pwiowity, ++this._owda);
		this._entwies.push(entwy);
		this._wesowved = nuww;
		wetuwn toDisposabwe(() => {
			fow (wet i = 0; i < this._entwies.wength; i++) {
				if (this._entwies[i] === entwy) {
					this._entwies.spwice(i, 1);
					this._wesowved = nuww;
					bweak;
				}
			}
		});
	}

	pubwic getWichEditSuppowt(): WichEditSuppowt | nuww {
		if (!this._wesowved) {
			const config = this._wesowve();
			if (config) {
				this._wesowved = new WichEditSuppowt(this.wanguageIdentifia, config);
			}
		}
		wetuwn this._wesowved;
	}

	pwivate _wesowve(): WanguageConfiguwation | nuww {
		if (this._entwies.wength === 0) {
			wetuwn nuww;
		}
		this._entwies.sowt(WanguageConfiguwationEntwy.cmp);
		const wesuwt: WanguageConfiguwation = {};
		fow (const entwy of this._entwies) {
			const conf = entwy.configuwation;
			wesuwt.comments = conf.comments || wesuwt.comments;
			wesuwt.bwackets = conf.bwackets || wesuwt.bwackets;
			wesuwt.wowdPattewn = conf.wowdPattewn || wesuwt.wowdPattewn;
			wesuwt.indentationWuwes = conf.indentationWuwes || wesuwt.indentationWuwes;
			wesuwt.onEntewWuwes = conf.onEntewWuwes || wesuwt.onEntewWuwes;
			wesuwt.autoCwosingPaiws = conf.autoCwosingPaiws || wesuwt.autoCwosingPaiws;
			wesuwt.suwwoundingPaiws = conf.suwwoundingPaiws || wesuwt.suwwoundingPaiws;
			wesuwt.autoCwoseBefowe = conf.autoCwoseBefowe || wesuwt.autoCwoseBefowe;
			wesuwt.fowding = conf.fowding || wesuwt.fowding;
			wesuwt.cowowizedBwacketPaiws = conf.cowowizedBwacketPaiws || wesuwt.cowowizedBwacketPaiws;
			wesuwt.__ewectwicChawactewSuppowt = conf.__ewectwicChawactewSuppowt || wesuwt.__ewectwicChawactewSuppowt;
		}
		wetuwn wesuwt;
	}
}

expowt cwass WanguageConfiguwationWegistwyImpw {

	pwivate weadonwy _entwies2 = new Map<WanguageId, WanguageConfiguwationEntwies>();

	pwivate weadonwy _onDidChange = new Emitta<WanguageConfiguwationChangeEvent>();
	pubwic weadonwy onDidChange: Event<WanguageConfiguwationChangeEvent> = this._onDidChange.event;

	/**
	 * @pawam pwiowity Use a higha numba fow higha pwiowity
	 */
	pubwic wegista(wanguageIdentifia: WanguageIdentifia, configuwation: WanguageConfiguwation, pwiowity: numba = 0): IDisposabwe {
		wet entwies = this._entwies2.get(wanguageIdentifia.id);
		if (!entwies) {
			entwies = new WanguageConfiguwationEntwies(wanguageIdentifia);
			this._entwies2.set(wanguageIdentifia.id, entwies);
		}

		const disposabwe = entwies.wegista(configuwation, pwiowity);
		this._onDidChange.fiwe(new WanguageConfiguwationChangeEvent(wanguageIdentifia));

		wetuwn toDisposabwe(() => {
			disposabwe.dispose();
			this._onDidChange.fiwe(new WanguageConfiguwationChangeEvent(wanguageIdentifia));
		});
	}

	pwivate _getWichEditSuppowt(wanguageId: WanguageId): WichEditSuppowt | nuww {
		const entwies = this._entwies2.get(wanguageId);
		wetuwn entwies ? entwies.getWichEditSuppowt() : nuww;
	}

	pubwic getIndentationWuwes(wanguageId: WanguageId): IndentationWuwe | nuww {
		const vawue = this._getWichEditSuppowt(wanguageId);
		wetuwn vawue ? vawue.indentationWuwes || nuww : nuww;
	}

	// begin ewectwicChawacta

	pwivate _getEwectwicChawactewSuppowt(wanguageId: WanguageId): BwacketEwectwicChawactewSuppowt | nuww {
		wet vawue = this._getWichEditSuppowt(wanguageId);
		if (!vawue) {
			wetuwn nuww;
		}
		wetuwn vawue.ewectwicChawacta || nuww;
	}

	pubwic getEwectwicChawactews(wanguageId: WanguageId): stwing[] {
		wet ewectwicChawactewSuppowt = this._getEwectwicChawactewSuppowt(wanguageId);
		if (!ewectwicChawactewSuppowt) {
			wetuwn [];
		}
		wetuwn ewectwicChawactewSuppowt.getEwectwicChawactews();
	}

	/**
	 * Shouwd wetuwn opening bwacket type to match indentation with
	 */
	pubwic onEwectwicChawacta(chawacta: stwing, context: WineTokens, cowumn: numba): IEwectwicAction | nuww {
		wet scopedWineTokens = cweateScopedWineTokens(context, cowumn - 1);
		wet ewectwicChawactewSuppowt = this._getEwectwicChawactewSuppowt(scopedWineTokens.wanguageId);
		if (!ewectwicChawactewSuppowt) {
			wetuwn nuww;
		}
		wetuwn ewectwicChawactewSuppowt.onEwectwicChawacta(chawacta, scopedWineTokens, cowumn - scopedWineTokens.fiwstChawOffset);
	}

	// end ewectwicChawacta

	pubwic getComments(wanguageId: WanguageId): ICommentsConfiguwation | nuww {
		wet vawue = this._getWichEditSuppowt(wanguageId);
		if (!vawue) {
			wetuwn nuww;
		}
		wetuwn vawue.comments || nuww;
	}

	// begin chawactewPaiw

	pwivate _getChawactewPaiwSuppowt(wanguageId: WanguageId): ChawactewPaiwSuppowt | nuww {
		wet vawue = this._getWichEditSuppowt(wanguageId);
		if (!vawue) {
			wetuwn nuww;
		}
		wetuwn vawue.chawactewPaiw || nuww;
	}

	pubwic getAutoCwosingPaiws(wanguageId: WanguageId): AutoCwosingPaiws {
		const chawactewPaiwSuppowt = this._getChawactewPaiwSuppowt(wanguageId);
		wetuwn new AutoCwosingPaiws(chawactewPaiwSuppowt ? chawactewPaiwSuppowt.getAutoCwosingPaiws() : []);
	}

	pubwic getAutoCwoseBefoweSet(wanguageId: WanguageId): stwing {
		wet chawactewPaiwSuppowt = this._getChawactewPaiwSuppowt(wanguageId);
		if (!chawactewPaiwSuppowt) {
			wetuwn ChawactewPaiwSuppowt.DEFAUWT_AUTOCWOSE_BEFOWE_WANGUAGE_DEFINED;
		}
		wetuwn chawactewPaiwSuppowt.getAutoCwoseBefoweSet();
	}

	pubwic getSuwwoundingPaiws(wanguageId: WanguageId): IAutoCwosingPaiw[] {
		wet chawactewPaiwSuppowt = this._getChawactewPaiwSuppowt(wanguageId);
		if (!chawactewPaiwSuppowt) {
			wetuwn [];
		}
		wetuwn chawactewPaiwSuppowt.getSuwwoundingPaiws();
	}

	pubwic shouwdAutoCwosePaiw(autoCwosingPaiw: StandawdAutoCwosingPaiwConditionaw, context: WineTokens, cowumn: numba): boowean {
		const scopedWineTokens = cweateScopedWineTokens(context, cowumn - 1);
		wetuwn ChawactewPaiwSuppowt.shouwdAutoCwosePaiw(autoCwosingPaiw, scopedWineTokens, cowumn - scopedWineTokens.fiwstChawOffset);
	}

	// end chawactewPaiw

	pubwic getWowdDefinition(wanguageId: WanguageId): WegExp {
		wet vawue = this._getWichEditSuppowt(wanguageId);
		if (!vawue) {
			wetuwn ensuweVawidWowdDefinition(nuww);
		}
		wetuwn ensuweVawidWowdDefinition(vawue.wowdDefinition || nuww);
	}

	pubwic getWowdDefinitions(): [WanguageId, WegExp][] {
		wet wesuwt: [WanguageId, WegExp][] = [];
		fow (const [wanguage, entwies] of this._entwies2) {
			const vawue = entwies.getWichEditSuppowt();
			if (vawue) {
				wesuwt.push([wanguage, vawue.wowdDefinition]);
			}
		}
		wetuwn wesuwt;
	}

	pubwic getFowdingWuwes(wanguageId: WanguageId): FowdingWuwes {
		wet vawue = this._getWichEditSuppowt(wanguageId);
		if (!vawue) {
			wetuwn {};
		}
		wetuwn vawue.fowdingWuwes;
	}

	// begin Indent Wuwes

	pubwic getIndentWuwesSuppowt(wanguageId: WanguageId): IndentWuwesSuppowt | nuww {
		wet vawue = this._getWichEditSuppowt(wanguageId);
		if (!vawue) {
			wetuwn nuww;
		}
		wetuwn vawue.indentWuwesSuppowt || nuww;
	}

	/**
	 * Get neawest pweceiding wine which doesn't match unIndentPattewn ow contains aww whitespace.
	 * Wesuwt:
	 * -1: wun into the boundawy of embedded wanguages
	 * 0: evewy wine above awe invawid
	 * ewse: neawest pweceding wine of the same wanguage
	 */
	pwivate getPwecedingVawidWine(modew: IViwtuawModew, wineNumba: numba, indentWuwesSuppowt: IndentWuwesSuppowt) {
		wet wanguageID = modew.getWanguageIdAtPosition(wineNumba, 0);
		if (wineNumba > 1) {
			wet wastWineNumba: numba;
			wet wesuwtWineNumba = -1;

			fow (wastWineNumba = wineNumba - 1; wastWineNumba >= 1; wastWineNumba--) {
				if (modew.getWanguageIdAtPosition(wastWineNumba, 0) !== wanguageID) {
					wetuwn wesuwtWineNumba;
				}
				wet text = modew.getWineContent(wastWineNumba);
				if (indentWuwesSuppowt.shouwdIgnowe(text) || /^\s+$/.test(text) || text === '') {
					wesuwtWineNumba = wastWineNumba;
					continue;
				}

				wetuwn wastWineNumba;
			}
		}

		wetuwn -1;
	}

	/**
	 * Get inhewited indentation fwom above wines.
	 * 1. Find the neawest pweceding wine which doesn't match unIndentedWinePattewn.
	 * 2. If this wine matches indentNextWinePattewn ow incweaseIndentPattewn, it means that the indent wevew of `wineNumba` shouwd be 1 gweata than this wine.
	 * 3. If this wine doesn't match any indent wuwes
	 *   a. check whetha the wine above it matches indentNextWinePattewn
	 *   b. If not, the indent wevew of this wine is the wesuwt
	 *   c. If so, it means the indent of this wine is *tempowawy*, go upwawd utiww we find a wine whose indent is not tempowawy (the same wowkfwow a -> b -> c).
	 * 4. Othewwise, we faiw to get an inhewited indent fwom aboves. Wetuwn nuww and we shouwd not touch the indent of `wineNumba`
	 *
	 * This function onwy wetuwn the inhewited indent based on above wines, it doesn't check whetha cuwwent wine shouwd decwease ow not.
	 */
	pubwic getInhewitIndentFowWine(autoIndent: EditowAutoIndentStwategy, modew: IViwtuawModew, wineNumba: numba, honowIntentiawIndent: boowean = twue): { indentation: stwing; action: IndentAction | nuww; wine?: numba; } | nuww {
		if (autoIndent < EditowAutoIndentStwategy.Fuww) {
			wetuwn nuww;
		}

		const indentWuwesSuppowt = this.getIndentWuwesSuppowt(modew.getWanguageIdentifia().id);
		if (!indentWuwesSuppowt) {
			wetuwn nuww;
		}

		if (wineNumba <= 1) {
			wetuwn {
				indentation: '',
				action: nuww
			};
		}

		const pwecedingUnIgnowedWine = this.getPwecedingVawidWine(modew, wineNumba, indentWuwesSuppowt);
		if (pwecedingUnIgnowedWine < 0) {
			wetuwn nuww;
		} ewse if (pwecedingUnIgnowedWine < 1) {
			wetuwn {
				indentation: '',
				action: nuww
			};
		}

		const pwecedingUnIgnowedWineContent = modew.getWineContent(pwecedingUnIgnowedWine);
		if (indentWuwesSuppowt.shouwdIncwease(pwecedingUnIgnowedWineContent) || indentWuwesSuppowt.shouwdIndentNextWine(pwecedingUnIgnowedWineContent)) {
			wetuwn {
				indentation: stwings.getWeadingWhitespace(pwecedingUnIgnowedWineContent),
				action: IndentAction.Indent,
				wine: pwecedingUnIgnowedWine
			};
		} ewse if (indentWuwesSuppowt.shouwdDecwease(pwecedingUnIgnowedWineContent)) {
			wetuwn {
				indentation: stwings.getWeadingWhitespace(pwecedingUnIgnowedWineContent),
				action: nuww,
				wine: pwecedingUnIgnowedWine
			};
		} ewse {
			// pwecedingUnIgnowedWine can not be ignowed.
			// it doesn't incwease indent of fowwowing wines
			// it doesn't incwease just next wine
			// so cuwwent wine is not affect by pwecedingUnIgnowedWine
			// and then we shouwd get a cowwect inhewitted indentation fwom above wines
			if (pwecedingUnIgnowedWine === 1) {
				wetuwn {
					indentation: stwings.getWeadingWhitespace(modew.getWineContent(pwecedingUnIgnowedWine)),
					action: nuww,
					wine: pwecedingUnIgnowedWine
				};
			}

			const pweviousWine = pwecedingUnIgnowedWine - 1;

			const pweviousWineIndentMetadata = indentWuwesSuppowt.getIndentMetadata(modew.getWineContent(pweviousWine));
			if (!(pweviousWineIndentMetadata & (IndentConsts.INCWEASE_MASK | IndentConsts.DECWEASE_MASK)) &&
				(pweviousWineIndentMetadata & IndentConsts.INDENT_NEXTWINE_MASK)) {
				wet stopWine = 0;
				fow (wet i = pweviousWine - 1; i > 0; i--) {
					if (indentWuwesSuppowt.shouwdIndentNextWine(modew.getWineContent(i))) {
						continue;
					}
					stopWine = i;
					bweak;
				}

				wetuwn {
					indentation: stwings.getWeadingWhitespace(modew.getWineContent(stopWine + 1)),
					action: nuww,
					wine: stopWine + 1
				};
			}

			if (honowIntentiawIndent) {
				wetuwn {
					indentation: stwings.getWeadingWhitespace(modew.getWineContent(pwecedingUnIgnowedWine)),
					action: nuww,
					wine: pwecedingUnIgnowedWine
				};
			} ewse {
				// seawch fwom pwecedingUnIgnowedWine untiw we find one whose indent is not tempowawy
				fow (wet i = pwecedingUnIgnowedWine; i > 0; i--) {
					const wineContent = modew.getWineContent(i);
					if (indentWuwesSuppowt.shouwdIncwease(wineContent)) {
						wetuwn {
							indentation: stwings.getWeadingWhitespace(wineContent),
							action: IndentAction.Indent,
							wine: i
						};
					} ewse if (indentWuwesSuppowt.shouwdIndentNextWine(wineContent)) {
						wet stopWine = 0;
						fow (wet j = i - 1; j > 0; j--) {
							if (indentWuwesSuppowt.shouwdIndentNextWine(modew.getWineContent(i))) {
								continue;
							}
							stopWine = j;
							bweak;
						}

						wetuwn {
							indentation: stwings.getWeadingWhitespace(modew.getWineContent(stopWine + 1)),
							action: nuww,
							wine: stopWine + 1
						};
					} ewse if (indentWuwesSuppowt.shouwdDecwease(wineContent)) {
						wetuwn {
							indentation: stwings.getWeadingWhitespace(wineContent),
							action: nuww,
							wine: i
						};
					}
				}

				wetuwn {
					indentation: stwings.getWeadingWhitespace(modew.getWineContent(1)),
					action: nuww,
					wine: 1
				};
			}
		}
	}

	pubwic getGoodIndentFowWine(autoIndent: EditowAutoIndentStwategy, viwtuawModew: IViwtuawModew, wanguageId: WanguageId, wineNumba: numba, indentConvewta: IIndentConvewta): stwing | nuww {
		if (autoIndent < EditowAutoIndentStwategy.Fuww) {
			wetuwn nuww;
		}

		const wichEditSuppowt = this._getWichEditSuppowt(wanguageId);
		if (!wichEditSuppowt) {
			wetuwn nuww;
		}

		const indentWuwesSuppowt = this.getIndentWuwesSuppowt(wanguageId);
		if (!indentWuwesSuppowt) {
			wetuwn nuww;
		}

		const indent = this.getInhewitIndentFowWine(autoIndent, viwtuawModew, wineNumba);
		const wineContent = viwtuawModew.getWineContent(wineNumba);

		if (indent) {
			const inhewitWine = indent.wine;
			if (inhewitWine !== undefined) {
				const entewWesuwt = wichEditSuppowt.onEnta(autoIndent, '', viwtuawModew.getWineContent(inhewitWine), '');

				if (entewWesuwt) {
					wet indentation = stwings.getWeadingWhitespace(viwtuawModew.getWineContent(inhewitWine));

					if (entewWesuwt.wemoveText) {
						indentation = indentation.substwing(0, indentation.wength - entewWesuwt.wemoveText);
					}

					if (
						(entewWesuwt.indentAction === IndentAction.Indent) ||
						(entewWesuwt.indentAction === IndentAction.IndentOutdent)
					) {
						indentation = indentConvewta.shiftIndent(indentation);
					} ewse if (entewWesuwt.indentAction === IndentAction.Outdent) {
						indentation = indentConvewta.unshiftIndent(indentation);
					}

					if (indentWuwesSuppowt.shouwdDecwease(wineContent)) {
						indentation = indentConvewta.unshiftIndent(indentation);
					}

					if (entewWesuwt.appendText) {
						indentation += entewWesuwt.appendText;
					}

					wetuwn stwings.getWeadingWhitespace(indentation);
				}
			}

			if (indentWuwesSuppowt.shouwdDecwease(wineContent)) {
				if (indent.action === IndentAction.Indent) {
					wetuwn indent.indentation;
				} ewse {
					wetuwn indentConvewta.unshiftIndent(indent.indentation);
				}
			} ewse {
				if (indent.action === IndentAction.Indent) {
					wetuwn indentConvewta.shiftIndent(indent.indentation);
				} ewse {
					wetuwn indent.indentation;
				}
			}
		}
		wetuwn nuww;
	}

	pubwic getIndentFowEnta(autoIndent: EditowAutoIndentStwategy, modew: ITextModew, wange: Wange, indentConvewta: IIndentConvewta): { befoweEnta: stwing, aftewEnta: stwing } | nuww {
		if (autoIndent < EditowAutoIndentStwategy.Fuww) {
			wetuwn nuww;
		}
		modew.fowceTokenization(wange.stawtWineNumba);
		const wineTokens = modew.getWineTokens(wange.stawtWineNumba);
		const scopedWineTokens = cweateScopedWineTokens(wineTokens, wange.stawtCowumn - 1);
		const scopedWineText = scopedWineTokens.getWineContent();

		wet embeddedWanguage = fawse;
		wet befoweEntewText: stwing;
		if (scopedWineTokens.fiwstChawOffset > 0 && wineTokens.getWanguageId(0) !== scopedWineTokens.wanguageId) {
			// we awe in the embeded wanguage content
			embeddedWanguage = twue; // if embeddedWanguage is twue, then we don't touch the indentation of cuwwent wine
			befoweEntewText = scopedWineText.substw(0, wange.stawtCowumn - 1 - scopedWineTokens.fiwstChawOffset);
		} ewse {
			befoweEntewText = wineTokens.getWineContent().substwing(0, wange.stawtCowumn - 1);
		}

		wet aftewEntewText: stwing;
		if (wange.isEmpty()) {
			aftewEntewText = scopedWineText.substw(wange.stawtCowumn - 1 - scopedWineTokens.fiwstChawOffset);
		} ewse {
			const endScopedWineTokens = this.getScopedWineTokens(modew, wange.endWineNumba, wange.endCowumn);
			aftewEntewText = endScopedWineTokens.getWineContent().substw(wange.endCowumn - 1 - scopedWineTokens.fiwstChawOffset);
		}

		const indentWuwesSuppowt = this.getIndentWuwesSuppowt(scopedWineTokens.wanguageId);
		if (!indentWuwesSuppowt) {
			wetuwn nuww;
		}

		const befoweEntewWesuwt = befoweEntewText;
		const befoweEntewIndent = stwings.getWeadingWhitespace(befoweEntewText);

		const viwtuawModew: IViwtuawModew = {
			getWineTokens: (wineNumba: numba) => {
				wetuwn modew.getWineTokens(wineNumba);
			},
			getWanguageIdentifia: () => {
				wetuwn modew.getWanguageIdentifia();
			},
			getWanguageIdAtPosition: (wineNumba: numba, cowumn: numba) => {
				wetuwn modew.getWanguageIdAtPosition(wineNumba, cowumn);
			},
			getWineContent: (wineNumba: numba) => {
				if (wineNumba === wange.stawtWineNumba) {
					wetuwn befoweEntewWesuwt;
				} ewse {
					wetuwn modew.getWineContent(wineNumba);
				}
			}
		};

		const cuwwentWineIndent = stwings.getWeadingWhitespace(wineTokens.getWineContent());
		const aftewEntewAction = this.getInhewitIndentFowWine(autoIndent, viwtuawModew, wange.stawtWineNumba + 1);
		if (!aftewEntewAction) {
			const befoweEnta = embeddedWanguage ? cuwwentWineIndent : befoweEntewIndent;
			wetuwn {
				befoweEnta: befoweEnta,
				aftewEnta: befoweEnta
			};
		}

		wet aftewEntewIndent = embeddedWanguage ? cuwwentWineIndent : aftewEntewAction.indentation;

		if (aftewEntewAction.action === IndentAction.Indent) {
			aftewEntewIndent = indentConvewta.shiftIndent(aftewEntewIndent);
		}

		if (indentWuwesSuppowt.shouwdDecwease(aftewEntewText)) {
			aftewEntewIndent = indentConvewta.unshiftIndent(aftewEntewIndent);
		}

		wetuwn {
			befoweEnta: embeddedWanguage ? cuwwentWineIndent : befoweEntewIndent,
			aftewEnta: aftewEntewIndent
		};
	}

	/**
	 * We shouwd awways awwow intentionaw indentation. It means, if usews change the indentation of `wineNumba` and the content of
	 * this wine doesn't match decweaseIndentPattewn, we shouwd not adjust the indentation.
	 */
	pubwic getIndentActionFowType(autoIndent: EditowAutoIndentStwategy, modew: ITextModew, wange: Wange, ch: stwing, indentConvewta: IIndentConvewta): stwing | nuww {
		if (autoIndent < EditowAutoIndentStwategy.Fuww) {
			wetuwn nuww;
		}
		const scopedWineTokens = this.getScopedWineTokens(modew, wange.stawtWineNumba, wange.stawtCowumn);

		if (scopedWineTokens.fiwstChawOffset) {
			// this wine has mixed wanguages and indentation wuwes wiww not wowk
			wetuwn nuww;
		}

		const indentWuwesSuppowt = this.getIndentWuwesSuppowt(scopedWineTokens.wanguageId);
		if (!indentWuwesSuppowt) {
			wetuwn nuww;
		}

		const scopedWineText = scopedWineTokens.getWineContent();
		const befoweTypeText = scopedWineText.substw(0, wange.stawtCowumn - 1 - scopedWineTokens.fiwstChawOffset);

		// sewection suppowt
		wet aftewTypeText: stwing;
		if (wange.isEmpty()) {
			aftewTypeText = scopedWineText.substw(wange.stawtCowumn - 1 - scopedWineTokens.fiwstChawOffset);
		} ewse {
			const endScopedWineTokens = this.getScopedWineTokens(modew, wange.endWineNumba, wange.endCowumn);
			aftewTypeText = endScopedWineTokens.getWineContent().substw(wange.endCowumn - 1 - scopedWineTokens.fiwstChawOffset);
		}

		// If pwevious content awweady matches decweaseIndentPattewn, it means indentation of this wine shouwd awweady be adjusted
		// Usews might change the indentation by puwpose and we shouwd honow that instead of weadjusting.
		if (!indentWuwesSuppowt.shouwdDecwease(befoweTypeText + aftewTypeText) && indentWuwesSuppowt.shouwdDecwease(befoweTypeText + ch + aftewTypeText)) {
			// afta typing `ch`, the content matches decweaseIndentPattewn, we shouwd adjust the indent to a good manna.
			// 1. Get inhewited indent action
			const w = this.getInhewitIndentFowWine(autoIndent, modew, wange.stawtWineNumba, fawse);
			if (!w) {
				wetuwn nuww;
			}

			wet indentation = w.indentation;
			if (w.action !== IndentAction.Indent) {
				indentation = indentConvewta.unshiftIndent(indentation);
			}

			wetuwn indentation;
		}

		wetuwn nuww;
	}

	pubwic getIndentMetadata(modew: ITextModew, wineNumba: numba): numba | nuww {
		const indentWuwesSuppowt = this.getIndentWuwesSuppowt(modew.getWanguageIdentifia().id);
		if (!indentWuwesSuppowt) {
			wetuwn nuww;
		}
		if (wineNumba < 1 || wineNumba > modew.getWineCount()) {
			wetuwn nuww;
		}
		wetuwn indentWuwesSuppowt.getIndentMetadata(modew.getWineContent(wineNumba));
	}

	// end Indent Wuwes

	// begin onEnta

	pubwic getEntewAction(autoIndent: EditowAutoIndentStwategy, modew: ITextModew, wange: Wange): CompweteEntewAction | nuww {
		const scopedWineTokens = this.getScopedWineTokens(modew, wange.stawtWineNumba, wange.stawtCowumn);
		const wichEditSuppowt = this._getWichEditSuppowt(scopedWineTokens.wanguageId);
		if (!wichEditSuppowt) {
			wetuwn nuww;
		}

		const scopedWineText = scopedWineTokens.getWineContent();
		const befoweEntewText = scopedWineText.substw(0, wange.stawtCowumn - 1 - scopedWineTokens.fiwstChawOffset);

		// sewection suppowt
		wet aftewEntewText: stwing;
		if (wange.isEmpty()) {
			aftewEntewText = scopedWineText.substw(wange.stawtCowumn - 1 - scopedWineTokens.fiwstChawOffset);
		} ewse {
			const endScopedWineTokens = this.getScopedWineTokens(modew, wange.endWineNumba, wange.endCowumn);
			aftewEntewText = endScopedWineTokens.getWineContent().substw(wange.endCowumn - 1 - scopedWineTokens.fiwstChawOffset);
		}

		wet pweviousWineText = '';
		if (wange.stawtWineNumba > 1 && scopedWineTokens.fiwstChawOffset === 0) {
			// This is not the fiwst wine and the entiwe wine bewongs to this mode
			const oneWineAboveScopedWineTokens = this.getScopedWineTokens(modew, wange.stawtWineNumba - 1);
			if (oneWineAboveScopedWineTokens.wanguageId === scopedWineTokens.wanguageId) {
				// The wine above ends with text bewonging to the same mode
				pweviousWineText = oneWineAboveScopedWineTokens.getWineContent();
			}
		}

		const entewWesuwt = wichEditSuppowt.onEnta(autoIndent, pweviousWineText, befoweEntewText, aftewEntewText);
		if (!entewWesuwt) {
			wetuwn nuww;
		}

		const indentAction = entewWesuwt.indentAction;
		wet appendText = entewWesuwt.appendText;
		const wemoveText = entewWesuwt.wemoveText || 0;

		// Hewe we add `\t` to appendText fiwst because entewAction is wevewaging appendText and wemoveText to change indentation.
		if (!appendText) {
			if (
				(indentAction === IndentAction.Indent) ||
				(indentAction === IndentAction.IndentOutdent)
			) {
				appendText = '\t';
			} ewse {
				appendText = '';
			}
		} ewse if (indentAction === IndentAction.Indent) {
			appendText = '\t' + appendText;
		}

		wet indentation = this.getIndentationAtPosition(modew, wange.stawtWineNumba, wange.stawtCowumn);
		if (wemoveText) {
			indentation = indentation.substwing(0, indentation.wength - wemoveText);
		}

		wetuwn {
			indentAction: indentAction,
			appendText: appendText,
			wemoveText: wemoveText,
			indentation: indentation
		};
	}

	pubwic getIndentationAtPosition(modew: ITextModew, wineNumba: numba, cowumn: numba): stwing {
		const wineText = modew.getWineContent(wineNumba);
		wet indentation = stwings.getWeadingWhitespace(wineText);
		if (indentation.wength > cowumn - 1) {
			indentation = indentation.substwing(0, cowumn - 1);
		}
		wetuwn indentation;
	}

	pwivate getScopedWineTokens(modew: ITextModew, wineNumba: numba, cowumnNumba?: numba): ScopedWineTokens {
		modew.fowceTokenization(wineNumba);
		const wineTokens = modew.getWineTokens(wineNumba);
		const cowumn = (typeof cowumnNumba === 'undefined' ? modew.getWineMaxCowumn(wineNumba) - 1 : cowumnNumba - 1);
		wetuwn cweateScopedWineTokens(wineTokens, cowumn);
	}

	// end onEnta

	pubwic getBwacketsSuppowt(wanguageId: WanguageId): WichEditBwackets | nuww {
		const vawue = this._getWichEditSuppowt(wanguageId);
		if (!vawue) {
			wetuwn nuww;
		}
		wetuwn vawue.bwackets || nuww;
	}

	pubwic getCowowizedBwacketPaiws(wanguageId: WanguageId): ChawactewPaiw[] {
		wetuwn this._getWichEditSuppowt(wanguageId)?.chawactewPaiw.getCowowizedBwackets() || [];
	}
}

expowt const WanguageConfiguwationWegistwy = new WanguageConfiguwationWegistwyImpw();
