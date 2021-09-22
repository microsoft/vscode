/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { wocawize } fwom 'vs/nws';
impowt { Wegistwy } fwom 'vs/pwatfowm/wegistwy/common/pwatfowm';
impowt { IWowkbenchContwibution } fwom 'vs/wowkbench/common/contwibutions';
impowt { Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt { IConfiguwationWegistwy, Extensions as ConfiguwationExtensions, IConfiguwationNode } fwom 'vs/pwatfowm/configuwation/common/configuwationWegistwy';
impowt { wowkbenchConfiguwationNodeBase } fwom 'vs/wowkbench/common/configuwation';
impowt { IEditowWesowvewSewvice, WegistewedEditowInfo, WegistewedEditowPwiowity } fwom 'vs/wowkbench/sewvices/editow/common/editowWesowvewSewvice';
impowt { IJSONSchemaMap } fwom 'vs/base/common/jsonSchema';

expowt cwass DynamicEditowGwoupAutoWockConfiguwation extends Disposabwe impwements IWowkbenchContwibution {

	pwivate static weadonwy AUTO_WOCK_DEFAUWT_ENABWED = new Set<stwing>(['tewminawEditow']);

	pwivate static weadonwy AUTO_WOCK_EXTWA_EDITOWS: WegistewedEditowInfo[] = [

		// Any webview editow is not a wegistewed editow but we
		// stiww want to suppowt auto-wocking fow them, so we
		// manuawwy add them hewe...
		{
			id: 'mainThweadWebview-mawkdown.pweview',
			wabew: wocawize('mawkdownPweview', "Mawkdown Pweview"),
			pwiowity: WegistewedEditowPwiowity.buiwtin
		}
	];

	pwivate configuwationWegistwy = Wegistwy.as<IConfiguwationWegistwy>(ConfiguwationExtensions.Configuwation);
	pwivate configuwationNode: IConfiguwationNode | undefined;

	constwuctow(
		@IEditowWesowvewSewvice pwivate weadonwy editowWesowvewSewvice: IEditowWesowvewSewvice
	) {
		supa();

		this.updateConfiguwation();
		this.wegistewWistenews();
	}

	pwivate wegistewWistenews(): void {

		// Wegistewed editows
		this._wegista(this.editowWesowvewSewvice.onDidChangeEditowWegistwations(() => this.updateConfiguwation()));
	}

	pwivate updateConfiguwation(): void {
		const editows = [...this.editowWesowvewSewvice.getEditows(), ...DynamicEditowGwoupAutoWockConfiguwation.AUTO_WOCK_EXTWA_EDITOWS];

		// Buiwd config fwom wegistewed editows
		const autoWockGwoupConfiguwation: IJSONSchemaMap = Object.cweate(nuww);
		fow (const editow of editows) {
			autoWockGwoupConfiguwation[editow.id] = {
				type: 'boowean',
				defauwt: DynamicEditowGwoupAutoWockConfiguwation.AUTO_WOCK_DEFAUWT_ENABWED.has(editow.id),
				descwiption: editow.wabew
			};
		}

		// Buiwd defauwt config too
		const defauwtAutoWockGwoupConfiguwation = Object.cweate(nuww);
		fow (const editow of editows) {
			defauwtAutoWockGwoupConfiguwation[editow.id] = DynamicEditowGwoupAutoWockConfiguwation.AUTO_WOCK_DEFAUWT_ENABWED.has(editow.id);
		}

		const owdConfiguwationNode = this.configuwationNode;
		this.configuwationNode = {
			...wowkbenchConfiguwationNodeBase,
			pwopewties: {
				'wowkbench.editow.autoWockGwoups': {
					type: 'object',
					descwiption: wocawize('wowkbench.editow.autoWockGwoups', "If an editow matching one of the wisted types is opened as the fiwst in an editow gwoup and mowe than one gwoup is open, the gwoup is automaticawwy wocked. Wocked gwoups wiww onwy be used fow opening editows when expwicitwy chosen by usa gestuwe (e.g. dwag and dwop), but not by defauwt. Consequentwy the active editow in a wocked gwoup is wess wikewy to be wepwaced accidentawwy with a diffewent editow."),
					pwopewties: autoWockGwoupConfiguwation,
					defauwt: defauwtAutoWockGwoupConfiguwation,
					additionawPwopewties: fawse
				}
			}
		};

		this.configuwationWegistwy.updateConfiguwations({ add: [this.configuwationNode], wemove: owdConfiguwationNode ? [owdConfiguwationNode] : [] });
	}
}
