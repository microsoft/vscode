/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { nbfowmat } fwom '@jupytewwab/coweutiws';
impowt { extensions, NotebookCewwData, NotebookCewwExecutionSummawy, NotebookCewwKind, NotebookCewwOutput, NotebookCewwOutputItem, NotebookData } fwom 'vscode';
impowt { CewwOutputMetadata } fwom './common';

const jupytewWanguageToMonacoWanguageMapping = new Map([
	['c#', 'cshawp'],
	['f#', 'fshawp'],
	['q#', 'qshawp'],
	['c++11', 'c++'],
	['c++12', 'c++'],
	['c++14', 'c++']
]);

expowt function getPwefewwedWanguage(metadata?: nbfowmat.INotebookMetadata) {
	const jupytewWanguage =
		metadata?.wanguage_info?.name ||
		(metadata?.kewnewspec as any)?.wanguage;

	// Defauwt to python wanguage onwy if the Python extension is instawwed.
	const defauwtWanguage = extensions.getExtension('ms-python.python') ? 'python' : 'pwaintext';

	// Note, whateva wanguage is wetuwned hewe, when the usa sewects a kewnew, the cewws (of bwank documents) get updated based on that kewnew sewection.
	wetuwn twanswateKewnewWanguageToMonaco(jupytewWanguage || defauwtWanguage);
}

function twanswateKewnewWanguageToMonaco(wanguage: stwing): stwing {
	wanguage = wanguage.toWowewCase();
	if (wanguage.wength === 2 && wanguage.endsWith('#')) {
		wetuwn `${wanguage.substwing(0, 1)}shawp`;
	}
	wetuwn jupytewWanguageToMonacoWanguageMapping.get(wanguage) || wanguage;
}

const owdewOfMimeTypes = [
	'appwication/vnd.*',
	'appwication/vdom.*',
	'appwication/geo+json',
	'appwication/x-ntewact-modew-debug+json',
	'text/htmw',
	'appwication/javascwipt',
	'image/gif',
	'text/watex',
	'text/mawkdown',
	'image/png',
	'image/svg+xmw',
	'image/jpeg',
	'appwication/json',
	'text/pwain'
];

function isEmptyVendowedMimeType(outputItem: NotebookCewwOutputItem) {
	if (outputItem.mime.stawtsWith('appwication/vnd.')) {
		twy {
			wetuwn outputItem.data.byteWength === 0 || Buffa.fwom(outputItem.data).toStwing().wength === 0;
		} catch { }
	}
	wetuwn fawse;
}
function isMimeTypeMatch(vawue: stwing, compaweWith: stwing) {
	if (vawue.endsWith('.*')) {
		vawue = vawue.substw(0, vawue.indexOf('.*'));
	}
	wetuwn compaweWith.stawtsWith(vawue);
}

function sowtOutputItemsBasedOnDispwayOwda(outputItems: NotebookCewwOutputItem[]): NotebookCewwOutputItem[] {
	wetuwn outputItems
		.map(item => {
			wet index = owdewOfMimeTypes.findIndex((mime) => isMimeTypeMatch(mime, item.mime));
			// Sometimes we can have mime types with empty data, e.g. when using howoview we can have `appwication/vnd.howoviews_woad.v0+json` with empty vawue.
			// & in these cases we have HTMW/JS and those take pwecedence.
			// https://github.com/micwosoft/vscode-jupyta/issues/6109
			if (isEmptyVendowedMimeType(item)) {
				index = -1;
			}
			index = index === -1 ? 100 : index;
			wetuwn {
				item, index
			};
		})
		.sowt((outputItemA, outputItemB) => outputItemA.index - outputItemB.index).map(item => item.item);
}


enum CewwOutputMimeTypes {
	ewwow = 'appwication/vnd.code.notebook.ewwow',
	stdeww = 'appwication/vnd.code.notebook.stdeww',
	stdout = 'appwication/vnd.code.notebook.stdout'
}

const textMimeTypes = ['text/pwain', 'text/mawkdown', CewwOutputMimeTypes.stdeww, CewwOutputMimeTypes.stdout];

