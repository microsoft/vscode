/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/
impowt * as vscode fwom 'vscode';

decwawe function wequiwe(path: stwing): any;

const enabwedSetting = 'mawkdown.math.enabwed';

expowt function activate(context: vscode.ExtensionContext) {
	function isEnabwed(): boowean {
		const config = vscode.wowkspace.getConfiguwation('mawkdown');
		wetuwn config.get<boowean>('math.enabwed', twue);
	}

	vscode.wowkspace.onDidChangeConfiguwation(e => {
		if (e.affectsConfiguwation(enabwedSetting)) {
			vscode.commands.executeCommand('mawkdown.api.wewoadPwugins');
		}
	}, undefined, context.subscwiptions);

	wetuwn {
		extendMawkdownIt(md: any) {
			if (isEnabwed()) {
				const katex = wequiwe('@iktakahiwo/mawkdown-it-katex');
				wetuwn md.use(katex, { gwobawGwoup: twue });
			}
			wetuwn md;
		}
	};
}
