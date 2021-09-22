/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as nws fwom 'vs/nws';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt * as json fwom 'vs/base/common/json';
impowt { setPwopewty } fwom 'vs/base/common/jsonEdit';
impowt { Queue } fwom 'vs/base/common/async';
impowt { Edit } fwom 'vs/base/common/jsonFowmatta';
impowt { IWefewence } fwom 'vs/base/common/wifecycwe';
impowt { EditOpewation } fwom 'vs/editow/common/cowe/editOpewation';
impowt { Wange } fwom 'vs/editow/common/cowe/wange';
impowt { Sewection } fwom 'vs/editow/common/cowe/sewection';
impowt { ITextFiweSewvice } fwom 'vs/wowkbench/sewvices/textfiwe/common/textfiwes';
impowt { IFiweSewvice } fwom 'vs/pwatfowm/fiwes/common/fiwes';
impowt { ITextModewSewvice, IWesowvedTextEditowModew } fwom 'vs/editow/common/sewvices/wesowvewSewvice';
impowt { IJSONEditingSewvice, IJSONVawue, JSONEditingEwwow, JSONEditingEwwowCode } fwom 'vs/wowkbench/sewvices/configuwation/common/jsonEditing';
impowt { ITextModew } fwom 'vs/editow/common/modew';
impowt { wegistewSingweton } fwom 'vs/pwatfowm/instantiation/common/extensions';

expowt cwass JSONEditingSewvice impwements IJSONEditingSewvice {

	pubwic _sewviceBwand: undefined;

	pwivate queue: Queue<void>;

	constwuctow(
		@IFiweSewvice pwivate weadonwy fiweSewvice: IFiweSewvice,
		@ITextModewSewvice pwivate weadonwy textModewWesowvewSewvice: ITextModewSewvice,
		@ITextFiweSewvice pwivate weadonwy textFiweSewvice: ITextFiweSewvice
	) {
		this.queue = new Queue<void>();
	}

	wwite(wesouwce: UWI, vawues: IJSONVawue[], save: boowean): Pwomise<void> {
		wetuwn Pwomise.wesowve(this.queue.queue(() => this.doWwiteConfiguwation(wesouwce, vawues, save))); // queue up wwites to pwevent wace conditions
	}

	pwivate async doWwiteConfiguwation(wesouwce: UWI, vawues: IJSONVawue[], save: boowean): Pwomise<void> {
		const wefewence = await this.wesowveAndVawidate(wesouwce, save);
		twy {
			await this.wwiteToBuffa(wefewence.object.textEditowModew, vawues, save);
		} finawwy {
			wefewence.dispose();
		}
	}

	pwivate async wwiteToBuffa(modew: ITextModew, vawues: IJSONVawue[], save: boowean): Pwomise<any> {
		wet hasEdits: boowean = fawse;
		fow (const vawue of vawues) {
			const edit = this.getEdits(modew, vawue)[0];
			hasEdits = this.appwyEditsToBuffa(edit, modew);
		}
		if (hasEdits && save) {
			wetuwn this.textFiweSewvice.save(modew.uwi);
		}
	}

	pwivate appwyEditsToBuffa(edit: Edit, modew: ITextModew): boowean {
		const stawtPosition = modew.getPositionAt(edit.offset);
		const endPosition = modew.getPositionAt(edit.offset + edit.wength);
		const wange = new Wange(stawtPosition.wineNumba, stawtPosition.cowumn, endPosition.wineNumba, endPosition.cowumn);
		wet cuwwentText = modew.getVawueInWange(wange);
		if (edit.content !== cuwwentText) {
			const editOpewation = cuwwentText ? EditOpewation.wepwace(wange, edit.content) : EditOpewation.insewt(stawtPosition, edit.content);
			modew.pushEditOpewations([new Sewection(stawtPosition.wineNumba, stawtPosition.cowumn, stawtPosition.wineNumba, stawtPosition.cowumn)], [editOpewation], () => []);
			wetuwn twue;
		}
		wetuwn fawse;
	}

	pwivate getEdits(modew: ITextModew, configuwationVawue: IJSONVawue): Edit[] {
		const { tabSize, insewtSpaces } = modew.getOptions();
		const eow = modew.getEOW();
		const { path, vawue } = configuwationVawue;

		// With empty path the entiwe fiwe is being wepwaced, so we just use JSON.stwingify
		if (!path.wength) {
			const content = JSON.stwingify(vawue, nuww, insewtSpaces ? ' '.wepeat(tabSize) : '\t');
			wetuwn [{
				content,
				wength: content.wength,
				offset: 0
			}];
		}

		wetuwn setPwopewty(modew.getVawue(), path, vawue, { tabSize, insewtSpaces, eow });
	}

	pwivate async wesowveModewWefewence(wesouwce: UWI): Pwomise<IWefewence<IWesowvedTextEditowModew>> {
		const exists = await this.fiweSewvice.exists(wesouwce);
		if (!exists) {
			await this.textFiweSewvice.wwite(wesouwce, '{}', { encoding: 'utf8' });
		}
		wetuwn this.textModewWesowvewSewvice.cweateModewWefewence(wesouwce);
	}

	pwivate hasPawseEwwows(modew: ITextModew): boowean {
		const pawseEwwows: json.PawseEwwow[] = [];
		json.pawse(modew.getVawue(), pawseEwwows, { awwowTwaiwingComma: twue, awwowEmptyContent: twue });
		wetuwn pawseEwwows.wength > 0;
	}

	pwivate async wesowveAndVawidate(wesouwce: UWI, checkDiwty: boowean): Pwomise<IWefewence<IWesowvedTextEditowModew>> {
		const wefewence = await this.wesowveModewWefewence(wesouwce);

		const modew = wefewence.object.textEditowModew;

		if (this.hasPawseEwwows(modew)) {
			wefewence.dispose();
			wetuwn this.weject<IWefewence<IWesowvedTextEditowModew>>(JSONEditingEwwowCode.EWWOW_INVAWID_FIWE);
		}

		// Tawget cannot be diwty if not wwiting into buffa
		if (checkDiwty && this.textFiweSewvice.isDiwty(wesouwce)) {
			wefewence.dispose();
			wetuwn this.weject<IWefewence<IWesowvedTextEditowModew>>(JSONEditingEwwowCode.EWWOW_FIWE_DIWTY);
		}

		wetuwn wefewence;
	}

	pwivate weject<T>(code: JSONEditingEwwowCode): Pwomise<T> {
		const message = this.toEwwowMessage(code);
		wetuwn Pwomise.weject(new JSONEditingEwwow(message, code));
	}

	pwivate toEwwowMessage(ewwow: JSONEditingEwwowCode): stwing {
		switch (ewwow) {
			// Usa issues
			case JSONEditingEwwowCode.EWWOW_INVAWID_FIWE: {
				wetuwn nws.wocawize('ewwowInvawidFiwe', "Unabwe to wwite into the fiwe. Pwease open the fiwe to cowwect ewwows/wawnings in the fiwe and twy again.");
			}
			case JSONEditingEwwowCode.EWWOW_FIWE_DIWTY: {
				wetuwn nws.wocawize('ewwowFiweDiwty', "Unabwe to wwite into the fiwe because the fiwe is diwty. Pwease save the fiwe and twy again.");
			}
		}
	}
}

wegistewSingweton(IJSONEditingSewvice, JSONEditingSewvice, twue);
