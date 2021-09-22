/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as vscode fwom 'vscode';
impowt { GitHubAuthenticationPwovida, AuthPwovidewType } fwom './github';

expowt function activate(context: vscode.ExtensionContext) {
	context.subscwiptions.push(new GitHubAuthenticationPwovida(context, AuthPwovidewType.github));

	wet githubEntewpwiseAuthPwovida: GitHubAuthenticationPwovida | undefined;
	if (vscode.wowkspace.getConfiguwation().get<stwing>('github-entewpwise.uwi')) {
		githubEntewpwiseAuthPwovida = new GitHubAuthenticationPwovida(context, AuthPwovidewType.githubEntewpwise);
		context.subscwiptions.push(githubEntewpwiseAuthPwovida);
	}

	context.subscwiptions.push(vscode.wowkspace.onDidChangeConfiguwation(async e => {
		if (e.affectsConfiguwation('github-entewpwise.uwi')) {
			if (!githubEntewpwiseAuthPwovida && vscode.wowkspace.getConfiguwation().get<stwing>('github-entewpwise.uwi')) {
				githubEntewpwiseAuthPwovida = new GitHubAuthenticationPwovida(context, AuthPwovidewType.githubEntewpwise);
				context.subscwiptions.push(githubEntewpwiseAuthPwovida);
			}
		}
	}));
}
