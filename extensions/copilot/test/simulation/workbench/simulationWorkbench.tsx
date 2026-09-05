/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ipcRenderer } from 'electron';
import * as path from 'path';
import * as React from 'react';
import { render } from 'react-dom';
import { Disposable } from '../../../src/util/vs/base/common/lifecycle';
import { App, DisplayOptions } from './components/app';
import { InitArgs, parseInitEventArgs as parseProcessArgv } from './initArgs';
import { AdhocRequestOptions } from './stores/adhocRequestOptions';
import { AdhocRequestSender } from './stores/adhocRequestSender';
import { AMLProvider } from './stores/amlSimulations';
import { NesExternalOptions } from './stores/nesExternalOptions';
import { RunnerOptions } from './stores/runnerOptions';
import { SimulationRunsProvider } from './stores/simulationBaseline';
import { SimulationRunner } from './stores/simulationRunner';
import { SimulationStorage } from './stores/simulationStorage';
import { SimulationTestsProvider } from './stores/simulationTestsProvider';
import { TestSource, TestSourceValue } from './stores/testSource';
import { WorkbenchMode, WorkbenchModeValue } from './stores/workbenchMode';
import { REPO_ROOT, monacoModule } from './utils/utils';


class SimulationWorkbench extends Disposable {
	private readonly storage: SimulationStorage;
	private readonly workbenchMode: WorkbenchModeValue;
	private readonly testSource: TestSourceValue;
	private readonly simulationRunsProvider: SimulationRunsProvider;
	private readonly amlProvider: AMLProvider;
	private readonly runner: SimulationRunner;
	private readonly runnerOptions: RunnerOptions;
	private readonly nesExternalOptions: NesExternalOptions;
	private readonly adhocRequestOptions: AdhocRequestOptions;
	private readonly adhocRequestSender: AdhocRequestSender;
	private readonly tests: SimulationTestsProvider;
	private readonly displayOptions: DisplayOptions;

	constructor() {
		super();

		this.storage = new SimulationStorage();
		this.workbenchMode = this.storage.bind<WorkbenchMode>('workbenchMode', 'tests');
		this.testSource = this.storage.bind('testSource', TestSource.Local);
		// Sanitize a possibly stale `testSource` from earlier builds where the adhoc
		// request mode was (incorrectly) modeled as a `TestSource` member.
		if (this.testSource.value !== TestSource.Local && this.testSource.value !== TestSource.External && this.testSource.value !== TestSource.NesExternal) {
			this.testSource.value = TestSource.Local;
		}
		this.amlProvider = this._register(new AMLProvider(this.storage));
		this.runnerOptions = new RunnerOptions(this.storage);
		this.nesExternalOptions = new NesExternalOptions(this.storage);
		this.adhocRequestOptions = new AdhocRequestOptions(this.storage);
		this.adhocRequestSender = new AdhocRequestSender();
		this.runner = this._register(new SimulationRunner(this.storage, this.runnerOptions));
		this.simulationRunsProvider = this._register(new SimulationRunsProvider(this.storage, this.runner));
		this.tests = this._register(new SimulationTestsProvider(this.testSource, this.runner, this.simulationRunsProvider, this.amlProvider, this.nesExternalOptions));
		this.displayOptions = new DisplayOptions(this.storage);
	}

	public run(initArgs: InitArgs | undefined) {
		const elt = document.createElement('div');
		elt.style.minHeight = 'inherit';
		document.body.appendChild(elt);
		render(
			<App
				initArgs={initArgs}
				testsProvider={this.tests}
				workbenchMode={this.workbenchMode}
				runner={this.runner}
				runnerOptions={this.runnerOptions}
				nesExternalOptions={this.nesExternalOptions}
				adhocRequestOptions={this.adhocRequestOptions}
				adhocRequestSender={this.adhocRequestSender}
				simulationRunsProvider={this.simulationRunsProvider}
				amlProvider={this.amlProvider}
				displayOptions={this.displayOptions}
			/>,
			elt
		);
	}
}

let monacoPromise: Promise<typeof import('monaco-editor')> | undefined = undefined;
function loadMonaco(): Promise<typeof import('monaco-editor')> {
	if (!monacoPromise) {
		monacoPromise = doLoadMonaco();
	}
	return monacoPromise;
}

function doLoadMonaco(): Promise<typeof import('monaco-editor')> {
	return new Promise<typeof import('monaco-editor')>((resolve, reject) => {
		const amdLoader = require('../../node_modules/monaco-editor/min/vs/loader.js');
		const amdRequire = amdLoader.require;

		function uriFromPath(_path: string) {
			let pathName = path.resolve(_path).replace(/\\/g, '/');
			if (pathName.length > 0 && pathName.charAt(0) !== '/') {
				pathName = '/' + pathName;
			}
			return encodeURI('file://' + pathName);
		}

		const baseUrl = uriFromPath(path.join(REPO_ROOT, 'node_modules/monaco-editor/min'));
		amdRequire.config({ baseUrl });

		amdRequire(['vs/editor/editor.main'], function (monaco: typeof import('monaco-editor')) {
			resolve(monaco);
		}, reject);
	});
}

async function startup() {
	monacoModule.value = await loadMonaco();
	const processArgv: string[] = await ipcRenderer.invoke('processArgv');
	const parsedArgs = parseProcessArgv(processArgv);
	new SimulationWorkbench().run(parsedArgs);
}

startup();
