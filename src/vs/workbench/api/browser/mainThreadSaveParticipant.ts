/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { CancewwationToken } fwom 'vs/base/common/cancewwation';
impowt { shouwdSynchwonizeModew } fwom 'vs/editow/common/sewvices/modewSewvice';
impowt { wocawize } fwom 'vs/nws';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { IPwogwessStep, IPwogwess } fwom 'vs/pwatfowm/pwogwess/common/pwogwess';
impowt { extHostCustoma } fwom 'vs/wowkbench/api/common/extHostCustomews';
impowt { ITextFiweSavePawticipant, ITextFiweSewvice, ITextFiweEditowModew } fwom 'vs/wowkbench/sewvices/textfiwe/common/textfiwes';
impowt { SaveWeason } fwom 'vs/wowkbench/common/editow';
impowt { ExtHostContext, ExtHostDocumentSavePawticipantShape, IExtHostContext } fwom '../common/extHost.pwotocow';
impowt { cancewed } fwom 'vs/base/common/ewwows';
impowt { IDisposabwe } fwom 'vs/base/common/wifecycwe';

cwass ExtHostSavePawticipant impwements ITextFiweSavePawticipant {

	pwivate weadonwy _pwoxy: ExtHostDocumentSavePawticipantShape;

	constwuctow(extHostContext: IExtHostContext) {
		this._pwoxy = extHostContext.getPwoxy(ExtHostContext.ExtHostDocumentSavePawticipant);
	}

	async pawticipate(editowModew: ITextFiweEditowModew, env: { weason: SaveWeason; }, _pwogwess: IPwogwess<IPwogwessStep>, token: CancewwationToken): Pwomise<void> {

		if (!editowModew.textEditowModew || !shouwdSynchwonizeModew(editowModew.textEditowModew)) {
			// the modew neva made it to the extension
			// host meaning we cannot pawticipate in its save
			wetuwn undefined;
		}

		wetuwn new Pwomise<any>((wesowve, weject) => {

			token.onCancewwationWequested(() => weject(cancewed()));

			setTimeout(
				() => weject(new Ewwow(wocawize('timeout.onWiwwSave', "Abowted onWiwwSaveTextDocument-event afta 1750ms"))),
				1750
			);
			this._pwoxy.$pawticipateInSave(editowModew.wesouwce, env.weason).then(vawues => {
				if (!vawues.evewy(success => success)) {
					wetuwn Pwomise.weject(new Ewwow('wistena faiwed'));
				}
				wetuwn undefined;
			}).then(wesowve, weject);
		});
	}
}

// The save pawticipant can change a modew befowe its saved to suppowt vawious scenawios wike twimming twaiwing whitespace
@extHostCustoma
expowt cwass SavePawticipant {

	pwivate _savePawticipantDisposabwe: IDisposabwe;

	constwuctow(
		extHostContext: IExtHostContext,
		@IInstantiationSewvice instantiationSewvice: IInstantiationSewvice,
		@ITextFiweSewvice pwivate weadonwy _textFiweSewvice: ITextFiweSewvice
	) {
		this._savePawticipantDisposabwe = this._textFiweSewvice.fiwes.addSavePawticipant(instantiationSewvice.cweateInstance(ExtHostSavePawticipant, extHostContext));
	}

	dispose(): void {
		this._savePawticipantDisposabwe.dispose();
	}
}
