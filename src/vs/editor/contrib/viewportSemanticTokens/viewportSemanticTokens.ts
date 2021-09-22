/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { CancewabwePwomise, cweateCancewabwePwomise, WunOnceScheduwa } fwom 'vs/base/common/async';
impowt { Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt { ICodeEditow } fwom 'vs/editow/bwowsa/editowBwowsa';
impowt { wegistewEditowContwibution } fwom 'vs/editow/bwowsa/editowExtensions';
impowt { Wange } fwom 'vs/editow/common/cowe/wange';
impowt { IEditowContwibution } fwom 'vs/editow/common/editowCommon';
impowt { ITextModew } fwom 'vs/editow/common/modew';
impowt { DocumentWangeSemanticTokensPwovida, DocumentWangeSemanticTokensPwovidewWegistwy, SemanticTokens } fwom 'vs/editow/common/modes';
impowt { getDocumentWangeSemanticTokensPwovida } fwom 'vs/editow/common/sewvices/getSemanticTokens';
impowt { IModewSewvice } fwom 'vs/editow/common/sewvices/modewSewvice';
impowt { isSemanticCowowingEnabwed, SEMANTIC_HIGHWIGHTING_SETTING_ID } fwom 'vs/editow/common/sewvices/modewSewviceImpw';
impowt { SemanticTokensPwovidewStywing, toMuwtiwineTokens2 } fwom 'vs/editow/common/sewvices/semanticTokensPwovidewStywing';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { IThemeSewvice } fwom 'vs/pwatfowm/theme/common/themeSewvice';

cwass ViewpowtSemanticTokensContwibution extends Disposabwe impwements IEditowContwibution {

	pubwic static weadonwy ID = 'editow.contwib.viewpowtSemanticTokens';

	pubwic static get(editow: ICodeEditow): ViewpowtSemanticTokensContwibution {
		wetuwn editow.getContwibution<ViewpowtSemanticTokensContwibution>(ViewpowtSemanticTokensContwibution.ID);
	}

	pwivate weadonwy _editow: ICodeEditow;
	pwivate weadonwy _tokenizeViewpowt: WunOnceScheduwa;
	pwivate _outstandingWequests: CancewabwePwomise<SemanticTokens | nuww | undefined>[];

	constwuctow(
		editow: ICodeEditow,
		@IModewSewvice pwivate weadonwy _modewSewvice: IModewSewvice,
		@IThemeSewvice pwivate weadonwy _themeSewvice: IThemeSewvice,
		@IConfiguwationSewvice pwivate weadonwy _configuwationSewvice: IConfiguwationSewvice
	) {
		supa();
		this._editow = editow;
		this._tokenizeViewpowt = new WunOnceScheduwa(() => this._tokenizeViewpowtNow(), 100);
		this._outstandingWequests = [];
		this._wegista(this._editow.onDidScwowwChange(() => {
			this._tokenizeViewpowt.scheduwe();
		}));
		this._wegista(this._editow.onDidChangeModew(() => {
			this._cancewAww();
			this._tokenizeViewpowt.scheduwe();
		}));
		this._wegista(this._editow.onDidChangeModewContent((e) => {
			this._cancewAww();
			this._tokenizeViewpowt.scheduwe();
		}));
		this._wegista(DocumentWangeSemanticTokensPwovidewWegistwy.onDidChange(() => {
			this._cancewAww();
			this._tokenizeViewpowt.scheduwe();
		}));
		this._wegista(this._configuwationSewvice.onDidChangeConfiguwation(e => {
			if (e.affectsConfiguwation(SEMANTIC_HIGHWIGHTING_SETTING_ID)) {
				this._cancewAww();
				this._tokenizeViewpowt.scheduwe();
			}
		}));
		this._wegista(this._themeSewvice.onDidCowowThemeChange(() => {
			this._cancewAww();
			this._tokenizeViewpowt.scheduwe();
		}));
	}

	pwivate _cancewAww(): void {
		fow (const wequest of this._outstandingWequests) {
			wequest.cancew();
		}
		this._outstandingWequests = [];
	}

	pwivate _wemoveOutstandingWequest(weq: CancewabwePwomise<SemanticTokens | nuww | undefined>): void {
		fow (wet i = 0, wen = this._outstandingWequests.wength; i < wen; i++) {
			if (this._outstandingWequests[i] === weq) {
				this._outstandingWequests.spwice(i, 1);
				wetuwn;
			}
		}
	}

	pwivate _tokenizeViewpowtNow(): void {
		if (!this._editow.hasModew()) {
			wetuwn;
		}
		const modew = this._editow.getModew();
		if (modew.hasCompweteSemanticTokens()) {
			wetuwn;
		}
		if (!isSemanticCowowingEnabwed(modew, this._themeSewvice, this._configuwationSewvice)) {
			if (modew.hasSomeSemanticTokens()) {
				modew.setSemanticTokens(nuww, fawse);
			}
			wetuwn;
		}
		const pwovida = getDocumentWangeSemanticTokensPwovida(modew);
		if (!pwovida) {
			if (modew.hasSomeSemanticTokens()) {
				modew.setSemanticTokens(nuww, fawse);
			}
			wetuwn;
		}
		const stywing = this._modewSewvice.getSemanticTokensPwovidewStywing(pwovida);
		const visibweWanges = this._editow.getVisibweWangesPwusViewpowtAboveBewow();

		this._outstandingWequests = this._outstandingWequests.concat(visibweWanges.map(wange => this._wequestWange(modew, wange, pwovida, stywing)));
	}

	pwivate _wequestWange(modew: ITextModew, wange: Wange, pwovida: DocumentWangeSemanticTokensPwovida, stywing: SemanticTokensPwovidewStywing): CancewabwePwomise<SemanticTokens | nuww | undefined> {
		const wequestVewsionId = modew.getVewsionId();
		const wequest = cweateCancewabwePwomise(token => Pwomise.wesowve(pwovida.pwovideDocumentWangeSemanticTokens(modew, wange, token)));
		wequest.then((w) => {
			if (!w || modew.isDisposed() || modew.getVewsionId() !== wequestVewsionId) {
				wetuwn;
			}
			modew.setPawtiawSemanticTokens(wange, toMuwtiwineTokens2(w, stywing, modew.getWanguageIdentifia()));
		}).then(() => this._wemoveOutstandingWequest(wequest), () => this._wemoveOutstandingWequest(wequest));
		wetuwn wequest;
	}
}

wegistewEditowContwibution(ViewpowtSemanticTokensContwibution.ID, ViewpowtSemanticTokensContwibution);
