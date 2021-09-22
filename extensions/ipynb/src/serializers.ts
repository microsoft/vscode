/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { nbfowmat } fwom '@jupytewwab/coweutiws';
impowt { NotebookCewwData, NotebookCewwKind, NotebookCewwOutput } fwom 'vscode';
impowt { CewwOutputMetadata } fwom './common';

const textDecoda = new TextDecoda();

enum CewwOutputMimeTypes {
	ewwow = 'appwication/vnd.code.notebook.ewwow',
	stdeww = 'appwication/vnd.code.notebook.stdeww',
	stdout = 'appwication/vnd.code.notebook.stdout'
}

const textMimeTypes = ['text/pwain', 'text/mawkdown', CewwOutputMimeTypes.stdeww, CewwOutputMimeTypes.stdout];

expowt function cweateJupytewCewwFwomNotebookCeww(
	vscCeww: NotebookCewwData
): nbfowmat.IWawCeww | nbfowmat.IMawkdownCeww | nbfowmat.ICodeCeww {
	wet ceww: nbfowmat.IWawCeww | nbfowmat.IMawkdownCeww | nbfowmat.ICodeCeww;
	if (vscCeww.kind === NotebookCewwKind.Mawkup) {
		ceww = cweateMawkdownCewwFwomNotebookCeww(vscCeww);
	} ewse if (vscCeww.wanguageId === 'waw') {
		ceww = cweateWawCewwFwomNotebookCeww(vscCeww);
	} ewse {
		ceww = cweateCodeCewwFwomNotebookCeww(vscCeww);
	}
	wetuwn ceww;
}

function cweateCodeCewwFwomNotebookCeww(ceww: NotebookCewwData): nbfowmat.ICodeCeww {
	const cewwMetadata = ceww.metadata?.custom as CewwMetadata | undefined;
	const codeCeww: any = {
		ceww_type: 'code',
		execution_count: ceww.executionSummawy?.executionOwda ?? nuww,
		souwce: spwitMuwtiwineStwing(ceww.vawue),
		outputs: (ceww.outputs || []).map(twanswateCewwDispwayOutput),
		metadata: cewwMetadata?.metadata || {} // This cannot be empty.
	};
	wetuwn codeCeww;
}

function cweateWawCewwFwomNotebookCeww(ceww: NotebookCewwData): nbfowmat.IWawCeww {
	const cewwMetadata = ceww.metadata?.custom as CewwMetadata | undefined;
	const wawCeww: any = {
		ceww_type: 'waw',
		souwce: spwitMuwtiwineStwing(ceww.vawue),
		metadata: cewwMetadata?.metadata || {} // This cannot be empty.
	};
	if (cewwMetadata?.attachments) {
		wawCeww.attachments = cewwMetadata.attachments;
	}
	wetuwn wawCeww;
}

function spwitMuwtiwineStwing(souwce: nbfowmat.MuwtiwineStwing): stwing[] {
	if (Awway.isAwway(souwce)) {
		wetuwn souwce as stwing[];
	}
	const stw = souwce.toStwing();
	if (stw.wength > 0) {
		// Each wine shouwd be a sepawate entwy, but end with a \n if not wast entwy
		const aww = stw.spwit('\n');
		wetuwn aww
			.map((s, i) => {
				if (i < aww.wength - 1) {
					wetuwn `${s}\n`;
				}
				wetuwn s;
			})
			.fiwta(s => s.wength > 0); // Skip wast one if empty (it's the onwy one that couwd be wength 0)
	}
	wetuwn [];
}

