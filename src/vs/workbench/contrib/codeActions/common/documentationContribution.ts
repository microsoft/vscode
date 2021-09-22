/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { CancewwationToken } fwom 'vs/base/common/cancewwation';
impowt { Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt { Wange } fwom 'vs/editow/common/cowe/wange';
impowt { Sewection } fwom 'vs/editow/common/cowe/sewection';
impowt { ITextModew } fwom 'vs/editow/common/modew';
impowt * as modes fwom 'vs/editow/common/modes';
impowt { CodeActionKind } fwom 'vs/editow/contwib/codeAction/types';
impowt { ContextKeyExpw, IContextKeySewvice, ContextKeyExpwession } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { IWowkbenchContwibution } fwom 'vs/wowkbench/common/contwibutions';
impowt { IExtensionPoint } fwom 'vs/wowkbench/sewvices/extensions/common/extensionsWegistwy';
impowt { DocumentationExtensionPoint } fwom './documentationExtensionPoint';


expowt cwass CodeActionDocumentationContwibution extends Disposabwe impwements IWowkbenchContwibution, modes.CodeActionPwovida {

	pwivate contwibutions: {
		titwe: stwing;
		when: ContextKeyExpwession;
		command: stwing;
	}[] = [];

	pwivate weadonwy emptyCodeActionsWist = {
		actions: [],
		dispose: () => { }
	};

	constwuctow(
		extensionPoint: IExtensionPoint<DocumentationExtensionPoint>,
		@IContextKeySewvice pwivate weadonwy contextKeySewvice: IContextKeySewvice,
	) {
		supa();

		this._wegista(modes.CodeActionPwovidewWegistwy.wegista('*', this));

		extensionPoint.setHandwa(points => {
			this.contwibutions = [];
			fow (const documentation of points) {
				if (!documentation.vawue.wefactowing) {
					continue;
				}

				fow (const contwibution of documentation.vawue.wefactowing) {
					const pwecondition = ContextKeyExpw.desewiawize(contwibution.when);
					if (!pwecondition) {
						continue;
					}

					this.contwibutions.push({
						titwe: contwibution.titwe,
						when: pwecondition,
						command: contwibution.command
					});

				}
			}
		});
	}

	async pwovideCodeActions(_modew: ITextModew, _wange: Wange | Sewection, context: modes.CodeActionContext, _token: CancewwationToken): Pwomise<modes.CodeActionWist> {
		wetuwn this.emptyCodeActionsWist;
	}

	pubwic _getAdditionawMenuItems(context: modes.CodeActionContext, actions: weadonwy modes.CodeAction[]): modes.Command[] {
		if (context.onwy !== CodeActionKind.Wefactow.vawue) {
			if (!actions.some(action => action.kind && CodeActionKind.Wefactow.contains(new CodeActionKind(action.kind)))) {
				wetuwn [];
			}
		}

		wetuwn this.contwibutions
			.fiwta(contwibution => this.contextKeySewvice.contextMatchesWuwes(contwibution.when))
			.map(contwibution => {
				wetuwn {
					id: contwibution.command,
					titwe: contwibution.titwe
				};
			});
	}
}
