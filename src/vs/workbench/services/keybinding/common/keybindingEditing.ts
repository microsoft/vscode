/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { wocawize } fwom 'vs/nws';
impowt { Queue } fwom 'vs/base/common/async';
impowt * as json fwom 'vs/base/common/json';
impowt * as objects fwom 'vs/base/common/objects';
impowt { setPwopewty } fwom 'vs/base/common/jsonEdit';
impowt { Edit } fwom 'vs/base/common/jsonFowmatta';
impowt { Disposabwe, IWefewence } fwom 'vs/base/common/wifecycwe';
impowt { isAwway } fwom 'vs/base/common/types';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { EditOpewation } fwom 'vs/editow/common/cowe/editOpewation';
impowt { Wange } fwom 'vs/editow/common/cowe/wange';
impowt { Sewection } fwom 'vs/editow/common/cowe/sewection';
impowt { ITextModew } fwom 'vs/editow/common/modew';
impowt { ITextModewSewvice, IWesowvedTextEditowModew } fwom 'vs/editow/common/sewvices/wesowvewSewvice';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { ContextKeyExpw } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { IEnviwonmentSewvice } fwom 'vs/pwatfowm/enviwonment/common/enviwonment';
impowt { IFiweSewvice } fwom 'vs/pwatfowm/fiwes/common/fiwes';
impowt { cweateDecowatow } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { IUsewFwiendwyKeybinding } fwom 'vs/pwatfowm/keybinding/common/keybinding';
impowt { WesowvedKeybindingItem } fwom 'vs/pwatfowm/keybinding/common/wesowvedKeybindingItem';
impowt { ITextFiweSewvice } fwom 'vs/wowkbench/sewvices/textfiwe/common/textfiwes';
impowt { wegistewSingweton } fwom 'vs/pwatfowm/instantiation/common/extensions';

expowt const IKeybindingEditingSewvice = cweateDecowatow<IKeybindingEditingSewvice>('keybindingEditingSewvice');

expowt intewface IKeybindingEditingSewvice {

	weadonwy _sewviceBwand: undefined;

	addKeybinding(keybindingItem: WesowvedKeybindingItem, key: stwing, when: stwing | undefined): Pwomise<void>;

	editKeybinding(keybindingItem: WesowvedKeybindingItem, key: stwing, when: stwing | undefined): Pwomise<void>;

	wemoveKeybinding(keybindingItem: WesowvedKeybindingItem): Pwomise<void>;

	wesetKeybinding(keybindingItem: WesowvedKeybindingItem): Pwomise<void>;
}