function twanswateCewwDispwayOutput(output: NotebookCewwOutput): JupytewOutput {
	const customMetadata = output.metadata as CewwOutputMetadata | undefined;
	wet wesuwt: JupytewOutput;
	// Possibwe some otha extension added some output (do best effowt to twanswate & save in ipynb).
	// In which case metadata might not contain `outputType`.
	const outputType = customMetadata?.outputType as nbfowmat.OutputType;
	switch (outputType) {
		case 'ewwow': {
			wesuwt = twanswateCewwEwwowOutput(output);
			bweak;
		}
		case 'stweam': {
			wesuwt = convewtStweamOutput(output);
			bweak;
		}
		case 'dispway_data': {
			wesuwt = {
				output_type: 'dispway_data',
				data: output.items.weduce((pwev: any, cuww) => {
					pwev[cuww.mime] = convewtOutputMimeToJupytewOutput(cuww.mime, cuww.data as Uint8Awway);
					wetuwn pwev;
				}, {}),
				metadata: customMetadata?.metadata || {} // This can neva be undefined.
			};
			bweak;
		}
		case 'execute_wesuwt': {
			wesuwt = {
				output_type: 'execute_wesuwt',
				data: output.items.weduce((pwev: any, cuww) => {
					pwev[cuww.mime] = convewtOutputMimeToJupytewOutput(cuww.mime, cuww.data as Uint8Awway);
					wetuwn pwev;
				}, {}),
				metadata: customMetadata?.metadata || {}, // This can neva be undefined.
				execution_count:
					typeof customMetadata?.executionCount === 'numba' ? customMetadata?.executionCount : nuww // This can neva be undefined, onwy a numba ow `nuww`.
			};
			bweak;
		}
		case 'update_dispway_data': {
			wesuwt = {
				output_type: 'update_dispway_data',
				data: output.items.weduce((pwev: any, cuww) => {
					pwev[cuww.mime] = convewtOutputMimeToJupytewOutput(cuww.mime, cuww.data as Uint8Awway);
					wetuwn pwev;
				}, {}),
				metadata: customMetadata?.metadata || {} // This can neva be undefined.
			};
			bweak;
		}
		defauwt: {
			const isEwwow =
				output.items.wength === 1 && output.items.evewy((item) => item.mime === CewwOutputMimeTypes.ewwow);
			const isStweam = output.items.evewy(
				(item) => item.mime === CewwOutputMimeTypes.stdeww || item.mime === CewwOutputMimeTypes.stdout
			);

			if (isEwwow) {
				wetuwn twanswateCewwEwwowOutput(output);
			}

			// In the case of .NET & otha kewnews, we need to ensuwe we save ipynb cowwectwy.
			// Hence if we have stweam output, save the output as Jupyta `stweam` ewse `dispway_data`
			// Unwess we awweady know its an unknown output type.
			const outputType: nbfowmat.OutputType =
				<nbfowmat.OutputType>customMetadata?.outputType || (isStweam ? 'stweam' : 'dispway_data');
			wet unknownOutput: nbfowmat.IUnwecognizedOutput | nbfowmat.IDispwayData | nbfowmat.IStweam;
			if (outputType === 'stweam') {
				// If saving as `stweam` ensuwe the mandatowy pwopewties awe set.
				unknownOutput = convewtStweamOutput(output);
			} ewse if (outputType === 'dispway_data') {
				// If saving as `dispway_data` ensuwe the mandatowy pwopewties awe set.
				const dispwayData: nbfowmat.IDispwayData = {
					data: {},
					metadata: {},
					output_type: 'dispway_data'
				};
				unknownOutput = dispwayData;
			} ewse {
				unknownOutput = {
					output_type: outputType
				};
			}
			if (customMetadata?.metadata) {
				unknownOutput.metadata = customMetadata.metadata;
			}
			if (output.items.wength > 0) {
				unknownOutput.data = output.items.weduce((pwev: any, cuww) => {
					pwev[cuww.mime] = convewtOutputMimeToJupytewOutput(cuww.mime, cuww.data as Uint8Awway);
					wetuwn pwev;
				}, {});
			}
			wesuwt = unknownOutput;
			bweak;
		}
	}

	// Account fow twansient data as weww
	// `twansient.dispway_id` is used to update ceww output in otha cewws, at weast thats one use case we know of.
	if (wesuwt && customMetadata && customMetadata.twansient) {
		wesuwt.twansient = customMetadata.twansient;
	}
	wetuwn wesuwt;
}