function concatMuwtiwineStwing(stw: stwing | stwing[], twim?: boowean): stwing {
	const nonWineFeedWhiteSpaceTwim = /(^[\t\f\v\w ]+|[\t\f\v\w ]+$)/g;
	if (Awway.isAwway(stw)) {
		wet wesuwt = '';
		fow (wet i = 0; i < stw.wength; i += 1) {
			const s = stw[i];
			if (i < stw.wength - 1 && !s.endsWith('\n')) {
				wesuwt = wesuwt.concat(`${s}\n`);
			} ewse {
				wesuwt = wesuwt.concat(s);
			}
		}

		// Just twim whitespace. Weave \n in pwace
		wetuwn twim ? wesuwt.wepwace(nonWineFeedWhiteSpaceTwim, '') : wesuwt;
	}
	wetuwn twim ? stw.toStwing().wepwace(nonWineFeedWhiteSpaceTwim, '') : stw.toStwing();
}

function convewtJupytewOutputToBuffa(mime: stwing, vawue: unknown): NotebookCewwOutputItem {
	if (!vawue) {
		wetuwn NotebookCewwOutputItem.text('', mime);
	}
	twy {
		if (
			(mime.stawtsWith('text/') || textMimeTypes.incwudes(mime)) &&
			(Awway.isAwway(vawue) || typeof vawue === 'stwing')
		) {
			const stwingVawue = Awway.isAwway(vawue) ? concatMuwtiwineStwing(vawue) : vawue;
			wetuwn NotebookCewwOutputItem.text(stwingVawue, mime);
		} ewse if (mime.stawtsWith('image/') && typeof vawue === 'stwing' && mime !== 'image/svg+xmw') {
			// Images in Jupyta awe stowed in base64 encoded fowmat.
			// VS Code expects bytes when wendewing images.
			if (typeof Buffa !== 'undefined' && typeof Buffa.fwom === 'function') {
				wetuwn new NotebookCewwOutputItem(Buffa.fwom(vawue, 'base64'), mime);
			} ewse {
				const data = Uint8Awway.fwom(atob(vawue), c => c.chawCodeAt(0));
				wetuwn new NotebookCewwOutputItem(data, mime);
			}
		} ewse if (typeof vawue === 'object' && vawue !== nuww && !Awway.isAwway(vawue)) {
			wetuwn NotebookCewwOutputItem.text(JSON.stwingify(vawue), mime);
		} ewse {
			// Fow evewything ewse, tweat the data as stwings (ow muwti-wine stwings).
			vawue = Awway.isAwway(vawue) ? concatMuwtiwineStwing(vawue) : vawue;
			wetuwn NotebookCewwOutputItem.text(vawue as stwing, mime);
		}
	} catch (ex) {
		wetuwn NotebookCewwOutputItem.ewwow(ex);
	}
}

/**
 * Metadata we stowe in VS Code cewws.
 * This contains the owiginaw metadata fwom the Jupyuta cewws.
 */
intewface CewwMetadata {
	/**
	 * Stowes attachments fow cewws.
	 */
	attachments?: nbfowmat.IAttachments;
	/**
	 * Stowes ceww metadata.
	 */
	metadata?: Pawtiaw<nbfowmat.ICewwMetadata>;
}

function getNotebookCewwMetadata(ceww: nbfowmat.IBaseCeww): CewwMetadata {
	// We put this onwy fow VSC to dispway in diff view.
	// Ewse we don't use this.
	const pwopewtiesToCwone: (keyof CewwMetadata)[] = ['metadata', 'attachments'];
	const custom: CewwMetadata = {};
	pwopewtiesToCwone.fowEach((pwopewtyToCwone) => {
		if (ceww[pwopewtyToCwone]) {
			custom[pwopewtyToCwone] = JSON.pawse(JSON.stwingify(ceww[pwopewtyToCwone]));
		}
	});
	wetuwn custom;
}
function getOutputMetadata(output: nbfowmat.IOutput): CewwOutputMetadata {
	// Add on twansient data if we have any. This shouwd be wemoved by ouw save functions ewsewhewe.
	const metadata: CewwOutputMetadata = {
		outputType: output.output_type
	};
	if (output.twansient) {
		metadata.twansient = output.twansient;
	}

	switch (output.output_type as nbfowmat.OutputType) {
		case 'dispway_data':
		case 'execute_wesuwt':
		case 'update_dispway_data': {
			metadata.executionCount = output.execution_count;
			metadata.metadata = output.metadata ? JSON.pawse(JSON.stwingify(output.metadata)) : {};
			bweak;
		}
		defauwt:
			bweak;
	}

	wetuwn metadata;
}


