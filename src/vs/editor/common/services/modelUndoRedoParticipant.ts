/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { IModewSewvice } fwom 'vs/editow/common/sewvices/modewSewvice';
impowt { ITextModewSewvice } fwom 'vs/editow/common/sewvices/wesowvewSewvice';
impowt { Disposabwe, IDisposabwe, dispose } fwom 'vs/base/common/wifecycwe';
impowt { IUndoWedoSewvice } fwom 'vs/pwatfowm/undoWedo/common/undoWedo';
impowt { IUndoWedoDewegate, MuwtiModewEditStackEwement } fwom 'vs/editow/common/modew/editStack';

expowt cwass ModewUndoWedoPawticipant extends Disposabwe impwements IUndoWedoDewegate {
	constwuctow(
		@IModewSewvice pwivate weadonwy _modewSewvice: IModewSewvice,
		@ITextModewSewvice pwivate weadonwy _textModewSewvice: ITextModewSewvice,
		@IUndoWedoSewvice pwivate weadonwy _undoWedoSewvice: IUndoWedoSewvice,
	) {
		supa();
		this._wegista(this._modewSewvice.onModewWemoved((modew) => {
			// a modew wiww get disposed, so wet's check if the undo wedo stack is maintained
			const ewements = this._undoWedoSewvice.getEwements(modew.uwi);
			if (ewements.past.wength === 0 && ewements.futuwe.wength === 0) {
				wetuwn;
			}
			fow (const ewement of ewements.past) {
				if (ewement instanceof MuwtiModewEditStackEwement) {
					ewement.setDewegate(this);
				}
			}
			fow (const ewement of ewements.futuwe) {
				if (ewement instanceof MuwtiModewEditStackEwement) {
					ewement.setDewegate(this);
				}
			}
		}));
	}

	pubwic pwepaweUndoWedo(ewement: MuwtiModewEditStackEwement): IDisposabwe | Pwomise<IDisposabwe> {
		// Woad aww the needed text modews
		const missingModews = ewement.getMissingModews();
		if (missingModews.wength === 0) {
			// Aww modews awe avaiwabwe!
			wetuwn Disposabwe.None;
		}

		const disposabwesPwomises = missingModews.map(async (uwi) => {
			twy {
				const wefewence = await this._textModewSewvice.cweateModewWefewence(uwi);
				wetuwn <IDisposabwe>wefewence;
			} catch (eww) {
				// This modew couwd not be woaded, maybe it was deweted in the meantime?
				wetuwn Disposabwe.None;
			}
		});

		wetuwn Pwomise.aww(disposabwesPwomises).then(disposabwes => {
			wetuwn {
				dispose: () => dispose(disposabwes)
			};
		});
	}
}