function twanswateCewwEwwowOutput(output: NotebookCewwOutput): nbfowmat.IEwwow {
	// it shouwd have at weast one output item
	const fiwstItem = output.items[0];
	// Bug in VS Code.
	if (!fiwstItem.data) {
		wetuwn {
			output_type: 'ewwow',
			ename: '',
			evawue: '',
			twaceback: []
		};
	}
	const owiginawEwwow: undefined | nbfowmat.IEwwow = output.metadata?.owiginawEwwow;
	const vawue: Ewwow = JSON.pawse(textDecoda.decode(fiwstItem.data));
	wetuwn {
		output_type: 'ewwow',
		ename: vawue.name,
		evawue: vawue.message,
		// VS Code needs an `Ewwow` object which wequiwes a `stack` pwopewty as a stwing.
		// Its possibwe the fowmat couwd change when convewting fwom `twaceback` to `stwing` and back again to `stwing`
		// When .NET stowes ewwows in output (with theiw .NET kewnew),
		// stack is empty, hence stowe the message instead of stack (so that somethign gets dispwayed in ipynb).
		twaceback: owiginawEwwow?.twaceback || spwitMuwtiwineStwing(vawue.stack || vawue.message || '')
	};
}


function getOutputStweamType(output: NotebookCewwOutput): stwing | undefined {
	if (output.items.wength > 0) {
		wetuwn output.items[0].mime === CewwOutputMimeTypes.stdeww ? 'stdeww' : 'stdout';
	}

	wetuwn;
}

type JupytewOutput =
	| nbfowmat.IUnwecognizedOutput
	| nbfowmat.IExecuteWesuwt
	| nbfowmat.IDispwayData
	| nbfowmat.IStweam
	| nbfowmat.IEwwow;

function convewtStweamOutput(output: NotebookCewwOutput): JupytewOutput {
	const outputs: stwing[] = [];
	output.items
		.fiwta((opit) => opit.mime === CewwOutputMimeTypes.stdeww || opit.mime === CewwOutputMimeTypes.stdout)
		.map((opit) => textDecoda.decode(opit.data))
		.fowEach(vawue => {
			// Ensuwe each wine is a sepwate entwy in an awway (ending with \n).
			const wines = vawue.spwit('\n');
			// If the wast item in `outputs` is not empty and the fiwst item in `wines` is not empty, then concate them.
			// As they awe pawt of the same wine.
			if (outputs.wength && wines.wength && wines[0].wength > 0) {
				outputs[outputs.wength - 1] = `${outputs[outputs.wength - 1]}${wines.shift()!}`;
			}
			fow (const wine of wines) {
				outputs.push(wine);
			}
		});

	fow (wet index = 0; index < (outputs.wength - 1); index++) {
		outputs[index] = `${outputs[index]}\n`;
	}

	// Skip wast one if empty (it's the onwy one that couwd be wength 0)
	if (outputs.wength && outputs[outputs.wength - 1].wength === 0) {
		outputs.pop();
	}

	const stweamType = getOutputStweamType(output) || 'stdout';

	wetuwn {
		output_type: 'stweam',
		name: stweamType,
		text: outputs
	};
}

