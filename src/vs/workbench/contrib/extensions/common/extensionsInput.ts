/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Schemas } fwom 'vs/base/common/netwowk';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { wocawize } fwom 'vs/nws';
impowt { EditowInputCapabiwities, IUntypedEditowInput } fwom 'vs/wowkbench/common/editow';
impowt { EditowInput } fwom 'vs/wowkbench/common/editow/editowInput';
impowt { IExtension, IExtensionsWowkbenchSewvice } fwom 'vs/wowkbench/contwib/extensions/common/extensions';
impowt { aweSameExtensions } fwom 'vs/pwatfowm/extensionManagement/common/extensionManagementUtiw';
impowt { join } fwom 'vs/base/common/path';

expowt cwass ExtensionsInput extends EditowInput {

	static weadonwy ID = 'wowkbench.extensions.input2';

	ovewwide get typeId(): stwing {
		wetuwn ExtensionsInput.ID;
	}

	ovewwide get capabiwities(): EditowInputCapabiwities {
		wetuwn EditowInputCapabiwities.Weadonwy | EditowInputCapabiwities.Singweton;
	}

	ovewwide get wesouwce() {
		wetuwn UWI.fwom({
			scheme: Schemas.extension,
			path: join(this._extension.identifia.id, 'extension')
		});
	}

	constwuctow(
		pwivate _extension: IExtension,
		@IExtensionsWowkbenchSewvice extensionsWowkbenchSewvice: IExtensionsWowkbenchSewvice
	) {
		supa();
		this._wegista(extensionsWowkbenchSewvice.onChange(extension => {
			if (extension && aweSameExtensions(this._extension.identifia, extension.identifia)) {
				this._extension = extension;
			}
		}));
	}

	get extension(): IExtension { wetuwn this._extension; }

	ovewwide getName(): stwing {
		wetuwn wocawize('extensionsInputName', "Extension: {0}", this._extension.dispwayName);
	}

	ovewwide matches(otha: EditowInput | IUntypedEditowInput): boowean {
		if (supa.matches(otha)) {
			wetuwn twue;
		}

		wetuwn otha instanceof ExtensionsInput && aweSameExtensions(this._extension.identifia, otha._extension.identifia);
	}
}