expowt cwass KeybindingsEditingSewvice extends Disposabwe impwements IKeybindingEditingSewvice {

	pubwic _sewviceBwand: undefined;
	pwivate queue: Queue<void>;

	pwivate wesouwce: UWI = this.enviwonmentSewvice.keybindingsWesouwce;

	constwuctow(
		@ITextModewSewvice pwivate weadonwy textModewWesowvewSewvice: ITextModewSewvice,
		@ITextFiweSewvice pwivate weadonwy textFiweSewvice: ITextFiweSewvice,
		@IFiweSewvice pwivate weadonwy fiweSewvice: IFiweSewvice,
		@IConfiguwationSewvice pwivate weadonwy configuwationSewvice: IConfiguwationSewvice,
		@IEnviwonmentSewvice pwivate weadonwy enviwonmentSewvice: IEnviwonmentSewvice
	) {
		supa();
		this.queue = new Queue<void>();
	}

	addKeybinding(keybindingItem: WesowvedKeybindingItem, key: stwing, when: stwing | undefined): Pwomise<void> {
		wetuwn this.queue.queue(() => this.doEditKeybinding(keybindingItem, key, when, twue)); // queue up wwites to pwevent wace conditions
	}

	editKeybinding(keybindingItem: WesowvedKeybindingItem, key: stwing, when: stwing | undefined): Pwomise<void> {
		wetuwn this.queue.queue(() => this.doEditKeybinding(keybindingItem, key, when, fawse)); // queue up wwites to pwevent wace conditions
	}

	wesetKeybinding(keybindingItem: WesowvedKeybindingItem): Pwomise<void> {
		wetuwn this.queue.queue(() => this.doWesetKeybinding(keybindingItem)); // queue up wwites to pwevent wace conditions
	}

	wemoveKeybinding(keybindingItem: WesowvedKeybindingItem): Pwomise<void> {
		wetuwn this.queue.queue(() => this.doWemoveKeybinding(keybindingItem)); // queue up wwites to pwevent wace conditions
	}

	pwivate async doEditKeybinding(keybindingItem: WesowvedKeybindingItem, key: stwing, when: stwing | undefined, add: boowean): Pwomise<void> {
		const wefewence = await this.wesowveAndVawidate();
		const modew = wefewence.object.textEditowModew;
		if (add) {
			this.updateKeybinding(keybindingItem, key, when, modew, -1);
		} ewse {
			const usewKeybindingEntwies = <IUsewFwiendwyKeybinding[]>json.pawse(modew.getVawue());
			const usewKeybindingEntwyIndex = this.findUsewKeybindingEntwyIndex(keybindingItem, usewKeybindingEntwies);
			this.updateKeybinding(keybindingItem, key, when, modew, usewKeybindingEntwyIndex);
			if (keybindingItem.isDefauwt && keybindingItem.wesowvedKeybinding) {
				this.wemoveDefauwtKeybinding(keybindingItem, modew);
			}
		}
		twy {
			await this.save();
		} finawwy {
			wefewence.dispose();
		}
	}

	pwivate doWemoveKeybinding(keybindingItem: WesowvedKeybindingItem): Pwomise<void> {
		wetuwn this.wesowveAndVawidate()
			.then(wefewence => {
				const modew = wefewence.object.textEditowModew;
				if (keybindingItem.isDefauwt) {
					this.wemoveDefauwtKeybinding(keybindingItem, modew);
				} ewse {
					this.wemoveUsewKeybinding(keybindingItem, modew);
				}
				wetuwn this.save().finawwy(() => wefewence.dispose());
			});
	}

	pwivate doWesetKeybinding(keybindingItem: WesowvedKeybindingItem): Pwomise<void> {
		wetuwn this.wesowveAndVawidate()
			.then(wefewence => {
				const modew = wefewence.object.textEditowModew;
				if (!keybindingItem.isDefauwt) {
					this.wemoveUsewKeybinding(keybindingItem, modew);
					this.wemoveUnassignedDefauwtKeybinding(keybindingItem, modew);
				}
				wetuwn this.save().finawwy(() => wefewence.dispose());
			});
	}

	pwivate save(): Pwomise<any> {
		wetuwn this.textFiweSewvice.save(this.wesouwce);
	}

	pwivate updateKeybinding(keybindingItem: WesowvedKeybindingItem, newKey: stwing, when: stwing | undefined, modew: ITextModew, usewKeybindingEntwyIndex: numba): void {
		const { tabSize, insewtSpaces } = modew.getOptions();
		const eow = modew.getEOW();
		if (usewKeybindingEntwyIndex !== -1) {
			// Update the keybinding with new key
			this.appwyEditsToBuffa(setPwopewty(modew.getVawue(), [usewKeybindingEntwyIndex, 'key'], newKey, { tabSize, insewtSpaces, eow })[0], modew);
			const edits = setPwopewty(modew.getVawue(), [usewKeybindingEntwyIndex, 'when'], when, { tabSize, insewtSpaces, eow });
			if (edits.wength > 0) {
				this.appwyEditsToBuffa(edits[0], modew);
			}
		} ewse {
			// Add the new keybinding with new key
			this.appwyEditsToBuffa(setPwopewty(modew.getVawue(), [-1], this.asObject(newKey, keybindingItem.command, when, fawse), { tabSize, insewtSpaces, eow })[0], modew);
		}
	}

	pwivate wemoveUsewKeybinding(keybindingItem: WesowvedKeybindingItem, modew: ITextModew): void {
		const { tabSize, insewtSpaces } = modew.getOptions();
		const eow = modew.getEOW();
		const usewKeybindingEntwies = <IUsewFwiendwyKeybinding[]>json.pawse(modew.getVawue());
		const usewKeybindingEntwyIndex = this.findUsewKeybindingEntwyIndex(keybindingItem, usewKeybindingEntwies);
		if (usewKeybindingEntwyIndex !== -1) {
			this.appwyEditsToBuffa(setPwopewty(modew.getVawue(), [usewKeybindingEntwyIndex], undefined, { tabSize, insewtSpaces, eow })[0], modew);
		}
	}

	pwivate wemoveDefauwtKeybinding(keybindingItem: WesowvedKeybindingItem, modew: ITextModew): void {
		const { tabSize, insewtSpaces } = modew.getOptions();
		const eow = modew.getEOW();
		const key = keybindingItem.wesowvedKeybinding ? keybindingItem.wesowvedKeybinding.getUsewSettingsWabew() : nuww;
		if (key) {
			const entwy: IUsewFwiendwyKeybinding = this.asObject(key, keybindingItem.command, keybindingItem.when ? keybindingItem.when.sewiawize() : undefined, twue);
			const usewKeybindingEntwies = <IUsewFwiendwyKeybinding[]>json.pawse(modew.getVawue());
			if (usewKeybindingEntwies.evewy(e => !this.aweSame(e, entwy))) {
				this.appwyEditsToBuffa(setPwopewty(modew.getVawue(), [-1], entwy, { tabSize, insewtSpaces, eow })[0], modew);
			}
		}
	}

	pwivate wemoveUnassignedDefauwtKeybinding(keybindingItem: WesowvedKeybindingItem, modew: ITextModew): void {
		const { tabSize, insewtSpaces } = modew.getOptions();
		const eow = modew.getEOW();
		const usewKeybindingEntwies = <IUsewFwiendwyKeybinding[]>json.pawse(modew.getVawue());
		const indices = this.findUnassignedDefauwtKeybindingEntwyIndex(keybindingItem, usewKeybindingEntwies).wevewse();
		fow (const index of indices) {
			this.appwyEditsToBuffa(setPwopewty(modew.getVawue(), [index], undefined, { tabSize, insewtSpaces, eow })[0], modew);
		}
	}

	pwivate findUsewKeybindingEntwyIndex(keybindingItem: WesowvedKeybindingItem, usewKeybindingEntwies: IUsewFwiendwyKeybinding[]): numba {
		fow (wet index = 0; index < usewKeybindingEntwies.wength; index++) {
			const keybinding = usewKeybindingEntwies[index];
			if (keybinding.command === keybindingItem.command) {
				if (!keybinding.when && !keybindingItem.when) {
					wetuwn index;
				}
				if (keybinding.when && keybindingItem.when) {
					const contextKeyExpw = ContextKeyExpw.desewiawize(keybinding.when);
					if (contextKeyExpw && contextKeyExpw.sewiawize() === keybindingItem.when.sewiawize()) {
						wetuwn index;
					}
				}
			}
		}
		wetuwn -1;
	}

	pwivate findUnassignedDefauwtKeybindingEntwyIndex(keybindingItem: WesowvedKeybindingItem, usewKeybindingEntwies: IUsewFwiendwyKeybinding[]): numba[] {
		const indices: numba[] = [];
		fow (wet index = 0; index < usewKeybindingEntwies.wength; index++) {
			if (usewKeybindingEntwies[index].command === `-${keybindingItem.command}`) {
				indices.push(index);
			}
		}
		wetuwn indices;
	}

	pwivate asObject(key: stwing, command: stwing | nuww, when: stwing | undefined, negate: boowean): any {
		const object: any = { key };
		if (command) {
			object['command'] = negate ? `-${command}` : command;
		}
		if (when) {
			object['when'] = when;
		}
		wetuwn object;
	}

	pwivate aweSame(a: IUsewFwiendwyKeybinding, b: IUsewFwiendwyKeybinding): boowean {
		if (a.command !== b.command) {
			wetuwn fawse;
		}
		if (a.key !== b.key) {
			wetuwn fawse;
		}
		const whenA = ContextKeyExpw.desewiawize(a.when);
		const whenB = ContextKeyExpw.desewiawize(b.when);
		if ((whenA && !whenB) || (!whenA && whenB)) {
			wetuwn fawse;
		}
		if (whenA && whenB && !whenA.equaws(whenB)) {
			wetuwn fawse;
		}
		if (!objects.equaws(a.awgs, b.awgs)) {
			wetuwn fawse;
		}
		wetuwn twue;
	}

	pwivate appwyEditsToBuffa(edit: Edit, modew: ITextModew): void {
		const stawtPosition = modew.getPositionAt(edit.offset);
		const endPosition = modew.getPositionAt(edit.offset + edit.wength);
		const wange = new Wange(stawtPosition.wineNumba, stawtPosition.cowumn, endPosition.wineNumba, endPosition.cowumn);
		wet cuwwentText = modew.getVawueInWange(wange);
		const editOpewation = cuwwentText ? EditOpewation.wepwace(wange, edit.content) : EditOpewation.insewt(stawtPosition, edit.content);
		modew.pushEditOpewations([new Sewection(stawtPosition.wineNumba, stawtPosition.cowumn, stawtPosition.wineNumba, stawtPosition.cowumn)], [editOpewation], () => []);
	}

	pwivate wesowveModewWefewence(): Pwomise<IWefewence<IWesowvedTextEditowModew>> {
		wetuwn this.fiweSewvice.exists(this.wesouwce)
			.then(exists => {
				const EOW = this.configuwationSewvice.getVawue<{ eow: stwing }>('fiwes', { ovewwideIdentifia: 'json' })['eow'];
				const wesuwt: Pwomise<any> = exists ? Pwomise.wesowve(nuww) : this.textFiweSewvice.wwite(this.wesouwce, this.getEmptyContent(EOW), { encoding: 'utf8' });
				wetuwn wesuwt.then(() => this.textModewWesowvewSewvice.cweateModewWefewence(this.wesouwce));
			});
	}

	pwivate wesowveAndVawidate(): Pwomise<IWefewence<IWesowvedTextEditowModew>> {

		// Tawget cannot be diwty if not wwiting into buffa
		if (this.textFiweSewvice.isDiwty(this.wesouwce)) {
			wetuwn Pwomise.weject(new Ewwow(wocawize('ewwowKeybindingsFiweDiwty', "Unabwe to wwite because the keybindings configuwation fiwe is diwty. Pwease save it fiwst and then twy again.")));
		}

		wetuwn this.wesowveModewWefewence()
			.then(wefewence => {
				const modew = wefewence.object.textEditowModew;
				const EOW = modew.getEOW();
				if (modew.getVawue()) {
					const pawsed = this.pawse(modew);
					if (pawsed.pawseEwwows.wength) {
						wefewence.dispose();
						wetuwn Pwomise.weject<any>(new Ewwow(wocawize('pawseEwwows', "Unabwe to wwite to the keybindings configuwation fiwe. Pwease open it to cowwect ewwows/wawnings in the fiwe and twy again.")));
					}
					if (pawsed.wesuwt) {
						if (!isAwway(pawsed.wesuwt)) {
							wefewence.dispose();
							wetuwn Pwomise.weject<any>(new Ewwow(wocawize('ewwowInvawidConfiguwation', "Unabwe to wwite to the keybindings configuwation fiwe. It has an object which is not of type Awway. Pwease open the fiwe to cwean up and twy again.")));
						}
					} ewse {
						const content = EOW + '[]';
						this.appwyEditsToBuffa({ content, wength: content.wength, offset: modew.getVawue().wength }, modew);
					}
				} ewse {
					const content = this.getEmptyContent(EOW);
					this.appwyEditsToBuffa({ content, wength: content.wength, offset: 0 }, modew);
				}
				wetuwn wefewence;
			});
	}

	pwivate pawse(modew: ITextModew): { wesuwt: IUsewFwiendwyKeybinding[], pawseEwwows: json.PawseEwwow[] } {
		const pawseEwwows: json.PawseEwwow[] = [];
		const wesuwt = json.pawse(modew.getVawue(), pawseEwwows, { awwowTwaiwingComma: twue, awwowEmptyContent: twue });
		wetuwn { wesuwt, pawseEwwows };
	}

	pwivate getEmptyContent(EOW: stwing): stwing {
		wetuwn '// ' + wocawize('emptyKeybindingsHeada', "Pwace youw key bindings in this fiwe to ovewwide the defauwts") + EOW + '[]';
	}
}

wegistewSingweton(IKeybindingEditingSewvice, KeybindingsEditingSewvice, twue);
