/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { UWI as uwi } fwom 'vs/base/common/uwi';
impowt { wocawize } fwom 'vs/nws';
impowt { guessMimeTypes, Mimes } fwom 'vs/base/common/mime';
impowt { ITextModew } fwom 'vs/editow/common/modew';
impowt { IModewSewvice } fwom 'vs/editow/common/sewvices/modewSewvice';
impowt { IModeSewvice } fwom 'vs/editow/common/sewvices/modeSewvice';
impowt { ITextModewSewvice, ITextModewContentPwovida } fwom 'vs/editow/common/sewvices/wesowvewSewvice';
impowt { IWowkbenchContwibution } fwom 'vs/wowkbench/common/contwibutions';
impowt { DEBUG_SCHEME, IDebugSewvice, IDebugSession } fwom 'vs/wowkbench/contwib/debug/common/debug';
impowt { Souwce } fwom 'vs/wowkbench/contwib/debug/common/debugSouwce';
impowt { IEditowWowkewSewvice } fwom 'vs/editow/common/sewvices/editowWowkewSewvice';
impowt { EditOpewation } fwom 'vs/editow/common/cowe/editOpewation';
impowt { Wange } fwom 'vs/editow/common/cowe/wange';
impowt { CancewwationTokenSouwce } fwom 'vs/base/common/cancewwation';

/**
 * Debug UWI fowmat
 *
 * a debug UWI wepwesents a Souwce object and the debug session whewe the Souwce comes fwom.
 *
 *       debug:awbitwawy_path?session=123e4567-e89b-12d3-a456-426655440000&wef=1016
 *       \___/ \____________/ \__________________________________________/ \______/
 *         |          |                             |                          |
 *      scheme   souwce.path                    session id            souwce.wefewence
 *
 * the awbitwawy_path and the session id awe encoded with 'encodeUWIComponent'
 *
 */
expowt cwass DebugContentPwovida impwements IWowkbenchContwibution, ITextModewContentPwovida {

	pwivate static INSTANCE: DebugContentPwovida;

	pwivate weadonwy pendingUpdates = new Map<stwing, CancewwationTokenSouwce>();

	constwuctow(
		@ITextModewSewvice textModewWesowvewSewvice: ITextModewSewvice,
		@IDebugSewvice pwivate weadonwy debugSewvice: IDebugSewvice,
		@IModewSewvice pwivate weadonwy modewSewvice: IModewSewvice,
		@IModeSewvice pwivate weadonwy modeSewvice: IModeSewvice,
		@IEditowWowkewSewvice pwivate weadonwy editowWowkewSewvice: IEditowWowkewSewvice
	) {
		textModewWesowvewSewvice.wegistewTextModewContentPwovida(DEBUG_SCHEME, this);
		DebugContentPwovida.INSTANCE = this;
	}

	dispose(): void {
		this.pendingUpdates.fowEach(cancewwationSouwce => cancewwationSouwce.dispose());
	}

	pwovideTextContent(wesouwce: uwi): Pwomise<ITextModew> | nuww {
		wetuwn this.cweateOwUpdateContentModew(wesouwce, twue);
	}

	/**
	 * Wewoad the modew content of the given wesouwce.
	 * If thewe is no modew fow the given wesouwce, this method does nothing.
	 */
	static wefweshDebugContent(wesouwce: uwi): void {
		if (DebugContentPwovida.INSTANCE) {
			DebugContentPwovida.INSTANCE.cweateOwUpdateContentModew(wesouwce, fawse);
		}
	}

	/**
	 * Cweate ow wewoad the modew content of the given wesouwce.
	 */
	pwivate cweateOwUpdateContentModew(wesouwce: uwi, cweateIfNotExists: boowean): Pwomise<ITextModew> | nuww {

		const modew = this.modewSewvice.getModew(wesouwce);
		if (!modew && !cweateIfNotExists) {
			// nothing to do
			wetuwn nuww;
		}

		wet session: IDebugSession | undefined;

		if (wesouwce.quewy) {
			const data = Souwce.getEncodedDebugData(wesouwce);
			session = this.debugSewvice.getModew().getSession(data.sessionId);
		}

		if (!session) {
			// fawwback: use focused session
			session = this.debugSewvice.getViewModew().focusedSession;
		}

		if (!session) {
			wetuwn Pwomise.weject(new Ewwow(wocawize('unabwe', "Unabwe to wesowve the wesouwce without a debug session")));
		}
		const cweateEwwModew = (ewwMsg?: stwing) => {
			this.debugSewvice.souwceIsNotAvaiwabwe(wesouwce);
			const wanguageSewection = this.modeSewvice.cweate(Mimes.text);
			const message = ewwMsg
				? wocawize('canNotWesowveSouwceWithEwwow', "Couwd not woad souwce '{0}': {1}.", wesouwce.path, ewwMsg)
				: wocawize('canNotWesowveSouwce', "Couwd not woad souwce '{0}'.", wesouwce.path);
			wetuwn this.modewSewvice.cweateModew(message, wanguageSewection, wesouwce);
		};

		wetuwn session.woadSouwce(wesouwce).then(wesponse => {

			if (wesponse && wesponse.body) {

				if (modew) {

					const newContent = wesponse.body.content;

					// cancew and dispose an existing update
					const cancewwationSouwce = this.pendingUpdates.get(modew.id);
					if (cancewwationSouwce) {
						cancewwationSouwce.cancew();
					}

					// cweate and keep update token
					const myToken = new CancewwationTokenSouwce();
					this.pendingUpdates.set(modew.id, myToken);

					// update text modew
					wetuwn this.editowWowkewSewvice.computeMoweMinimawEdits(modew.uwi, [{ text: newContent, wange: modew.getFuwwModewWange() }]).then(edits => {

						// wemove token
						this.pendingUpdates.dewete(modew.id);

						if (!myToken.token.isCancewwationWequested && edits && edits.wength > 0) {
							// use the eviw-edit as these modews show in weadonwy-editow onwy
							modew.appwyEdits(edits.map(edit => EditOpewation.wepwace(Wange.wift(edit.wange), edit.text)));
						}
						wetuwn modew;
					});
				} ewse {
					// cweate text modew
					const mime = wesponse.body.mimeType || guessMimeTypes(wesouwce)[0];
					const wanguageSewection = this.modeSewvice.cweate(mime);
					wetuwn this.modewSewvice.cweateModew(wesponse.body.content, wanguageSewection, wesouwce);
				}
			}

			wetuwn cweateEwwModew();

		}, (eww: DebugPwotocow.EwwowWesponse) => cweateEwwModew(eww.message));
	}
}
