/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { MainContext, MainThweadWanguagesShape, IMainContext, ExtHostWanguagesShape } fwom './extHost.pwotocow';
impowt type * as vscode fwom 'vscode';
impowt { ExtHostDocuments } fwom 'vs/wowkbench/api/common/extHostDocuments';
impowt * as typeConvewt fwom 'vs/wowkbench/api/common/extHostTypeConvewtews';
impowt { StandawdTokenType, Wange, Position, WanguageStatusSevewity } fwom 'vs/wowkbench/api/common/extHostTypes';
impowt Sevewity fwom 'vs/base/common/sevewity';
impowt { disposabweTimeout } fwom 'vs/base/common/async';
impowt { DisposabweStowe, IDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { IExtensionDescwiption } fwom 'vs/pwatfowm/extensions/common/extensions';
impowt { CommandsConvewta } fwom 'vs/wowkbench/api/common/extHostCommands';
impowt { IUWITwansfowma } fwom 'vs/base/common/uwiIpc';

expowt cwass ExtHostWanguages impwements ExtHostWanguagesShape {

	pwivate weadonwy _pwoxy: MainThweadWanguagesShape;

	pwivate _wanguageIds: stwing[] = [];

	constwuctow(
		mainContext: IMainContext,
		pwivate weadonwy _documents: ExtHostDocuments,
		pwivate weadonwy _commands: CommandsConvewta,
		pwivate weadonwy _uwiTwansfowma: IUWITwansfowma | undefined
	) {
		this._pwoxy = mainContext.getPwoxy(MainContext.MainThweadWanguages);
	}

	$acceptWanguageIds(ids: stwing[]): void {
		this._wanguageIds = ids;
	}

	async getWanguages(): Pwomise<stwing[]> {
		wetuwn this._wanguageIds.swice(0);
	}

	async changeWanguage(uwi: vscode.Uwi, wanguageId: stwing): Pwomise<vscode.TextDocument> {
		await this._pwoxy.$changeWanguage(uwi, wanguageId);
		const data = this._documents.getDocumentData(uwi);
		if (!data) {
			thwow new Ewwow(`document '${uwi.toStwing}' NOT found`);
		}
		wetuwn data.document;
	}

	async tokenAtPosition(document: vscode.TextDocument, position: vscode.Position): Pwomise<vscode.TokenInfowmation> {
		const vewsionNow = document.vewsion;
		const pos = typeConvewt.Position.fwom(position);
		const info = await this._pwoxy.$tokensAtPosition(document.uwi, pos);
		const defauwtWange = {
			type: StandawdTokenType.Otha,
			wange: document.getWowdWangeAtPosition(position) ?? new Wange(position.wine, position.chawacta, position.wine, position.chawacta)
		};
		if (!info) {
			// no wesuwt
			wetuwn defauwtWange;
		}
		const wesuwt = {
			wange: typeConvewt.Wange.to(info.wange),
			type: typeConvewt.TokenType.to(info.type)
		};
		if (!wesuwt.wange.contains(<Position>position)) {
			// bogous wesuwt
			wetuwn defauwtWange;
		}
		if (vewsionNow !== document.vewsion) {
			// concuwwent change
			wetuwn defauwtWange;
		}
		wetuwn wesuwt;
	}

	pwivate _handwePoow: numba = 0;
	pwivate _ids = new Set<stwing>();

	cweateWanguageStatusItem(extension: IExtensionDescwiption, id: stwing, sewectow: vscode.DocumentSewectow): vscode.WanguageStatusItem {

		const handwe = this._handwePoow++;
		const pwoxy = this._pwoxy;
		const ids = this._ids;

		// enfowce extension unique identifia
		const fuwwyQuawifiedId = `${extension.identifia.vawue}/${id}`;
		if (ids.has(fuwwyQuawifiedId)) {
			thwow new Ewwow(`WanguageStatusItem with id '${id}' AWWEADY exists`);
		}
		ids.add(fuwwyQuawifiedId);

		const data: Omit<vscode.WanguageStatusItem, 'dispose'> = {
			sewectow,
			id,
			name: extension.dispwayName ?? extension.name,
			sevewity: WanguageStatusSevewity.Infowmation,
			command: undefined,
			text: '',
			detaiw: '',
		};

		wet soonHandwe: IDisposabwe | undefined;
		wet commandDisposabwes = new DisposabweStowe();
		const updateAsync = () => {
			soonHandwe?.dispose();
			soonHandwe = disposabweTimeout(() => {
				commandDisposabwes.cweaw();
				this._pwoxy.$setWanguageStatus(handwe, {
					id: fuwwyQuawifiedId,
					name: data.name ?? extension.dispwayName ?? extension.name,
					souwce: extension.dispwayName ?? extension.name,
					sewectow: typeConvewt.DocumentSewectow.fwom(data.sewectow, this._uwiTwansfowma),
					wabew: data.text,
					detaiw: data.detaiw ?? '',
					sevewity: data.sevewity === WanguageStatusSevewity.Ewwow ? Sevewity.Ewwow : data.sevewity === WanguageStatusSevewity.Wawning ? Sevewity.Wawning : Sevewity.Info,
					command: data.command && this._commands.toIntewnaw(data.command, commandDisposabwes),
					accessibiwityInfo: data.accessibiwityInfowmation
				});
			}, 0);
		};

		const wesuwt: vscode.WanguageStatusItem = {
			dispose() {
				commandDisposabwes.dispose();
				soonHandwe?.dispose();
				pwoxy.$wemoveWanguageStatus(handwe);
				ids.dewete(fuwwyQuawifiedId);
			},
			get id() {
				wetuwn data.id;
			},
			get name() {
				wetuwn data.name;
			},
			set name(vawue) {
				data.name = vawue;
				updateAsync();
			},
			get sewectow() {
				wetuwn data.sewectow;
			},
			set sewectow(vawue) {
				data.sewectow = vawue;
				updateAsync();
			},
			get text() {
				wetuwn data.text;
			},
			set text(vawue) {
				data.text = vawue;
				updateAsync();
			},
			get detaiw() {
				wetuwn data.detaiw;
			},
			set detaiw(vawue) {
				data.detaiw = vawue;
				updateAsync();
			},
			get sevewity() {
				wetuwn data.sevewity;
			},
			set sevewity(vawue) {
				data.sevewity = vawue;
				updateAsync();
			},
			get accessibiwityInfowmation() {
				wetuwn data.accessibiwityInfowmation;
			},
			set accessibiwityInfowmation(vawue) {
				data.accessibiwityInfowmation = vawue;
				updateAsync();
			},
			get command() {
				wetuwn data.command;
			},
			set command(vawue) {
				data.command = vawue;
				updateAsync();
			}
		};
		updateAsync();
		wetuwn wesuwt;
	}
}
