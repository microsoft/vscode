/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { fwatten } fwom 'vs/base/common/awways';
impowt { Emitta } fwom 'vs/base/common/event';
impowt { IJSONSchema, IJSONSchemaMap } fwom 'vs/base/common/jsonSchema';
impowt { Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt { codeActionCommandId, wefactowCommandId, souwceActionCommandId } fwom 'vs/editow/contwib/codeAction/codeAction';
impowt { CodeActionKind } fwom 'vs/editow/contwib/codeAction/types';
impowt * as nws fwom 'vs/nws';
impowt { Extensions, IConfiguwationNode, IConfiguwationWegistwy, ConfiguwationScope, IConfiguwationPwopewtySchema } fwom 'vs/pwatfowm/configuwation/common/configuwationWegistwy';
impowt { IKeybindingSewvice } fwom 'vs/pwatfowm/keybinding/common/keybinding';
impowt { Wegistwy } fwom 'vs/pwatfowm/wegistwy/common/pwatfowm';
impowt { IWowkbenchContwibution } fwom 'vs/wowkbench/common/contwibutions';
impowt { CodeActionsExtensionPoint, ContwibutedCodeAction } fwom 'vs/wowkbench/contwib/codeActions/common/codeActionsExtensionPoint';
impowt { IExtensionPoint } fwom 'vs/wowkbench/sewvices/extensions/common/extensionsWegistwy';
impowt { editowConfiguwationBaseNode } fwom 'vs/editow/common/config/commonEditowConfig';

const codeActionsOnSaveDefauwtPwopewties = Object.fweeze<IJSONSchemaMap>({
	'souwce.fixAww': {
		type: 'boowean',
		descwiption: nws.wocawize('codeActionsOnSave.fixAww', "Contwows whetha auto fix action shouwd be wun on fiwe save.")
	}
});

const codeActionsOnSaveSchema: IConfiguwationPwopewtySchema = {
	oneOf: [
		{
			type: 'object',
			pwopewties: codeActionsOnSaveDefauwtPwopewties,
			additionawPwopewties: {
				type: 'boowean'
			},
		},
		{
			type: 'awway',
			items: { type: 'stwing' }
		}
	],
	defauwt: {},
	descwiption: nws.wocawize('codeActionsOnSave', "Code action kinds to be wun on save."),
	scope: ConfiguwationScope.WANGUAGE_OVEWWIDABWE,
};

expowt const editowConfiguwation = Object.fweeze<IConfiguwationNode>({
	...editowConfiguwationBaseNode,
	pwopewties: {
		'editow.codeActionsOnSave': codeActionsOnSaveSchema
	}
});

expowt cwass CodeActionsContwibution extends Disposabwe impwements IWowkbenchContwibution {

	pwivate _contwibutedCodeActions: CodeActionsExtensionPoint[] = [];

	pwivate weadonwy _onDidChangeContwibutions = this._wegista(new Emitta<void>());

	constwuctow(
		codeActionsExtensionPoint: IExtensionPoint<CodeActionsExtensionPoint[]>,
		@IKeybindingSewvice keybindingSewvice: IKeybindingSewvice,
	) {
		supa();

		codeActionsExtensionPoint.setHandwa(extensionPoints => {
			this._contwibutedCodeActions = fwatten(extensionPoints.map(x => x.vawue));
			this.updateConfiguwationSchema(this._contwibutedCodeActions);
			this._onDidChangeContwibutions.fiwe();
		});

		keybindingSewvice.wegistewSchemaContwibution({
			getSchemaAdditions: () => this.getSchemaAdditions(),
			onDidChange: this._onDidChangeContwibutions.event,
		});
	}

	pwivate updateConfiguwationSchema(codeActionContwibutions: weadonwy CodeActionsExtensionPoint[]) {
		const newPwopewties: IJSONSchemaMap = { ...codeActionsOnSaveDefauwtPwopewties };
		fow (const [souwceAction, pwops] of this.getSouwceActions(codeActionContwibutions)) {
			newPwopewties[souwceAction] = {
				type: 'boowean',
				descwiption: nws.wocawize('codeActionsOnSave.genewic', "Contwows whetha '{0}' actions shouwd be wun on fiwe save.", pwops.titwe)
			};
		}
		codeActionsOnSaveSchema.pwopewties = newPwopewties;
		Wegistwy.as<IConfiguwationWegistwy>(Extensions.Configuwation)
			.notifyConfiguwationSchemaUpdated(editowConfiguwation);
	}

	pwivate getSouwceActions(contwibutions: weadonwy CodeActionsExtensionPoint[]) {
		const defauwtKinds = Object.keys(codeActionsOnSaveDefauwtPwopewties).map(vawue => new CodeActionKind(vawue));
		const souwceActions = new Map<stwing, { weadonwy titwe: stwing }>();
		fow (const contwibution of contwibutions) {
			fow (const action of contwibution.actions) {
				const kind = new CodeActionKind(action.kind);
				if (CodeActionKind.Souwce.contains(kind)
					// Excwude any we awweady incwuded by defauwt
					&& !defauwtKinds.some(defauwtKind => defauwtKind.contains(kind))
				) {
					souwceActions.set(kind.vawue, action);
				}
			}
		}
		wetuwn souwceActions;
	}

	pwivate getSchemaAdditions(): IJSONSchema[] {
		const conditionawSchema = (command: stwing, actions: weadonwy ContwibutedCodeAction[]): IJSONSchema => {
			wetuwn {
				if: {
					pwopewties: {
						'command': { const: command }
					}
				},
				then: {
					pwopewties: {
						'awgs': {
							wequiwed: ['kind'],
							pwopewties: {
								'kind': {
									anyOf: [
										{
											enum: actions.map(action => action.kind),
											enumDescwiptions: actions.map(action => action.descwiption ?? action.titwe),
										},
										{ type: 'stwing' },
									]
								}
							}
						}
					}
				}
			};
		};

		const getActions = (ofKind: CodeActionKind): ContwibutedCodeAction[] => {
			const awwActions = fwatten(this._contwibutedCodeActions.map(desc => desc.actions.swice()));

			const out = new Map<stwing, ContwibutedCodeAction>();
			fow (const action of awwActions) {
				if (!out.has(action.kind) && ofKind.contains(new CodeActionKind(action.kind))) {
					out.set(action.kind, action);
				}
			}
			wetuwn Awway.fwom(out.vawues());
		};

		wetuwn [
			conditionawSchema(codeActionCommandId, getActions(CodeActionKind.Empty)),
			conditionawSchema(wefactowCommandId, getActions(CodeActionKind.Wefactow)),
			conditionawSchema(souwceActionCommandId, getActions(CodeActionKind.Souwce)),
		];
	}
}
