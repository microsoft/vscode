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
import {KeybindingsRegistry} from 'vs/platform/keybinding/common/keybindingsRegistry';
import {IInstantiationService, ServicesAccessor} from 'vs/platform/instantiation/common/instantiation';
import {IThemeService} from 'vs/workbench/services/themes/common/themeService';
import {IWorkbenchEditorService} from 'vs/workbench/services/editor/common/editorService';
import {KeyCode, KeyMod} from 'vs/base/common/keyCodes';
import {asFileEditorInput} from 'vs/workbench/common/editor';


interface Data {
	c: string; // content
	t: string; // token
	r: { [theme:string]:string}
}

class Snapper {

	constructor(
		@IModeService private modeService: IModeService,
		@IThemeService private themeService: IThemeService
	) {
	}

	private getTestNode(themeId: string) : Element {
		let editorNode = document.createElement('div');
		editorNode.className = 'monaco-editor ' + themeId;
		document.body.appendChild(editorNode);

		let element = document.createElement('span');

		editorNode.appendChild(element);

		return element;
	}

	private normalizeType(type: string) : string {
		return type.split('.').sort().join('.');
	}

	private getStyle(testNode: Element, scope: string) : string {

		testNode.className = 'token ' + scope.replace(/\./g, ' ');

		let cssStyles = window.getComputedStyle(testNode);
		if (cssStyles) {
			return cssStyles.color;
		}
		return '';
	}

	private getMatchedCSSRule(testNode: Element, scope: string) : string {

		testNode.className = 'token ' + scope.replace(/\./g, ' ');

		let rulesList = window.getMatchedCSSRules(testNode);

		if (rulesList) {
			for (let i = rulesList.length - 1; i >= 0 ; i--) {
				let selectorText = <string> rulesList.item(i)['selectorText'];
				if (selectorText && selectorText.match(/\.monaco-editor\..+token/) ) {
					return selectorText.substr(14);
				}
			}
		} else {
			console.log('no match ' + scope);
		}

		return '';
	}


	public appendThemeInformation(data: Data[]) : TPromise<Data[]> {
		let currentTheme = this.themeService.getTheme();

		let getThemeName = (id: string) => {
			let part = 'vscode-theme-defaults-themes-';
			let startIdx = id.indexOf(part);
			if (startIdx !== -1) {
				return id.substring(startIdx + part.length, id.length - 5);
			}
			return void 0;
		}

		return this.themeService.getThemes().then(themeDatas => {
			let defaultThemes = themeDatas.filter(themeData => !!getThemeName(themeData.id));
			return TPromise.join(defaultThemes.map(defaultTheme => {
				let themeId = defaultTheme.id;
				return this.themeService.setTheme(themeId, false).then(success => {
					if (success) {
						let testNode = this.getTestNode(themeId);
						let themeName = getThemeName(themeId);
						data.forEach(entry => {
							entry.r[themeName] = this.getMatchedCSSRule(testNode, entry.t) + ' ' + this.getStyle(testNode, entry.t)
						});
					}
				});
			}));
		}).then(_ => {
			return this.themeService.setTheme(currentTheme, false).then(_ => {
				return data;
			});
		});
	}

	public captureSyntaxTokens(fileName: string, content: string) : TPromise<Data[]> {
		return this.modeService.getOrCreateModeByFilenameOrFirstLine(fileName).then(mode => {
			let result : Data[] = [];
			let model = new TextModelWithTokens([], TextModel.toRawText(content, TextModel.DEFAULT_CREATION_OPTIONS), mode);
			model.tokenIterator({lineNumber: 1, column: 1}, iterator => {
				while (iterator.hasNext()) {
					let tokenInfo = iterator.next();
					let lineNumber = tokenInfo.lineNumber;
					let content = model.getValueInRange({ startLineNumber: lineNumber, endLineNumber: lineNumber, startColumn: tokenInfo.startColumn, endColumn: tokenInfo.endColumn});
					result.push({
						c: content,
						t: this.normalizeType(tokenInfo.token.type),
						r: {}
					});
				}
			});
			return this.appendThemeInformation(result);
		});
	}
}

KeybindingsRegistry.registerCommandDesc({
	id: '_workbench.captureSyntaxTokens',
	weight: KeybindingsRegistry.WEIGHT.workbenchContrib(0),
	handler(accessor: ServicesAccessor, resource:URI) {

		let process = (resource: URI) => {
			let filePath = resource.fsPath;
			let fileName = paths.basename(filePath);
			let snapper = accessor.get(IInstantiationService).createInstance(Snapper);

			return pfs.readFile(filePath).then(content => {
				return snapper.captureSyntaxTokens(fileName, content.toString());
			});
		};

		if (!resource) {
			let editorService = accessor.get(IWorkbenchEditorService);
			let fileEditorInput = asFileEditorInput(editorService.getActiveEditorInput());
			if (fileEditorInput) {
				process(fileEditorInput.getResource()).then(result => {
					console.log(result);
				});
			} else {
				console.log('No file editor active');
			}
		} else {
			return process(resource);
		}

	},
	when: undefined,
	primary: undefined
});

