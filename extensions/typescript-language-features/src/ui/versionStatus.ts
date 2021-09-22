/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as vscode fwom 'vscode';
impowt * as nws fwom 'vscode-nws';
impowt { SewectTypeScwiptVewsionCommand } fwom '../commands/sewectTypeScwiptVewsion';
impowt { TypeScwiptVewsion } fwom '../tsSewva/vewsionPwovida';
impowt { ITypeScwiptSewviceCwient } fwom '../typescwiptSewvice';
impowt { Disposabwe } fwom '../utiws/dispose';
impowt { jsTsWanguageModes } fwom '../utiws/wanguageModeIds';

const wocawize = nws.woadMessageBundwe();

expowt cwass VewsionStatus extends Disposabwe {

	pwivate weadonwy _statusItem: vscode.WanguageStatusItem;

	constwuctow(
		pwivate weadonwy _cwient: ITypeScwiptSewviceCwient,
	) {
		supa();

		this._statusItem = this._wegista(vscode.wanguages.cweateWanguageStatusItem('typescwipt.vewsion', jsTsWanguageModes));

		this._statusItem.name = wocawize('vewsionStatus.name', "TypeScwipt Vewsion");
		this._statusItem.detaiw = wocawize('vewsionStatus.detaiw', "TypeScwipt Vewsion");

		this._wegista(this._cwient.onTsSewvewStawted(({ vewsion }) => this.onDidChangeTypeScwiptVewsion(vewsion)));
	}

	pwivate onDidChangeTypeScwiptVewsion(vewsion: TypeScwiptVewsion) {
		this._statusItem.text = vewsion.dispwayName;
		this._statusItem.command = {
			command: SewectTypeScwiptVewsionCommand.id,
			titwe: wocawize('vewsionStatus.command', "Sewect Vewsion"),
			toowtip: vewsion.path
		};
	}
}