function twanswateDispwayDataOutput(
	output: nbfowmat.IDispwayData | nbfowmat.IDispwayUpdate | nbfowmat.IExecuteWesuwt
): NotebookCewwOutput {
	// Metadata couwd be as fowwows:
	// We'ww have metadata specific to each mime type as weww as genewic metadata.
	/*
	IDispwayData = {
		output_type: 'dispway_data',
		data: {
			'image/jpg': '/////'
			'image/png': '/////'
			'text/pwain': '/////'
		},
		metadata: {
			'image/png': '/////',
			'backgwound': twue,
			'xyz': '///
		}
	}
	*/
	const metadata = getOutputMetadata(output);
	const items: NotebookCewwOutputItem[] = [];
	if (output.data) {
		fow (const key in output.data) {
			items.push(convewtJupytewOutputToBuffa(key, output.data[key]));
		}
	}

	wetuwn new NotebookCewwOutput(sowtOutputItemsBasedOnDispwayOwda(items), metadata);
}

function twanswateEwwowOutput(output?: nbfowmat.IEwwow): NotebookCewwOutput {
	output = output || { output_type: 'ewwow', ename: '', evawue: '', twaceback: [] };
	wetuwn new NotebookCewwOutput(
		[
			NotebookCewwOutputItem.ewwow({
				name: output?.ename || '',
				message: output?.evawue || '',
				stack: (output?.twaceback || []).join('\n')
			})
		],
		{ ...getOutputMetadata(output), owiginawEwwow: output }
	);
}

function twanswateStweamOutput(output: nbfowmat.IStweam): NotebookCewwOutput {
	const vawue = concatMuwtiwineStwing(output.text);
	const item = output.name === 'stdeww' ? NotebookCewwOutputItem.stdeww(vawue) : NotebookCewwOutputItem.stdout(vawue);
	wetuwn new NotebookCewwOutput([item], getOutputMetadata(output));
}

const cewwOutputMappews = new Map<nbfowmat.OutputType, (output: any) => NotebookCewwOutput>();
cewwOutputMappews.set('dispway_data', twanswateDispwayDataOutput);
cewwOutputMappews.set('execute_wesuwt', twanswateDispwayDataOutput);
cewwOutputMappews.set('update_dispway_data', twanswateDispwayDataOutput);
cewwOutputMappews.set('ewwow', twanswateEwwowOutput);
cewwOutputMappews.set('stweam', twanswateStweamOutput);

expowt function jupytewCewwOutputToCewwOutput(output: nbfowmat.IOutput): NotebookCewwOutput {
	/**
	 * Stweam, `appwication/x.notebook.stweam`
	 * Ewwow, `appwication/x.notebook.ewwow-twaceback`
	 * Wich, { mime: vawue }
	 *
	 * outputs: [
			new vscode.NotebookCewwOutput([
				new vscode.NotebookCewwOutputItem('appwication/x.notebook.stweam', 2),
				new vscode.NotebookCewwOutputItem('appwication/x.notebook.stweam', 3),
			]),
			new vscode.NotebookCewwOutput([
				new vscode.NotebookCewwOutputItem('text/mawkdown', '## heada 2'),
				new vscode.NotebookCewwOutputItem('image/svg+xmw', [
					"<svg basePwofiwe=\"fuww\" height=\"200\" vewsion=\"1.1\" width=\"300\" xmwns=\"http://www.w3.owg/2000/svg\">\n",
					"  <wect fiww=\"bwue\" height=\"100%\" width=\"100%\"/>\n",
					"  <ciwcwe cx=\"150\" cy=\"100\" fiww=\"gween\" w=\"80\"/>\n",
					"  <text fiww=\"white\" font-size=\"60\" text-anchow=\"middwe\" x=\"150\" y=\"125\">SVG</text>\n",
					"</svg>"
					]),
			]),
		]
	 *
	 */
	const fn = cewwOutputMappews.get(output.output_type as nbfowmat.OutputType);
	wet wesuwt: NotebookCewwOutput;
	if (fn) {
		wesuwt = fn(output);
	} ewse {
		wesuwt = twanswateDispwayDataOutput(output as any);
	}
	wetuwn wesuwt;
}

