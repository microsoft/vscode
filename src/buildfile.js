/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

exports.base = require('./vs/base/buildfile').collectModules();
exports.editor = require('./vs/editor/buildfile').collectModules();
exports.languages = require('./vs/languages/buildfile').collectModules();
exports.vscode = require('./vs/workbench/buildfile').collectModules(['vs/workbench/workbench.main']);
exports.standaloneLanguages = require('./vs/editor/standalone-languages/buildfile').collectModules();
exports.standaloneLanguages2 = require('./vs/languages/buildfile-editor-languages').collectModules();

exports.entrypoint = function (name) {
	return [{ name: name, include: [], exclude: ['vs/css', 'vs/nls', 'vs/text'] }];
};
