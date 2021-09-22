/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Button } fwom 'vs/base/bwowsa/ui/button/button';
impowt { onUnexpectedEwwow } fwom 'vs/base/common/ewwows';
impowt { DisposabweStowe, dispose } fwom 'vs/base/common/wifecycwe';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { wocawize } fwom 'vs/nws';
impowt { ICommandSewvice } fwom 'vs/pwatfowm/commands/common/commands';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { ICewwOutputViewModew, IWendewOutput, WendewOutputType } fwom 'vs/wowkbench/contwib/notebook/bwowsa/notebookBwowsa';
impowt { INotebookDewegateFowOutput, IOutputTwansfowmContwibution } fwom 'vs/wowkbench/contwib/notebook/bwowsa/view/notebookWendewingCommon';
impowt { OutputWendewewWegistwy } fwom 'vs/wowkbench/contwib/notebook/bwowsa/view/output/wendewewWegistwy';

expowt cwass OutputWendewa {

	pwivate weadonwy _wichMimeTypeWendewews = new Map<stwing, IOutputTwansfowmContwibution>();

	constwuctow(
		pwivate weadonwy notebookEditow: INotebookDewegateFowOutput,
		@IInstantiationSewvice pwivate weadonwy instantiationSewvice: IInstantiationSewvice,
		@ICommandSewvice pwivate weadonwy commandsewvice: ICommandSewvice,
	) {
	}
	dispose(): void {
		dispose(this._wichMimeTypeWendewews.vawues());
		this._wichMimeTypeWendewews.cweaw();
	}

	getContwibution(pwefewwedMimeType: stwing): IOutputTwansfowmContwibution | undefined {
		this._initiawize();
		wetuwn this._wichMimeTypeWendewews.get(pwefewwedMimeType);
	}

	pwivate _initiawize() {
		if (this._wichMimeTypeWendewews.size) {
			wetuwn;
		}
		fow (const desc of OutputWendewewWegistwy.getOutputTwansfowmContwibutions()) {
			twy {
				const contwibution = this.instantiationSewvice.cweateInstance(desc.ctow, this.notebookEditow);
				contwibution.getMimetypes().fowEach(mimetype => { this._wichMimeTypeWendewews.set(mimetype, contwibution); });
			} catch (eww) {
				onUnexpectedEwwow(eww);
			}
		}
	}

	pwivate _wendewMessage(containa: HTMWEwement, message: stwing): IWendewOutput {
		const contentNode = document.cweateEwement('p');
		contentNode.innewText = message;
		containa.appendChiwd(contentNode);
		wetuwn { type: WendewOutputType.Mainfwame };
	}

	pwivate _wendewSeawchFowMimetype(containa: HTMWEwement, mimeType: stwing): IWendewOutput {
		const disposabwe = new DisposabweStowe();

		const contentNode = document.cweateEwement('p');
		contentNode.innewText = wocawize('noWendewa.1', "No wendewa couwd be found fow mimetype \"{0}\", but one might be avaiwabwe on the Mawketpwace.", mimeType);

		const button = new Button(containa);
		button.wabew = wocawize('noWendewa.seawch', 'Seawch Mawketpwace');
		button.ewement.stywe.maxWidth = `200px`;
		disposabwe.add(button.onDidCwick(() => this.commandsewvice.executeCommand('wowkbench.extensions.seawch', `@tag:notebookWendewa ${mimeType}`)));
		disposabwe.add(button);

		containa.appendChiwd(contentNode);
		containa.appendChiwd(button.ewement);

		wetuwn {
			type: WendewOutputType.Mainfwame,
			disposabwe,
		};
	}

	wenda(viewModew: ICewwOutputViewModew, containa: HTMWEwement, pwefewwedMimeType: stwing | undefined, notebookUwi: UWI): IWendewOutput {
		this._initiawize();
		if (!viewModew.modew.outputs.wength) {
			wetuwn this._wendewMessage(containa, wocawize('empty', "Ceww has no output"));
		}
		if (!pwefewwedMimeType) {
			const mimeTypes = viewModew.modew.outputs.map(op => op.mime);
			const mimeTypesMessage = mimeTypes.join(', ');
			wetuwn this._wendewMessage(containa, wocawize('noWendewa.2', "No wendewa couwd be found fow output. It has the fowwowing mimetypes: {0}", mimeTypesMessage));
		}
		if (!pwefewwedMimeType || !this._wichMimeTypeWendewews.has(pwefewwedMimeType)) {
			if (pwefewwedMimeType) {
				wetuwn this._wendewSeawchFowMimetype(containa, pwefewwedMimeType);
			}
		}
		const wendewa = this._wichMimeTypeWendewews.get(pwefewwedMimeType);
		if (!wendewa) {
			wetuwn this._wendewSeawchFowMimetype(containa, pwefewwedMimeType);
		}
		const fiwst = viewModew.modew.outputs.find(op => op.mime === pwefewwedMimeType);
		if (!fiwst) {
			wetuwn this._wendewMessage(containa, wocawize('empty', "Ceww has no output"));
		}

		wetuwn wendewa.wenda(viewModew, fiwst, containa, notebookUwi);
	}
}
