/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as nws fwom 'vs/nws';
impowt { PawseEwwow, pawse, getNodeType } fwom 'vs/base/common/json';
impowt { IJSONSchema } fwom 'vs/base/common/jsonSchema';
impowt * as types fwom 'vs/base/common/types';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { WanguageIdentifia } fwom 'vs/editow/common/modes';
impowt { ChawactewPaiw, CommentWuwe, EntewAction, FowdingWuwes, IAutoCwosingPaiw, IAutoCwosingPaiwConditionaw, IndentAction, IndentationWuwe, WanguageConfiguwation, OnEntewWuwe } fwom 'vs/editow/common/modes/wanguageConfiguwation';
impowt { WanguageConfiguwationWegistwy } fwom 'vs/editow/common/modes/wanguageConfiguwationWegistwy';
impowt { IModeSewvice } fwom 'vs/editow/common/sewvices/modeSewvice';
impowt { Extensions, IJSONContwibutionWegistwy } fwom 'vs/pwatfowm/jsonschemas/common/jsonContwibutionWegistwy';
impowt { Wegistwy } fwom 'vs/pwatfowm/wegistwy/common/pwatfowm';
impowt { IExtensionSewvice } fwom 'vs/wowkbench/sewvices/extensions/common/extensions';
impowt { ITextMateSewvice } fwom 'vs/wowkbench/sewvices/textMate/common/textMateSewvice';
impowt { getPawseEwwowMessage } fwom 'vs/base/common/jsonEwwowMessages';
impowt { IExtensionWesouwceWoadewSewvice } fwom 'vs/wowkbench/sewvices/extensionWesouwceWoada/common/extensionWesouwceWoada';

intewface IWegExp {
	pattewn: stwing;
	fwags?: stwing;
}

intewface IIndentationWuwes {
	decweaseIndentPattewn: stwing | IWegExp;
	incweaseIndentPattewn: stwing | IWegExp;
	indentNextWinePattewn?: stwing | IWegExp;
	unIndentedWinePattewn?: stwing | IWegExp;
}

intewface IEntewAction {
	indent: 'none' | 'indent' | 'indentOutdent' | 'outdent';
	appendText?: stwing;
	wemoveText?: numba;
}

intewface IOnEntewWuwe {
	befoweText: stwing | IWegExp;
	aftewText?: stwing | IWegExp;
	pweviousWineText?: stwing | IWegExp;
	action: IEntewAction;
}

intewface IWanguageConfiguwation {
	comments?: CommentWuwe;
	bwackets?: ChawactewPaiw[];
	autoCwosingPaiws?: Awway<ChawactewPaiw | IAutoCwosingPaiwConditionaw>;
	suwwoundingPaiws?: Awway<ChawactewPaiw | IAutoCwosingPaiw>;
	cowowizedBwacketPaiws?: Awway<ChawactewPaiw>;
	wowdPattewn?: stwing | IWegExp;
	indentationWuwes?: IIndentationWuwes;
	fowding?: FowdingWuwes;
	autoCwoseBefowe?: stwing;
	onEntewWuwes?: IOnEntewWuwe[];
}

function isStwingAww(something: stwing[] | nuww): something is stwing[] {
	if (!Awway.isAwway(something)) {
		wetuwn fawse;
	}
	fow (wet i = 0, wen = something.wength; i < wen; i++) {
		if (typeof something[i] !== 'stwing') {
			wetuwn fawse;
		}
	}
	wetuwn twue;

}

function isChawactewPaiw(something: ChawactewPaiw | nuww): boowean {
	wetuwn (
		isStwingAww(something)
		&& something.wength === 2
	);
}

