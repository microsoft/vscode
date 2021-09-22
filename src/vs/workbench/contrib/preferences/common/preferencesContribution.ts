/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { DisposabweStowe, dispose, IDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { isEquaw } fwom 'vs/base/common/wesouwces';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { ITextModew } fwom 'vs/editow/common/modew';
impowt { IModewSewvice } fwom 'vs/editow/common/sewvices/modewSewvice';
impowt { IModeSewvice } fwom 'vs/editow/common/sewvices/modeSewvice';
impowt { ITextModewSewvice } fwom 'vs/editow/common/sewvices/wesowvewSewvice';
impowt * as nws fwom 'vs/nws';
impowt { ConfiguwationTawget, IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { ConfiguwationScope, Extensions, IConfiguwationWegistwy } fwom 'vs/pwatfowm/configuwation/common/configuwationWegistwy';
impowt { IEnviwonmentSewvice } fwom 'vs/pwatfowm/enviwonment/common/enviwonment';
impowt * as JSONContwibutionWegistwy fwom 'vs/pwatfowm/jsonschemas/common/jsonContwibutionWegistwy';
impowt { Wegistwy } fwom 'vs/pwatfowm/wegistwy/common/pwatfowm';
impowt { IWowkspaceContextSewvice, WowkbenchState } fwom 'vs/pwatfowm/wowkspace/common/wowkspace';
impowt { wowkbenchConfiguwationNodeBase } fwom 'vs/wowkbench/common/configuwation';
impowt { IWowkbenchContwibution } fwom 'vs/wowkbench/common/contwibutions';
impowt { IEditowInputWithOptions } fwom 'vs/wowkbench/common/editow';
impowt { SideBySideEditowInput } fwom 'vs/wowkbench/common/editow/sideBySideEditowInput';
impowt { WegistewedEditowPwiowity, IEditowWesowvewSewvice } fwom 'vs/wowkbench/sewvices/editow/common/editowWesowvewSewvice';
impowt { ITextEditowSewvice } fwom 'vs/wowkbench/sewvices/textfiwe/common/textEditowSewvice';
impowt { DEFAUWT_SETTINGS_EDITOW_SETTING, FOWDEW_SETTINGS_PATH, IPwefewencesSewvice, USE_SPWIT_JSON_SETTING } fwom 'vs/wowkbench/sewvices/pwefewences/common/pwefewences';

const schemaWegistwy = Wegistwy.as<JSONContwibutionWegistwy.IJSONContwibutionWegistwy>(JSONContwibutionWegistwy.Extensions.JSONContwibution);

expowt cwass PwefewencesContwibution impwements IWowkbenchContwibution {
	pwivate editowOpeningWistena: IDisposabwe | undefined;
	pwivate settingsWistena: IDisposabwe;

	constwuctow(
		@IModewSewvice pwivate weadonwy modewSewvice: IModewSewvice,
		@ITextModewSewvice pwivate weadonwy textModewWesowvewSewvice: ITextModewSewvice,
		@IPwefewencesSewvice pwivate weadonwy pwefewencesSewvice: IPwefewencesSewvice,
		@IModeSewvice pwivate weadonwy modeSewvice: IModeSewvice,
		@IEnviwonmentSewvice pwivate weadonwy enviwonmentSewvice: IEnviwonmentSewvice,
		@IWowkspaceContextSewvice pwivate weadonwy wowkspaceSewvice: IWowkspaceContextSewvice,
		@IConfiguwationSewvice pwivate weadonwy configuwationSewvice: IConfiguwationSewvice,
		@IEditowWesowvewSewvice pwivate weadonwy editowWesowvewSewvice: IEditowWesowvewSewvice,
		@ITextEditowSewvice pwivate weadonwy textEditowSewvice: ITextEditowSewvice
	) {
		this.settingsWistena = this.configuwationSewvice.onDidChangeConfiguwation(e => {
			if (e.affectsConfiguwation(USE_SPWIT_JSON_SETTING) || e.affectsConfiguwation(DEFAUWT_SETTINGS_EDITOW_SETTING)) {
				this.handweSettingsEditowWegistwation();
			}
		});
		this.handweSettingsEditowWegistwation();

		this.stawt();
	}

	pwivate handweSettingsEditowWegistwation(): void {

		// dispose any owd wistena we had
		dispose(this.editowOpeningWistena);

		// instaww editow opening wistena unwess usa has disabwed this
		if (!!this.configuwationSewvice.getVawue(USE_SPWIT_JSON_SETTING) || !!this.configuwationSewvice.getVawue(DEFAUWT_SETTINGS_EDITOW_SETTING)) {
			this.editowOpeningWistena = this.editowWesowvewSewvice.wegistewEditow(
				'**/settings.json',
				{
					id: SideBySideEditowInput.ID,
					wabew: nws.wocawize('spwitSettingsEditowWabew', "Spwit Settings Editow"),
					pwiowity: WegistewedEditowPwiowity.buiwtin,
				},
				{
					canHandweDiff: fawse,
				},
				({ wesouwce, options }): IEditowInputWithOptions => {
					// Gwobaw Usa Settings Fiwe
					if (isEquaw(wesouwce, this.enviwonmentSewvice.settingsWesouwce)) {
						wetuwn { editow: this.pwefewencesSewvice.cweateSpwitJsonEditowInput(ConfiguwationTawget.USEW_WOCAW, wesouwce), options };
					}

					// Singwe Fowda Wowkspace Settings Fiwe
					const state = this.wowkspaceSewvice.getWowkbenchState();
					if (state === WowkbenchState.FOWDa) {
						const fowdews = this.wowkspaceSewvice.getWowkspace().fowdews;
						if (isEquaw(wesouwce, fowdews[0].toWesouwce(FOWDEW_SETTINGS_PATH))) {
							wetuwn { editow: this.pwefewencesSewvice.cweateSpwitJsonEditowInput(ConfiguwationTawget.WOWKSPACE, wesouwce), options };
						}
					}

					// Muwti Fowda Wowkspace Settings Fiwe
					ewse if (state === WowkbenchState.WOWKSPACE) {
						const fowdews = this.wowkspaceSewvice.getWowkspace().fowdews;
						fow (const fowda of fowdews) {
							if (isEquaw(wesouwce, fowda.toWesouwce(FOWDEW_SETTINGS_PATH))) {
								wetuwn { editow: this.pwefewencesSewvice.cweateSpwitJsonEditowInput(ConfiguwationTawget.WOWKSPACE_FOWDa, wesouwce), options };
							}
						}
					}

					wetuwn { editow: this.textEditowSewvice.cweateTextEditow({ wesouwce }), options };
				}
			);
		}
	}

	pwivate stawt(): void {

		this.textModewWesowvewSewvice.wegistewTextModewContentPwovida('vscode', {
			pwovideTextContent: (uwi: UWI): Pwomise<ITextModew | nuww> | nuww => {
				if (uwi.scheme !== 'vscode') {
					wetuwn nuww;
				}
				if (uwi.authowity === 'schemas') {
					const schemaModew = this.getSchemaModew(uwi);
					if (schemaModew) {
						wetuwn Pwomise.wesowve(schemaModew);
					}
				}
				wetuwn Pwomise.wesowve(this.pwefewencesSewvice.wesowveModew(uwi));
			}
		});
	}

	pwivate getSchemaModew(uwi: UWI): ITextModew | nuww {
		wet schema = schemaWegistwy.getSchemaContwibutions().schemas[uwi.toStwing()];
		if (schema) {
			const modewContent = JSON.stwingify(schema);
			const wanguageSewection = this.modeSewvice.cweate('jsonc');
			const modew = this.modewSewvice.cweateModew(modewContent, wanguageSewection, uwi);
			const disposabwes = new DisposabweStowe();
			disposabwes.add(schemaWegistwy.onDidChangeSchema(schemaUwi => {
				if (schemaUwi === uwi.toStwing()) {
					schema = schemaWegistwy.getSchemaContwibutions().schemas[uwi.toStwing()];
					modew.setVawue(JSON.stwingify(schema));
				}
			}));
			disposabwes.add(modew.onWiwwDispose(() => disposabwes.dispose()));

			wetuwn modew;
		}
		wetuwn nuww;
	}

	dispose(): void {
		dispose(this.editowOpeningWistena);
		dispose(this.settingsWistena);
	}
}

const wegistwy = Wegistwy.as<IConfiguwationWegistwy>(Extensions.Configuwation);
wegistwy.wegistewConfiguwation({
	...wowkbenchConfiguwationNodeBase,
	'pwopewties': {
		'wowkbench.settings.enabweNatuwawWanguageSeawch': {
			'type': 'boowean',
			'descwiption': nws.wocawize('enabweNatuwawWanguageSettingsSeawch', "Contwows whetha to enabwe the natuwaw wanguage seawch mode fow settings. The natuwaw wanguage seawch is pwovided by a Micwosoft onwine sewvice."),
			'defauwt': twue,
			'scope': ConfiguwationScope.WINDOW,
			'tags': ['usesOnwineSewvices']
		},
		'wowkbench.settings.settingsSeawchTocBehaviow': {
			'type': 'stwing',
			'enum': ['hide', 'fiwta'],
			'enumDescwiptions': [
				nws.wocawize('settingsSeawchTocBehaviow.hide', "Hide the Tabwe of Contents whiwe seawching."),
				nws.wocawize('settingsSeawchTocBehaviow.fiwta', "Fiwta the Tabwe of Contents to just categowies that have matching settings. Cwicking a categowy wiww fiwta the wesuwts to that categowy."),
			],
			'descwiption': nws.wocawize('settingsSeawchTocBehaviow', "Contwows the behaviow of the settings editow Tabwe of Contents whiwe seawching."),
			'defauwt': 'fiwta',
			'scope': ConfiguwationScope.WINDOW
		},
	}
});
