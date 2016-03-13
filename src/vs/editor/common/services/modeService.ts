/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import Event from 'vs/base/common/event';
import {IDisposable} from 'vs/base/common/lifecycle';
import {TPromise} from 'vs/base/common/winjs.base';
import {ServiceIdentifier, createDecorator} from 'vs/platform/instantiation/common/instantiation';
import * as modes from 'vs/editor/common/modes';
import {ILanguage} from 'vs/editor/common/modes/monarch/monarchTypes';
import {IDeclarationContribution} from 'vs/editor/common/modes/supports/declarationSupport';
import {IParameterHintsContribution} from 'vs/editor/common/modes/supports/parameterHintsSupport';
import {IReferenceContribution} from 'vs/editor/common/modes/supports/referenceSupport';
import {IRichEditConfiguration} from 'vs/editor/common/modes/supports/richEditSupport';
import {ISuggestContribution} from 'vs/editor/common/modes/supports/suggestSupport';
import {IEditorWorkerService} from 'vs/editor/common/services/editorWorkerService';
import {IModelService} from 'vs/editor/common/services/modelService';

export var IModeService = createDecorator<IModeService>('modeService');

export interface IModeLookupResult {
	modeId: string;
	isInstantiated: boolean;
}

export interface ILanguageExtensionPoint {
	id: string;
	extensions?: string[];
	filenames?: string[];
	filenamePatterns?: string[];
	firstLine?: string;
	aliases?: string[];
	mimetypes?: string[];
	configuration?: string;
}

export interface IValidLanguageExtensionPoint {
	id: string;
	extensions: string[];
	filenames: string[];
	filenamePatterns: string[];
	firstLine: string;
	aliases: string[];
	mimetypes: string[];
	configuration: string;
}

export interface IModeService {
	serviceId: ServiceIdentifier<any>;

	onDidAddModes: Event<string[]>;
	onDidCreateMode: Event<modes.IMode>;

	configureMode(modeName: string, options: any): void;
	configureModeById(modeId: string, options: any): void;
	configureAllModes(config:any): void;
	getConfigurationForMode(modeId:string): any;

	// --- reading
	isRegisteredMode(mimetypeOrModeId: string): boolean;
	isCompatMode(modeId: string): boolean;
	getRegisteredModes(): string[];
	getRegisteredLanguageNames(): string[];
	getExtensions(alias: string): string[];
	getMimeForMode(modeId: string): string;
	getLanguageName(modeId:string): string;
	getModeIdForLanguageName(alias:string): string;
	getModeId(commaSeparatedMimetypesOrCommaSeparatedIds: string): string;
	getConfigurationFiles(modeId: string): string[];

	// --- instantiation
	lookup(commaSeparatedMimetypesOrCommaSeparatedIds: string): IModeLookupResult[];
	getMode(commaSeparatedMimetypesOrCommaSeparatedIds: string): modes.IMode;
	getOrCreateMode(commaSeparatedMimetypesOrCommaSeparatedIds: string): TPromise<modes.IMode>;
	getOrCreateModeByLanguageName(languageName: string): TPromise<modes.IMode>;
	getOrCreateModeByFilenameOrFirstLine(filename: string, firstLine?:string): TPromise<modes.IMode>;

	registerCodeLensSupport(modeId: string, support: modes.ICodeLensSupport): IDisposable;
	registerDeclarativeDeclarationSupport(modeId: string, contribution: IDeclarationContribution): IDisposable;
	registerExtraInfoSupport(modeId: string, support: modes.IExtraInfoSupport): IDisposable;
	registerFormattingSupport(modeId: string, support: modes.IFormattingSupport): IDisposable;
	registerInplaceReplaceSupport(modeId: string, support: modes.IInplaceReplaceSupport): IDisposable;
	registerOccurrencesSupport(modeId: string, support: modes.IOccurrencesSupport): IDisposable;
	registerOutlineSupport(modeId: string, support: modes.IOutlineSupport): IDisposable;
	registerDeclarativeParameterHintsSupport(modeId: string, support: IParameterHintsContribution): IDisposable;
	registerQuickFixSupport(modeId: string, support: modes.IQuickFixSupport): IDisposable;
	registerDeclarativeReferenceSupport(modeId: string, contribution: IReferenceContribution): IDisposable;
	registerRenameSupport(modeId: string, support: modes.IRenameSupport): IDisposable;
	registerDeclarativeSuggestSupport(modeId: string, declaration: ISuggestContribution): IDisposable;
	registerTokenizationSupport(modeId: string, callback: (mode: modes.IMode) => modes.ITokenizationSupport): IDisposable;
	registerRichEditSupport(modeId: string, support: IRichEditConfiguration): IDisposable;

	registerMonarchDefinition(modelService: IModelService, editorWorkerService: IEditorWorkerService, modeId:string, language:ILanguage): IDisposable;
}