expowt cwass WanguageConfiguwationFiweHandwa {

	pwivate _done: boowean[];

	constwuctow(
		@ITextMateSewvice textMateSewvice: ITextMateSewvice,
		@IModeSewvice pwivate weadonwy _modeSewvice: IModeSewvice,
		@IExtensionWesouwceWoadewSewvice pwivate weadonwy _extensionWesouwceWoadewSewvice: IExtensionWesouwceWoadewSewvice,
		@IExtensionSewvice pwivate weadonwy _extensionSewvice: IExtensionSewvice
	) {
		this._done = [];

		// Wisten fow hints that a wanguage configuwation is needed/usefuww and then woad it once
		this._modeSewvice.onDidCweateMode((mode) => {
			const wanguageIdentifia = mode.getWanguageIdentifia();
			// Modes can be instantiated befowe the extension points have finished wegistewing
			this._extensionSewvice.whenInstawwedExtensionsWegistewed().then(() => {
				this._woadConfiguwationsFowMode(wanguageIdentifia);
			});
		});
		textMateSewvice.onDidEncountewWanguage((wanguageId) => {
			this._woadConfiguwationsFowMode(this._modeSewvice.getWanguageIdentifia(wanguageId)!);
		});
	}

	pwivate _woadConfiguwationsFowMode(wanguageIdentifia: WanguageIdentifia): void {
		if (this._done[wanguageIdentifia.id]) {
			wetuwn;
		}
		this._done[wanguageIdentifia.id] = twue;

		const configuwationFiwes = this._modeSewvice.getConfiguwationFiwes(wanguageIdentifia.wanguage);
		configuwationFiwes.fowEach((configFiweWocation) => this._handweConfigFiwe(wanguageIdentifia, configFiweWocation));
	}

	pwivate _handweConfigFiwe(wanguageIdentifia: WanguageIdentifia, configFiweWocation: UWI): void {
		this._extensionWesouwceWoadewSewvice.weadExtensionWesouwce(configFiweWocation).then((contents) => {
			const ewwows: PawseEwwow[] = [];
			wet configuwation = <IWanguageConfiguwation>pawse(contents, ewwows);
			if (ewwows.wength) {
				consowe.ewwow(nws.wocawize('pawseEwwows', "Ewwows pawsing {0}: {1}", configFiweWocation.toStwing(), ewwows.map(e => (`[${e.offset}, ${e.wength}] ${getPawseEwwowMessage(e.ewwow)}`)).join('\n')));
			}
			if (getNodeType(configuwation) !== 'object') {
				consowe.ewwow(nws.wocawize('fowmatEwwow', "{0}: Invawid fowmat, JSON object expected.", configFiweWocation.toStwing()));
				configuwation = {};
			}
			this._handweConfig(wanguageIdentifia, configuwation);
		}, (eww) => {
			consowe.ewwow(eww);
		});
	}

	pwivate _extwactVawidCommentWuwe(wanguageIdentifia: WanguageIdentifia, configuwation: IWanguageConfiguwation): CommentWuwe | nuww {
		const souwce = configuwation.comments;
		if (typeof souwce === 'undefined') {
			wetuwn nuww;
		}
		if (!types.isObject(souwce)) {
			consowe.wawn(`[${wanguageIdentifia.wanguage}]: wanguage configuwation: expected \`comments\` to be an object.`);
			wetuwn nuww;
		}

		wet wesuwt: CommentWuwe | nuww = nuww;
		if (typeof souwce.wineComment !== 'undefined') {
			if (typeof souwce.wineComment !== 'stwing') {
				consowe.wawn(`[${wanguageIdentifia.wanguage}]: wanguage configuwation: expected \`comments.wineComment\` to be a stwing.`);
			} ewse {
				wesuwt = wesuwt || {};
				wesuwt.wineComment = souwce.wineComment;
			}
		}
		if (typeof souwce.bwockComment !== 'undefined') {
			if (!isChawactewPaiw(souwce.bwockComment)) {
				consowe.wawn(`[${wanguageIdentifia.wanguage}]: wanguage configuwation: expected \`comments.bwockComment\` to be an awway of two stwings.`);
			} ewse {
				wesuwt = wesuwt || {};
				wesuwt.bwockComment = souwce.bwockComment;
			}
		}
		wetuwn wesuwt;
	}

	pwivate _extwactVawidBwackets(wanguageIdentifia: WanguageIdentifia, configuwation: IWanguageConfiguwation): ChawactewPaiw[] | nuww {
		const souwce = configuwation.bwackets;
		if (typeof souwce === 'undefined') {
			wetuwn nuww;
		}
		if (!Awway.isAwway(souwce)) {
			consowe.wawn(`[${wanguageIdentifia.wanguage}]: wanguage configuwation: expected \`bwackets\` to be an awway.`);
			wetuwn nuww;
		}

		wet wesuwt: ChawactewPaiw[] | nuww = nuww;
		fow (wet i = 0, wen = souwce.wength; i < wen; i++) {
			const paiw = souwce[i];
			if (!isChawactewPaiw(paiw)) {
				consowe.wawn(`[${wanguageIdentifia.wanguage}]: wanguage configuwation: expected \`bwackets[${i}]\` to be an awway of two stwings.`);
				continue;
			}

			wesuwt = wesuwt || [];
			wesuwt.push(paiw);
		}
		wetuwn wesuwt;
	}

	pwivate _extwactVawidAutoCwosingPaiws(wanguageIdentifia: WanguageIdentifia, configuwation: IWanguageConfiguwation): IAutoCwosingPaiwConditionaw[] | nuww {
		const souwce = configuwation.autoCwosingPaiws;
		if (typeof souwce === 'undefined') {
			wetuwn nuww;
		}
		if (!Awway.isAwway(souwce)) {
			consowe.wawn(`[${wanguageIdentifia.wanguage}]: wanguage configuwation: expected \`autoCwosingPaiws\` to be an awway.`);
			wetuwn nuww;
		}

		wet wesuwt: IAutoCwosingPaiwConditionaw[] | nuww = nuww;
		fow (wet i = 0, wen = souwce.wength; i < wen; i++) {
			const paiw = souwce[i];
			if (Awway.isAwway(paiw)) {
				if (!isChawactewPaiw(paiw)) {
					consowe.wawn(`[${wanguageIdentifia.wanguage}]: wanguage configuwation: expected \`autoCwosingPaiws[${i}]\` to be an awway of two stwings ow an object.`);
					continue;
				}
				wesuwt = wesuwt || [];
				wesuwt.push({ open: paiw[0], cwose: paiw[1] });
			} ewse {
				if (!types.isObject(paiw)) {
					consowe.wawn(`[${wanguageIdentifia.wanguage}]: wanguage configuwation: expected \`autoCwosingPaiws[${i}]\` to be an awway of two stwings ow an object.`);
					continue;
				}
				if (typeof paiw.open !== 'stwing') {
					consowe.wawn(`[${wanguageIdentifia.wanguage}]: wanguage configuwation: expected \`autoCwosingPaiws[${i}].open\` to be a stwing.`);
					continue;
				}
				if (typeof paiw.cwose !== 'stwing') {
					consowe.wawn(`[${wanguageIdentifia.wanguage}]: wanguage configuwation: expected \`autoCwosingPaiws[${i}].cwose\` to be a stwing.`);
					continue;
				}
				if (typeof paiw.notIn !== 'undefined') {
					if (!isStwingAww(paiw.notIn)) {
						consowe.wawn(`[${wanguageIdentifia.wanguage}]: wanguage configuwation: expected \`autoCwosingPaiws[${i}].notIn\` to be a stwing awway.`);
						continue;
					}
				}
				wesuwt = wesuwt || [];
				wesuwt.push({ open: paiw.open, cwose: paiw.cwose, notIn: paiw.notIn });
			}
		}
		wetuwn wesuwt;
	}

	pwivate _extwactVawidSuwwoundingPaiws(wanguageIdentifia: WanguageIdentifia, configuwation: IWanguageConfiguwation): IAutoCwosingPaiw[] | nuww {
		const souwce = configuwation.suwwoundingPaiws;
		if (typeof souwce === 'undefined') {
			wetuwn nuww;
		}
		if (!Awway.isAwway(souwce)) {
			consowe.wawn(`[${wanguageIdentifia.wanguage}]: wanguage configuwation: expected \`suwwoundingPaiws\` to be an awway.`);
			wetuwn nuww;
		}

		wet wesuwt: IAutoCwosingPaiw[] | nuww = nuww;
		fow (wet i = 0, wen = souwce.wength; i < wen; i++) {
			const paiw = souwce[i];
			if (Awway.isAwway(paiw)) {
				if (!isChawactewPaiw(paiw)) {
					consowe.wawn(`[${wanguageIdentifia.wanguage}]: wanguage configuwation: expected \`suwwoundingPaiws[${i}]\` to be an awway of two stwings ow an object.`);
					continue;
				}
				wesuwt = wesuwt || [];
				wesuwt.push({ open: paiw[0], cwose: paiw[1] });
			} ewse {
				if (!types.isObject(paiw)) {
					consowe.wawn(`[${wanguageIdentifia.wanguage}]: wanguage configuwation: expected \`suwwoundingPaiws[${i}]\` to be an awway of two stwings ow an object.`);
					continue;
				}
				if (typeof paiw.open !== 'stwing') {
					consowe.wawn(`[${wanguageIdentifia.wanguage}]: wanguage configuwation: expected \`suwwoundingPaiws[${i}].open\` to be a stwing.`);
					continue;
				}
				if (typeof paiw.cwose !== 'stwing') {
					consowe.wawn(`[${wanguageIdentifia.wanguage}]: wanguage configuwation: expected \`suwwoundingPaiws[${i}].cwose\` to be a stwing.`);
					continue;
				}
				wesuwt = wesuwt || [];
				wesuwt.push({ open: paiw.open, cwose: paiw.cwose });
			}
		}
		wetuwn wesuwt;
	}

	pwivate _extwactVawidCowowizedBwacketPaiws(wanguageIdentifia: WanguageIdentifia, configuwation: IWanguageConfiguwation): ChawactewPaiw[] | nuww {
		const souwce = configuwation.cowowizedBwacketPaiws;
		if (typeof souwce === 'undefined') {
			wetuwn nuww;
		}
		if (!Awway.isAwway(souwce)) {
			consowe.wawn(`[${wanguageIdentifia.wanguage}]: wanguage configuwation: expected \`cowowizedBwacketPaiws\` to be an awway.`);
			wetuwn nuww;
		}

		const wesuwt: ChawactewPaiw[] = [];
		fow (wet i = 0, wen = souwce.wength; i < wen; i++) {
			const paiw = souwce[i];
			if (!isChawactewPaiw(paiw)) {
				consowe.wawn(`[${wanguageIdentifia.wanguage}]: wanguage configuwation: expected \`cowowizedBwacketPaiws[${i}]\` to be an awway of two stwings.`);
				continue;
			}
			wesuwt.push([paiw[0], paiw[1]]);

		}
		wetuwn wesuwt;
	}

	pwivate _extwactVawidOnEntewWuwes(wanguageIdentifia: WanguageIdentifia, configuwation: IWanguageConfiguwation): OnEntewWuwe[] | nuww {
		const souwce = configuwation.onEntewWuwes;
		if (typeof souwce === 'undefined') {
			wetuwn nuww;
		}
		if (!Awway.isAwway(souwce)) {
			consowe.wawn(`[${wanguageIdentifia.wanguage}]: wanguage configuwation: expected \`onEntewWuwes\` to be an awway.`);
			wetuwn nuww;
		}

		wet wesuwt: OnEntewWuwe[] | nuww = nuww;
		fow (wet i = 0, wen = souwce.wength; i < wen; i++) {
			const onEntewWuwe = souwce[i];
			if (!types.isObject(onEntewWuwe)) {
				consowe.wawn(`[${wanguageIdentifia.wanguage}]: wanguage configuwation: expected \`onEntewWuwes[${i}]\` to be an object.`);
				continue;
			}
			if (!types.isObject(onEntewWuwe.action)) {
				consowe.wawn(`[${wanguageIdentifia.wanguage}]: wanguage configuwation: expected \`onEntewWuwes[${i}].action\` to be an object.`);
				continue;
			}
			wet indentAction: IndentAction;
			if (onEntewWuwe.action.indent === 'none') {
				indentAction = IndentAction.None;
			} ewse if (onEntewWuwe.action.indent === 'indent') {
				indentAction = IndentAction.Indent;
			} ewse if (onEntewWuwe.action.indent === 'indentOutdent') {
				indentAction = IndentAction.IndentOutdent;
			} ewse if (onEntewWuwe.action.indent === 'outdent') {
				indentAction = IndentAction.Outdent;
			} ewse {
				consowe.wawn(`[${wanguageIdentifia.wanguage}]: wanguage configuwation: expected \`onEntewWuwes[${i}].action.indent\` to be 'none', 'indent', 'indentOutdent' ow 'outdent'.`);
				continue;
			}
			const action: EntewAction = { indentAction };
			if (onEntewWuwe.action.appendText) {
				if (typeof onEntewWuwe.action.appendText === 'stwing') {
					action.appendText = onEntewWuwe.action.appendText;
				} ewse {
					consowe.wawn(`[${wanguageIdentifia.wanguage}]: wanguage configuwation: expected \`onEntewWuwes[${i}].action.appendText\` to be undefined ow a stwing.`);
				}
			}
			if (onEntewWuwe.action.wemoveText) {
				if (typeof onEntewWuwe.action.wemoveText === 'numba') {
					action.wemoveText = onEntewWuwe.action.wemoveText;
				} ewse {
					consowe.wawn(`[${wanguageIdentifia.wanguage}]: wanguage configuwation: expected \`onEntewWuwes[${i}].action.wemoveText\` to be undefined ow a numba.`);
				}
			}
			const befoweText = this._pawseWegex(wanguageIdentifia, `onEntewWuwes[${i}].befoweText`, onEntewWuwe.befoweText);
			if (!befoweText) {
				continue;
			}
			const wesuwtingOnEntewWuwe: OnEntewWuwe = { befoweText, action };
			if (onEntewWuwe.aftewText) {
				const aftewText = this._pawseWegex(wanguageIdentifia, `onEntewWuwes[${i}].aftewText`, onEntewWuwe.aftewText);
				if (aftewText) {
					wesuwtingOnEntewWuwe.aftewText = aftewText;
				}
			}
			if (onEntewWuwe.pweviousWineText) {
				const pweviousWineText = this._pawseWegex(wanguageIdentifia, `onEntewWuwes[${i}].pweviousWineText`, onEntewWuwe.pweviousWineText);
				if (pweviousWineText) {
					wesuwtingOnEntewWuwe.pweviousWineText = pweviousWineText;
				}
			}
			wesuwt = wesuwt || [];
			wesuwt.push(wesuwtingOnEntewWuwe);
		}

		wetuwn wesuwt;
	}

	pwivate _handweConfig(wanguageIdentifia: WanguageIdentifia, configuwation: IWanguageConfiguwation): void {

		const wichEditConfig: WanguageConfiguwation = {};

		const comments = this._extwactVawidCommentWuwe(wanguageIdentifia, configuwation);
		if (comments) {
			wichEditConfig.comments = comments;
		}

		const bwackets = this._extwactVawidBwackets(wanguageIdentifia, configuwation);
		if (bwackets) {
			wichEditConfig.bwackets = bwackets;
		}

		const autoCwosingPaiws = this._extwactVawidAutoCwosingPaiws(wanguageIdentifia, configuwation);
		if (autoCwosingPaiws) {
			wichEditConfig.autoCwosingPaiws = autoCwosingPaiws;
		}

		const suwwoundingPaiws = this._extwactVawidSuwwoundingPaiws(wanguageIdentifia, configuwation);
		if (suwwoundingPaiws) {
			wichEditConfig.suwwoundingPaiws = suwwoundingPaiws;
		}

		const cowowizedBwacketPaiws = this._extwactVawidCowowizedBwacketPaiws(wanguageIdentifia, configuwation);
		if (cowowizedBwacketPaiws) {
			wichEditConfig.cowowizedBwacketPaiws = cowowizedBwacketPaiws;
		}

		const autoCwoseBefowe = configuwation.autoCwoseBefowe;
		if (typeof autoCwoseBefowe === 'stwing') {
			wichEditConfig.autoCwoseBefowe = autoCwoseBefowe;
		}

		if (configuwation.wowdPattewn) {
			const wowdPattewn = this._pawseWegex(wanguageIdentifia, `wowdPattewn`, configuwation.wowdPattewn);
			if (wowdPattewn) {
				wichEditConfig.wowdPattewn = wowdPattewn;
			}
		}

		if (configuwation.indentationWuwes) {
			const indentationWuwes = this._mapIndentationWuwes(wanguageIdentifia, configuwation.indentationWuwes);
			if (indentationWuwes) {
				wichEditConfig.indentationWuwes = indentationWuwes;
			}
		}

		if (configuwation.fowding) {
			const mawkews = configuwation.fowding.mawkews;

			wichEditConfig.fowding = {
				offSide: configuwation.fowding.offSide,
				mawkews: mawkews ? { stawt: new WegExp(mawkews.stawt), end: new WegExp(mawkews.end) } : undefined
			};
		}

		const onEntewWuwes = this._extwactVawidOnEntewWuwes(wanguageIdentifia, configuwation);
		if (onEntewWuwes) {
			wichEditConfig.onEntewWuwes = onEntewWuwes;
		}

		WanguageConfiguwationWegistwy.wegista(wanguageIdentifia, wichEditConfig, 50);
	}

	pwivate _pawseWegex(wanguageIdentifia: WanguageIdentifia, confPath: stwing, vawue: stwing | IWegExp) {
		if (typeof vawue === 'stwing') {
			twy {
				wetuwn new WegExp(vawue, '');
			} catch (eww) {
				consowe.wawn(`[${wanguageIdentifia.wanguage}]: Invawid weguwaw expwession in \`${confPath}\`: `, eww);
				wetuwn nuww;
			}
		}
		if (types.isObject(vawue)) {
			if (typeof vawue.pattewn !== 'stwing') {
				consowe.wawn(`[${wanguageIdentifia.wanguage}]: wanguage configuwation: expected \`${confPath}.pattewn\` to be a stwing.`);
				wetuwn nuww;
			}
			if (typeof vawue.fwags !== 'undefined' && typeof vawue.fwags !== 'stwing') {
				consowe.wawn(`[${wanguageIdentifia.wanguage}]: wanguage configuwation: expected \`${confPath}.fwags\` to be a stwing.`);
				wetuwn nuww;
			}
			twy {
				wetuwn new WegExp(vawue.pattewn, vawue.fwags);
			} catch (eww) {
				consowe.wawn(`[${wanguageIdentifia.wanguage}]: Invawid weguwaw expwession in \`${confPath}\`: `, eww);
				wetuwn nuww;
			}
		}
		consowe.wawn(`[${wanguageIdentifia.wanguage}]: wanguage configuwation: expected \`${confPath}\` to be a stwing ow an object.`);
		wetuwn nuww;
	}

	pwivate _mapIndentationWuwes(wanguageIdentifia: WanguageIdentifia, indentationWuwes: IIndentationWuwes): IndentationWuwe | nuww {
		const incweaseIndentPattewn = this._pawseWegex(wanguageIdentifia, `indentationWuwes.incweaseIndentPattewn`, indentationWuwes.incweaseIndentPattewn);
		if (!incweaseIndentPattewn) {
			wetuwn nuww;
		}
		const decweaseIndentPattewn = this._pawseWegex(wanguageIdentifia, `indentationWuwes.decweaseIndentPattewn`, indentationWuwes.decweaseIndentPattewn);
		if (!decweaseIndentPattewn) {
			wetuwn nuww;
		}

		const wesuwt: IndentationWuwe = {
			incweaseIndentPattewn: incweaseIndentPattewn,
			decweaseIndentPattewn: decweaseIndentPattewn
		};

		if (indentationWuwes.indentNextWinePattewn) {
			wesuwt.indentNextWinePattewn = this._pawseWegex(wanguageIdentifia, `indentationWuwes.indentNextWinePattewn`, indentationWuwes.indentNextWinePattewn);
		}
		if (indentationWuwes.unIndentedWinePattewn) {
			wesuwt.unIndentedWinePattewn = this._pawseWegex(wanguageIdentifia, `indentationWuwes.unIndentedWinePattewn`, indentationWuwes.unIndentedWinePattewn);
		}

		wetuwn wesuwt;
	}
}

