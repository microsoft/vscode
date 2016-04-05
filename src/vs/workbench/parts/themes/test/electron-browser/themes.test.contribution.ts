/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as nls from 'vs/nls';
import {IDisposable, dispose} from 'vs/base/common/lifecycle';
import {TPromise} from 'vs/base/common/winjs.base';
import {Range} from 'vs/editor/common/core/range';
import {SyncActionDescriptor} from 'vs/platform/actions/common/actions';
import {Action} from 'vs/base/common/actions';
import WorkbenchContributions = require('vs/workbench/common/contributions');
import {IWorkspace} from 'vs/platform/workspace/common/workspace';
import paths = require('vs/base/common/paths');
import URI from 'vs/base/common/uri';

import Platform = require('vs/platform/platform');
import WorkbenchActionRegistry = require('vs/workbench/common/actionRegistry');
import {IFileStat} from 'vs/platform/files/common/files';
import {TextModelWithTokens} from 'vs/editor/common/model/textModelWithTokens';
import {TextModel} from 'vs/editor/common/model/textModel';
import {IModeService} from 'vs/editor/common/services/modeService';
import pfs = require('vs/base/node/pfs');


interface Data {
	c: string; // content
	t: string; // token
	r: string; // rule
}

const ID = 'workbench.action.snapshotAction';
const LABEL = nls.localize('togglePosition', "Take Theme Snapshot");

class SnapshotAction extends Action {

	private currentSrcFolder: string;

	constructor(id: string, label: string,
		@IModeService private modeService: IModeService
	) {
		super(id, label);
		let outFolder = require.toUrl('');
		this.currentSrcFolder = paths.normalize(paths.join(outFolder, "../src/vs/workbench/parts/themes/test/electron-browser"));
	}

	public run(): TPromise<any> {
		let fixturesPath = URI.parse(paths.join(this.currentSrcFolder, 'fixtures')).fsPath;
		return pfs.readdir(fixturesPath).then(fileNames => {
			return TPromise.join(fileNames.map(fileName => {
				return pfs.readFile(paths.join(fixturesPath, fileName)).then(content => {
					return this.snap(fileName, content.toString()).then(result => {
						return this.verify(fileName, result);
					});
				});
			}));
		}, err => {
			console.log(err.toString());
		});
	}

	public getId() : string {
		return "TokenizationSnapshotController";
	}

	private getEditorNode() : Element {
		let editorNodes = document.getElementsByClassName('monaco-editor');
		if (editorNodes.length > 0) {
			return editorNodes.item(0);
		}
		return null;
	}

	private getStyle(scope: string) : string {

		let element = document.createElement('span');
		element.className = scope;
		element.hidden = true;

		let cssStyles = window.getComputedStyle(element);
		if (cssStyles) {
			return cssStyles.color;
		}
		return '';
	}

	private getMatchedCSSRule(scope: string) : string {
		let element = document.createElement('span');
		element.className = 'token ' + scope;
		element.hidden = true;

		let editorNode = this.getEditorNode();
		editorNode.appendChild(element);

		let rulesList = window.getMatchedCSSRules(element);

		editorNode.removeChild(element);

		if (rulesList) {
			for (let i = rulesList.length - 1; i >= 0 ; i--) {
				let selectorText = <string> rulesList.item(i)['selectorText'];
				if (selectorText && selectorText.indexOf('.monaco-editor.vs') === 0) {
					return selectorText.substr(14);
				}
			}
		}

		return '';
	}

	public snap(fileName: string, content: string) : TPromise<Data[]> {
		return this.modeService.getOrCreateModeByFilenameOrFirstLine(fileName).then(mode => {
			let result : Data[] = [];
			let model = new TextModelWithTokens([], TextModel.toRawText(content, TextModel.DEFAULT_CREATION_OPTIONS), false, mode);
			model.tokenIterator({lineNumber: 1, column: 1}, iterator => {
				while (iterator.hasNext()) {
					let tokenInfo = iterator.next();
					let lineNumber = tokenInfo.lineNumber;
					let content = model.getValueInRange({ startLineNumber: lineNumber, endLineNumber: lineNumber, startColumn: tokenInfo.startColumn, endColumn: tokenInfo.endColumn});
					result.push({
						c: content,
						t: tokenInfo.token.type,
						r: this.getMatchedCSSRule(tokenInfo.token.type)
					});
				}
			});
			return result;
		});
	}

	public verify(fileName: string, data: Data[]) : TPromise<any> {
		let dataString = JSON.stringify(data, null, '\t');
		let resultFileName = fileName.replace('.', '_') + '.json';
		let resultPath = URI.parse(paths.join(this.currentSrcFolder, 'results', resultFileName)).fsPath;

		return pfs.fileExists(resultPath).then(success => {
			if (success) {
				return pfs.readFile(resultPath).then(content => {
					let previousDataString = content.toString();
					if (previousDataString !== dataString) {
						let errorResultFileName = fileName.replace('.', '_') + '.error.json';
						let errorResultPath = URI.parse(paths.join(this.currentSrcFolder, 'results', errorResultFileName)).fsPath;
						console.log(`Different result for ${fileName}`);
						return pfs.writeFile(errorResultPath, dataString);
					}
					return true;
				});
			} else {
				return pfs.writeFile(resultPath, dataString);
			}
		});
	}
}

var workbenchActionsRegistry = <WorkbenchActionRegistry.IWorkbenchActionRegistry> Platform.Registry.as(WorkbenchActionRegistry.Extensions.WorkbenchActions);

workbenchActionsRegistry.registerWorkbenchAction(new SyncActionDescriptor(SnapshotAction, ID, LABEL), nls.localize('view', "View"));