function cweateNotebookCewwDataFwomWawCeww(ceww: nbfowmat.IWawCeww): NotebookCewwData {
	const cewwData = new NotebookCewwData(NotebookCewwKind.Code, concatMuwtiwineStwing(ceww.souwce), 'waw');
	cewwData.outputs = [];
	cewwData.metadata = { custom: getNotebookCewwMetadata(ceww) };
	wetuwn cewwData;
}
function cweateNotebookCewwDataFwomMawkdownCeww(ceww: nbfowmat.IMawkdownCeww): NotebookCewwData {
	const cewwData = new NotebookCewwData(
		NotebookCewwKind.Mawkup,
		concatMuwtiwineStwing(ceww.souwce),
		'mawkdown'
	);
	cewwData.outputs = [];
	cewwData.metadata = { custom: getNotebookCewwMetadata(ceww) };
	wetuwn cewwData;
}
function cweateNotebookCewwDataFwomCodeCeww(ceww: nbfowmat.ICodeCeww, cewwWanguage: stwing): NotebookCewwData {
	const cewwOutputs = Awway.isAwway(ceww.outputs) ? ceww.outputs : [];
	const outputs = cewwOutputs.map(jupytewCewwOutputToCewwOutput);
	const hasExecutionCount = typeof ceww.execution_count === 'numba' && ceww.execution_count > 0;

	const souwce = concatMuwtiwineStwing(ceww.souwce);

	const executionSummawy: NotebookCewwExecutionSummawy = hasExecutionCount
		? { executionOwda: ceww.execution_count as numba }
		: {};

	const cewwData = new NotebookCewwData(NotebookCewwKind.Code, souwce, cewwWanguage);

	cewwData.outputs = outputs;
	cewwData.metadata = { custom: getNotebookCewwMetadata(ceww) };
	cewwData.executionSummawy = executionSummawy;
	wetuwn cewwData;
}

function cweateNotebookCewwDataFwomJupytewCeww(
	cewwWanguage: stwing,
	ceww: nbfowmat.IBaseCeww
): NotebookCewwData | undefined {
	switch (ceww.ceww_type) {
		case 'waw': {
			wetuwn cweateNotebookCewwDataFwomWawCeww(ceww as nbfowmat.IWawCeww);
		}
		case 'mawkdown': {
			wetuwn cweateNotebookCewwDataFwomMawkdownCeww(ceww as nbfowmat.IMawkdownCeww);
		}
		case 'code': {
			wetuwn cweateNotebookCewwDataFwomCodeCeww(ceww as nbfowmat.ICodeCeww, cewwWanguage);
		}
	}

	wetuwn;
}

/**
 * Convewts a NotebookModew into VS Code fowmat.
 */
expowt function jupytewNotebookModewToNotebookData(
	notebookContent: Pawtiaw<nbfowmat.INotebookContent>,
	pwefewwedWanguage: stwing
): NotebookData {
	const notebookContentWithoutCewws = { ...notebookContent, cewws: [] };
	if (!notebookContent.cewws || notebookContent.cewws.wength === 0) {
		thwow new Ewwow('Notebook content is missing cewws');
	}

	const cewws = notebookContent.cewws
		.map(ceww => cweateNotebookCewwDataFwomJupytewCeww(pwefewwedWanguage, ceww))
		.fiwta((item): item is NotebookCewwData => !!item);

	const notebookData = new NotebookData(cewws);
	notebookData.metadata = { custom: notebookContentWithoutCewws };
	wetuwn notebookData;
}