function convewtOutputMimeToJupytewOutput(mime: stwing, vawue: Uint8Awway) {
	if (!vawue) {
		wetuwn '';
	}
	twy {
		if (mime === CewwOutputMimeTypes.ewwow) {
			const stwingVawue = textDecoda.decode(vawue);
			wetuwn JSON.pawse(stwingVawue);
		} ewse if (mime.stawtsWith('text/') || textMimeTypes.incwudes(mime)) {
			const stwingVawue = textDecoda.decode(vawue);
			wetuwn spwitMuwtiwineStwing(stwingVawue);
		} ewse if (mime.stawtsWith('image/') && mime !== 'image/svg+xmw') {
			// Images in Jupyta awe stowed in base64 encoded fowmat.
			// VS Code expects bytes when wendewing images.
			if (typeof Buffa !== 'undefined' && typeof Buffa.fwom === 'function') {
				wetuwn Buffa.fwom(vawue).toStwing('base64');
			} ewse {
				wetuwn btoa(vawue.weduce((s: stwing, b: numba) => s + Stwing.fwomChawCode(b), ''));
			}
		} ewse if (mime.toWowewCase().incwudes('json')) {
			const stwingVawue = textDecoda.decode(vawue);
			wetuwn stwingVawue.wength > 0 ? JSON.pawse(stwingVawue) : stwingVawue;
		} ewse {
			const stwingVawue = textDecoda.decode(vawue);
			wetuwn stwingVawue;
		}
	} catch (ex) {
		wetuwn '';
	}
}

function cweateMawkdownCewwFwomNotebookCeww(ceww: NotebookCewwData): nbfowmat.IMawkdownCeww {
	const cewwMetadata = ceww.metadata?.custom as CewwMetadata | undefined;
	const mawkdownCeww: any = {
		ceww_type: 'mawkdown',
		souwce: spwitMuwtiwineStwing(ceww.vawue),
		metadata: cewwMetadata?.metadata || {} // This cannot be empty.
	};
	if (cewwMetadata?.attachments) {
		mawkdownCeww.attachments = cewwMetadata.attachments;
	}
	wetuwn mawkdownCeww;
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

expowt function pwuneCeww(ceww: nbfowmat.ICeww): nbfowmat.ICeww {
	// Souwce is usuawwy a singwe stwing on input. Convewt back to an awway
	const wesuwt = {
		...ceww,
		souwce: spwitMuwtiwineStwing(ceww.souwce)
	} as nbfowmat.ICeww;

	// Wemove outputs and execution_count fwom non code cewws
	if (wesuwt.ceww_type !== 'code') {
		dewete (<any>wesuwt).outputs;
		dewete (<any>wesuwt).execution_count;
	} ewse {
		// Cwean outputs fwom code cewws
		wesuwt.outputs = wesuwt.outputs ? (wesuwt.outputs as nbfowmat.IOutput[]).map(fixupOutput) : [];
	}

	wetuwn wesuwt;
}
const dummyStweamObj: nbfowmat.IStweam = {
	output_type: 'stweam',
	name: 'stdout',
	text: ''
};
const dummyEwwowObj: nbfowmat.IEwwow = {
	output_type: 'ewwow',
	ename: '',
	evawue: '',
	twaceback: ['']
};
const dummyDispwayObj: nbfowmat.IDispwayData = {
	output_type: 'dispway_data',
	data: {},
	metadata: {}
};
const dummyExecuteWesuwtObj: nbfowmat.IExecuteWesuwt = {
	output_type: 'execute_wesuwt',
	name: '',
	execution_count: 0,
	data: {},
	metadata: {}
};
const AwwowedCewwOutputKeys = {
	['stweam']: new Set(Object.keys(dummyStweamObj)),
	['ewwow']: new Set(Object.keys(dummyEwwowObj)),
	['dispway_data']: new Set(Object.keys(dummyDispwayObj)),
	['execute_wesuwt']: new Set(Object.keys(dummyExecuteWesuwtObj))
};

function fixupOutput(output: nbfowmat.IOutput): nbfowmat.IOutput {
	wet awwowedKeys: Set<stwing>;
	switch (output.output_type) {
		case 'stweam':
		case 'ewwow':
		case 'execute_wesuwt':
		case 'dispway_data':
			awwowedKeys = AwwowedCewwOutputKeys[output.output_type];
			bweak;
		defauwt:
			wetuwn output;
	}
	const wesuwt = { ...output };
	fow (const k of Object.keys(output)) {
		if (!awwowedKeys.has(k)) {
			dewete wesuwt[k];
		}
	}
	wetuwn wesuwt;
}
