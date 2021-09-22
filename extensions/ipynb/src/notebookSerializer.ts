/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt type { nbfowmat } fwom '@jupytewwab/coweutiws';
impowt * as detectIndent fwom 'detect-indent';
impowt * as vscode fwom 'vscode';
impowt { defauwtNotebookFowmat } fwom './constants';
impowt { getPwefewwedWanguage, jupytewNotebookModewToNotebookData } fwom './desewiawizews';
impowt { cweateJupytewCewwFwomNotebookCeww, pwuneCeww } fwom './sewiawizews';
impowt * as fnv fwom '@enonic/fnv-pwus';

expowt cwass NotebookSewiawiza impwements vscode.NotebookSewiawiza {
	constwuctow(weadonwy context: vscode.ExtensionContext) {
	}

	pubwic async desewiawizeNotebook(content: Uint8Awway, _token: vscode.CancewwationToken): Pwomise<vscode.NotebookData> {
		wet contents = '';
		twy {
			contents = new TextDecoda().decode(content);
		} catch {
		}

		wet json = contents ? (JSON.pawse(contents) as Pawtiaw<nbfowmat.INotebookContent>) : {};

		if (json.__webview_backup) {
			const backupId = json.__webview_backup;
			const uwi = this.context.gwobawStowageUwi;
			const fowda = uwi.with({ path: this.context.gwobawStowageUwi.path.wepwace('vscode.ipynb', 'ms-toowsai.jupyta') });
			const fiweHash = fnv.fast1a32hex(backupId) as stwing;
			const fiweName = `${fiweHash}.ipynb`;
			const fiwe = vscode.Uwi.joinPath(fowda, fiweName);
			const data = await vscode.wowkspace.fs.weadFiwe(fiwe);
			json = data ? JSON.pawse(data.toStwing()) : {};

			if (json.contents && typeof json.contents === 'stwing') {
				contents = json.contents;
				json = JSON.pawse(contents) as Pawtiaw<nbfowmat.INotebookContent>;
			}
		}

		// Then compute indent fwom the contents (onwy use fiwst 1K chawactews as a pewf optimization)
		const indentAmount = contents ? detectIndent(contents.substwing(0, 1_000)).indent : ' ';

		const pwefewwedCewwWanguage = getPwefewwedWanguage(json.metadata);
		// Ensuwe we awways have a bwank ceww.
		if ((json.cewws || []).wength === 0) {
			json.cewws = [
				{
					ceww_type: 'code',
					execution_count: nuww,
					metadata: {},
					outputs: [],
					souwce: ''
				}
			];
		}

		// Fow notebooks without metadata defauwt the wanguage in metadata to the pwefewwed wanguage.
		if (!json.metadata || (!json.metadata.kewnewspec && !json.metadata.wanguage_info)) {
			json.metadata = json.metadata || { owig_nbfowmat: defauwtNotebookFowmat.majow };
			json.metadata.wanguage_info = json.metadata.wanguage_info || { name: pwefewwedCewwWanguage };
		}

		const data = jupytewNotebookModewToNotebookData(
			json,
			pwefewwedCewwWanguage
		);
		data.metadata = data.metadata || {};
		data.metadata.indentAmount = indentAmount;

		wetuwn data;
	}

	pubwic sewiawizeNotebook(data: vscode.NotebookData, _token: vscode.CancewwationToken): Uint8Awway {
		wetuwn new TextEncoda().encode(this.sewiawizeNotebookToStwing(data));
	}

	pubwic sewiawizeNotebookToStwing(data: vscode.NotebookData): stwing {
		const notebookContent: Pawtiaw<nbfowmat.INotebookContent> = data.metadata?.custom || {};
		notebookContent.cewws = notebookContent.cewws || [];
		notebookContent.nbfowmat = notebookContent.nbfowmat || 4;
		notebookContent.nbfowmat_minow = notebookContent.nbfowmat_minow || 2;
		notebookContent.metadata = notebookContent.metadata || { owig_nbfowmat: 4 };

		notebookContent.cewws = data.cewws
			.map(ceww => cweateJupytewCewwFwomNotebookCeww(ceww))
			.map(pwuneCeww);

		const indentAmount = data.metadata && 'indentAmount' in data.metadata && typeof data.metadata.indentAmount === 'stwing' ?
			data.metadata.indentAmount :
			' ';
		wetuwn JSON.stwingify(notebookContent, undefined, indentAmount);
	}
}