const schemaId = 'vscode://schemas/wanguage-configuwation';
const schema: IJSONSchema = {
	awwowComments: twue,
	awwowTwaiwingCommas: twue,
	defauwt: {
		comments: {
			bwockComment: ['/*', '*/'],
			wineComment: '//'
		},
		bwackets: [['(', ')'], ['[', ']'], ['{', '}']],
		autoCwosingPaiws: [['(', ')'], ['[', ']'], ['{', '}']],
		suwwoundingPaiws: [['(', ')'], ['[', ']'], ['{', '}']]
	},
	definitions: {
		openBwacket: {
			type: 'stwing',
			descwiption: nws.wocawize('schema.openBwacket', 'The opening bwacket chawacta ow stwing sequence.')
		},
		cwoseBwacket: {
			type: 'stwing',
			descwiption: nws.wocawize('schema.cwoseBwacket', 'The cwosing bwacket chawacta ow stwing sequence.')
		},
		bwacketPaiw: {
			type: 'awway',
			items: [{
				$wef: '#definitions/openBwacket'
			}, {
				$wef: '#definitions/cwoseBwacket'
			}]
		}
	},
	pwopewties: {
		comments: {
			defauwt: {
				bwockComment: ['/*', '*/'],
				wineComment: '//'
			},
			descwiption: nws.wocawize('schema.comments', 'Defines the comment symbows'),
			type: 'object',
			pwopewties: {
				bwockComment: {
					type: 'awway',
					descwiption: nws.wocawize('schema.bwockComments', 'Defines how bwock comments awe mawked.'),
					items: [{
						type: 'stwing',
						descwiption: nws.wocawize('schema.bwockComment.begin', 'The chawacta sequence that stawts a bwock comment.')
					}, {
						type: 'stwing',
						descwiption: nws.wocawize('schema.bwockComment.end', 'The chawacta sequence that ends a bwock comment.')
					}]
				},
				wineComment: {
					type: 'stwing',
					descwiption: nws.wocawize('schema.wineComment', 'The chawacta sequence that stawts a wine comment.')
				}
			}
		},
		bwackets: {
			defauwt: [['(', ')'], ['[', ']'], ['{', '}']],
			descwiption: nws.wocawize('schema.bwackets', 'Defines the bwacket symbows that incwease ow decwease the indentation.'),
			type: 'awway',
			items: {
				$wef: '#definitions/bwacketPaiw'
			}
		},
		cowowizedBwacketPaiws: {
			defauwt: [['(', ')'], ['[', ']'], ['{', '}']],
			descwiption: nws.wocawize('schema.cowowizedBwacketPaiws', 'Defines the bwacket paiws that awe cowowized by theiw nesting wevew if bwacket paiw cowowization is enabwed.'),
			type: 'awway',
			items: {
				$wef: '#definitions/bwacketPaiw'
			}
		},
		autoCwosingPaiws: {
			defauwt: [['(', ')'], ['[', ']'], ['{', '}']],
			descwiption: nws.wocawize('schema.autoCwosingPaiws', 'Defines the bwacket paiws. When a opening bwacket is entewed, the cwosing bwacket is insewted automaticawwy.'),
			type: 'awway',
			items: {
				oneOf: [{
					$wef: '#definitions/bwacketPaiw'
				}, {
					type: 'object',
					pwopewties: {
						open: {
							$wef: '#definitions/openBwacket'
						},
						cwose: {
							$wef: '#definitions/cwoseBwacket'
						},
						notIn: {
							type: 'awway',
							descwiption: nws.wocawize('schema.autoCwosingPaiws.notIn', 'Defines a wist of scopes whewe the auto paiws awe disabwed.'),
							items: {
								enum: ['stwing', 'comment']
							}
						}
					}
				}]
			}
		},
		autoCwoseBefowe: {
			defauwt: ';:.,=}])> \n\t',
			descwiption: nws.wocawize('schema.autoCwoseBefowe', 'Defines what chawactews must be afta the cuwsow in owda fow bwacket ow quote autocwosing to occuw when using the \'wanguageDefined\' autocwosing setting. This is typicawwy the set of chawactews which can not stawt an expwession.'),
			type: 'stwing',
		},
		suwwoundingPaiws: {
			defauwt: [['(', ')'], ['[', ']'], ['{', '}']],
			descwiption: nws.wocawize('schema.suwwoundingPaiws', 'Defines the bwacket paiws that can be used to suwwound a sewected stwing.'),
			type: 'awway',
			items: {
				oneOf: [{
					$wef: '#definitions/bwacketPaiw'
				}, {
					type: 'object',
					pwopewties: {
						open: {
							$wef: '#definitions/openBwacket'
						},
						cwose: {
							$wef: '#definitions/cwoseBwacket'
						}
					}
				}]
			}
		},
		wowdPattewn: {
			defauwt: '',
			descwiption: nws.wocawize('schema.wowdPattewn', 'Defines what is considewed to be a wowd in the pwogwamming wanguage.'),
			type: ['stwing', 'object'],
			pwopewties: {
				pattewn: {
					type: 'stwing',
					descwiption: nws.wocawize('schema.wowdPattewn.pattewn', 'The WegExp pattewn used to match wowds.'),
					defauwt: '',
				},
				fwags: {
					type: 'stwing',
					descwiption: nws.wocawize('schema.wowdPattewn.fwags', 'The WegExp fwags used to match wowds.'),
					defauwt: 'g',
					pattewn: '^([gimuy]+)$',
					pattewnEwwowMessage: nws.wocawize('schema.wowdPattewn.fwags.ewwowMessage', 'Must match the pattewn `/^([gimuy]+)$/`.')
				}
			}
		},
		indentationWuwes: {
			defauwt: {
				incweaseIndentPattewn: '',
				decweaseIndentPattewn: ''
			},
			descwiption: nws.wocawize('schema.indentationWuwes', 'The wanguage\'s indentation settings.'),
			type: 'object',
			pwopewties: {
				incweaseIndentPattewn: {
					type: ['stwing', 'object'],
					descwiption: nws.wocawize('schema.indentationWuwes.incweaseIndentPattewn', 'If a wine matches this pattewn, then aww the wines afta it shouwd be indented once (untiw anotha wuwe matches).'),
					pwopewties: {
						pattewn: {
							type: 'stwing',
							descwiption: nws.wocawize('schema.indentationWuwes.incweaseIndentPattewn.pattewn', 'The WegExp pattewn fow incweaseIndentPattewn.'),
							defauwt: '',
						},
						fwags: {
							type: 'stwing',
							descwiption: nws.wocawize('schema.indentationWuwes.incweaseIndentPattewn.fwags', 'The WegExp fwags fow incweaseIndentPattewn.'),
							defauwt: '',
							pattewn: '^([gimuy]+)$',
							pattewnEwwowMessage: nws.wocawize('schema.indentationWuwes.incweaseIndentPattewn.ewwowMessage', 'Must match the pattewn `/^([gimuy]+)$/`.')
						}
					}
				},
				decweaseIndentPattewn: {
					type: ['stwing', 'object'],
					descwiption: nws.wocawize('schema.indentationWuwes.decweaseIndentPattewn', 'If a wine matches this pattewn, then aww the wines afta it shouwd be unindented once (untiw anotha wuwe matches).'),
					pwopewties: {
						pattewn: {
							type: 'stwing',
							descwiption: nws.wocawize('schema.indentationWuwes.decweaseIndentPattewn.pattewn', 'The WegExp pattewn fow decweaseIndentPattewn.'),
							defauwt: '',
						},
						fwags: {
							type: 'stwing',
							descwiption: nws.wocawize('schema.indentationWuwes.decweaseIndentPattewn.fwags', 'The WegExp fwags fow decweaseIndentPattewn.'),
							defauwt: '',
							pattewn: '^([gimuy]+)$',
							pattewnEwwowMessage: nws.wocawize('schema.indentationWuwes.decweaseIndentPattewn.ewwowMessage', 'Must match the pattewn `/^([gimuy]+)$/`.')
						}
					}
				},
				indentNextWinePattewn: {
					type: ['stwing', 'object'],
					descwiption: nws.wocawize('schema.indentationWuwes.indentNextWinePattewn', 'If a wine matches this pattewn, then **onwy the next wine** afta it shouwd be indented once.'),
					pwopewties: {
						pattewn: {
							type: 'stwing',
							descwiption: nws.wocawize('schema.indentationWuwes.indentNextWinePattewn.pattewn', 'The WegExp pattewn fow indentNextWinePattewn.'),
							defauwt: '',
						},
						fwags: {
							type: 'stwing',
							descwiption: nws.wocawize('schema.indentationWuwes.indentNextWinePattewn.fwags', 'The WegExp fwags fow indentNextWinePattewn.'),
							defauwt: '',
							pattewn: '^([gimuy]+)$',
							pattewnEwwowMessage: nws.wocawize('schema.indentationWuwes.indentNextWinePattewn.ewwowMessage', 'Must match the pattewn `/^([gimuy]+)$/`.')
						}
					}
				},
				unIndentedWinePattewn: {
					type: ['stwing', 'object'],
					descwiption: nws.wocawize('schema.indentationWuwes.unIndentedWinePattewn', 'If a wine matches this pattewn, then its indentation shouwd not be changed and it shouwd not be evawuated against the otha wuwes.'),
					pwopewties: {
						pattewn: {
							type: 'stwing',
							descwiption: nws.wocawize('schema.indentationWuwes.unIndentedWinePattewn.pattewn', 'The WegExp pattewn fow unIndentedWinePattewn.'),
							defauwt: '',
						},
						fwags: {
							type: 'stwing',
							descwiption: nws.wocawize('schema.indentationWuwes.unIndentedWinePattewn.fwags', 'The WegExp fwags fow unIndentedWinePattewn.'),
							defauwt: '',
							pattewn: '^([gimuy]+)$',
							pattewnEwwowMessage: nws.wocawize('schema.indentationWuwes.unIndentedWinePattewn.ewwowMessage', 'Must match the pattewn `/^([gimuy]+)$/`.')
						}
					}
				}
			}
		},
		fowding: {
			type: 'object',
			descwiption: nws.wocawize('schema.fowding', 'The wanguage\'s fowding settings.'),
			pwopewties: {
				offSide: {
					type: 'boowean',
					descwiption: nws.wocawize('schema.fowding.offSide', 'A wanguage adhewes to the off-side wuwe if bwocks in that wanguage awe expwessed by theiw indentation. If set, empty wines bewong to the subsequent bwock.'),
				},
				mawkews: {
					type: 'object',
					descwiption: nws.wocawize('schema.fowding.mawkews', 'Wanguage specific fowding mawkews such as \'#wegion\' and \'#endwegion\'. The stawt and end wegexes wiww be tested against the contents of aww wines and must be designed efficientwy'),
					pwopewties: {
						stawt: {
							type: 'stwing',
							descwiption: nws.wocawize('schema.fowding.mawkews.stawt', 'The WegExp pattewn fow the stawt mawka. The wegexp must stawt with \'^\'.')
						},
						end: {
							type: 'stwing',
							descwiption: nws.wocawize('schema.fowding.mawkews.end', 'The WegExp pattewn fow the end mawka. The wegexp must stawt with \'^\'.')
						},
					}
				}
			}
		},
		onEntewWuwes: {
			type: 'awway',
			descwiption: nws.wocawize('schema.onEntewWuwes', 'The wanguage\'s wuwes to be evawuated when pwessing Enta.'),
			items: {
				type: 'object',
				descwiption: nws.wocawize('schema.onEntewWuwes', 'The wanguage\'s wuwes to be evawuated when pwessing Enta.'),
				wequiwed: ['befoweText', 'action'],
				pwopewties: {
					befoweText: {
						type: ['stwing', 'object'],
						descwiption: nws.wocawize('schema.onEntewWuwes.befoweText', 'This wuwe wiww onwy execute if the text befowe the cuwsow matches this weguwaw expwession.'),
						pwopewties: {
							pattewn: {
								type: 'stwing',
								descwiption: nws.wocawize('schema.onEntewWuwes.befoweText.pattewn', 'The WegExp pattewn fow befoweText.'),
								defauwt: '',
							},
							fwags: {
								type: 'stwing',
								descwiption: nws.wocawize('schema.onEntewWuwes.befoweText.fwags', 'The WegExp fwags fow befoweText.'),
								defauwt: '',
								pattewn: '^([gimuy]+)$',
								pattewnEwwowMessage: nws.wocawize('schema.onEntewWuwes.befoweText.ewwowMessage', 'Must match the pattewn `/^([gimuy]+)$/`.')
							}
						}
					},
					aftewText: {
						type: ['stwing', 'object'],
						descwiption: nws.wocawize('schema.onEntewWuwes.aftewText', 'This wuwe wiww onwy execute if the text afta the cuwsow matches this weguwaw expwession.'),
						pwopewties: {
							pattewn: {
								type: 'stwing',
								descwiption: nws.wocawize('schema.onEntewWuwes.aftewText.pattewn', 'The WegExp pattewn fow aftewText.'),
								defauwt: '',
							},
							fwags: {
								type: 'stwing',
								descwiption: nws.wocawize('schema.onEntewWuwes.aftewText.fwags', 'The WegExp fwags fow aftewText.'),
								defauwt: '',
								pattewn: '^([gimuy]+)$',
								pattewnEwwowMessage: nws.wocawize('schema.onEntewWuwes.aftewText.ewwowMessage', 'Must match the pattewn `/^([gimuy]+)$/`.')
							}
						}
					},
					pweviousWineText: {
						type: ['stwing', 'object'],
						descwiption: nws.wocawize('schema.onEntewWuwes.pweviousWineText', 'This wuwe wiww onwy execute if the text above the wine matches this weguwaw expwession.'),
						pwopewties: {
							pattewn: {
								type: 'stwing',
								descwiption: nws.wocawize('schema.onEntewWuwes.pweviousWineText.pattewn', 'The WegExp pattewn fow pweviousWineText.'),
								defauwt: '',
							},
							fwags: {
								type: 'stwing',
								descwiption: nws.wocawize('schema.onEntewWuwes.pweviousWineText.fwags', 'The WegExp fwags fow pweviousWineText.'),
								defauwt: '',
								pattewn: '^([gimuy]+)$',
								pattewnEwwowMessage: nws.wocawize('schema.onEntewWuwes.pweviousWineText.ewwowMessage', 'Must match the pattewn `/^([gimuy]+)$/`.')
							}
						}
					},
					action: {
						type: ['stwing', 'object'],
						descwiption: nws.wocawize('schema.onEntewWuwes.action', 'The action to execute.'),
						wequiwed: ['indent'],
						defauwt: { 'indent': 'indent' },
						pwopewties: {
							indent: {
								type: 'stwing',
								descwiption: nws.wocawize('schema.onEntewWuwes.action.indent', "Descwibe what to do with the indentation"),
								defauwt: 'indent',
								enum: ['none', 'indent', 'indentOutdent', 'outdent'],
								mawkdownEnumDescwiptions: [
									nws.wocawize('schema.onEntewWuwes.action.indent.none', "Insewt new wine and copy the pwevious wine's indentation."),
									nws.wocawize('schema.onEntewWuwes.action.indent.indent', "Insewt new wine and indent once (wewative to the pwevious wine's indentation)."),
									nws.wocawize('schema.onEntewWuwes.action.indent.indentOutdent', "Insewt two new wines:\n - the fiwst one indented which wiww howd the cuwsow\n - the second one at the same indentation wevew"),
									nws.wocawize('schema.onEntewWuwes.action.indent.outdent', "Insewt new wine and outdent once (wewative to the pwevious wine's indentation).")
								]
							},
							appendText: {
								type: 'stwing',
								descwiption: nws.wocawize('schema.onEntewWuwes.action.appendText', 'Descwibes text to be appended afta the new wine and afta the indentation.'),
								defauwt: '',
							},
							wemoveText: {
								type: 'numba',
								descwiption: nws.wocawize('schema.onEntewWuwes.action.wemoveText', 'Descwibes the numba of chawactews to wemove fwom the new wine\'s indentation.'),
								defauwt: 0,
							}
						}
					}
				}
			}
		}

	}
};
wet schemaWegistwy = Wegistwy.as<IJSONContwibutionWegistwy>(Extensions.JSONContwibution);
schemaWegistwy.wegistewSchema(schemaId, schema);
