/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {createDecorator, ServiceIdentifier} from 'vs/platform/instantiation/common/instantiation';
import {TPromise} from 'vs/base/common/winjs.base';
import Modes = require('vs/editor/common/modes');
import MonarchTypes = require('vs/editor/common/modes/monarch/monarchTypes');
import {IDisposable} from 'vs/base/common/lifecycle';
import {IRichEditConfiguration} from 'vs/editor/common/modes/supports/richEditSupport';
import {IDeclarationContribution} from 'vs/editor/common/modes/supports/declarationSupport';
import {IReferenceContribution} from 'vs/editor/common/modes/supports/referenceSupport';
import {IParameterHintsContribution} from 'vs/editor/common/modes/supports/parameterHintsSupport';
import {ISuggestContribution} from 'vs/editor/common/modes/supports/suggestSupport';
import Event from 'vs/base/common/event';

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

export interface IModeService {
	serviceId: ServiceIdentifier<any>;

	onDidAddModes: Event<string[]>;

	configureMode(modeName: string, options: any): void;
	configureModeById(modeId: string, options: any): void;
	configureAllModes(config:any): void;
	getConfigurationForMode(modeId:string): any;

	// --- reading
	isRegisteredMode(mimetypeOrModeId: string): boolean;
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
	getMode(commaSeparatedMimetypesOrCommaSeparatedIds: string): Modes.IMode;
	getOrCreateMode(commaSeparatedMimetypesOrCommaSeparatedIds: string): TPromise<Modes.IMode>;
	getOrCreateModeByLanguageName(languageName: string): TPromise<Modes.IMode>;
	getOrCreateModeByFilenameOrFirstLine(filename: string, firstLine?:string): TPromise<Modes.IMode>;

	registerCodeLensSupport(modeId: string, support: Modes.ICodeLensSupport): IDisposable;
	registerDeclarativeDeclarationSupport(modeId: string, contribution: IDeclarationContribution): IDisposable;
	registerExtraInfoSupport(modeId: string, support: Modes.IExtraInfoSupport): IDisposable;
	registerFormattingSupport(modeId: string, support: Modes.IFormattingSupport): IDisposable;
	registerInplaceReplaceSupport(modeId: string, support: Modes.IInplaceReplaceSupport): IDisposable;
	registerOccurrencesSupport(modeId: string, support: Modes.IOccurrencesSupport): IDisposable;
	registerOutlineSupport(modeId: string, support: Modes.IOutlineSupport): IDisposable;
	registerDeclarativeParameterHintsSupport(modeId: string, support: IParameterHintsContribution): IDisposable;
	registerQuickFixSupport(modeId: string, support: Modes.IQuickFixSupport): IDisposable;
	registerDeclarativeReferenceSupport(modeId: string, contribution: IReferenceContribution): IDisposable;
	registerRenameSupport(modeId: string, support: Modes.IRenameSupport): IDisposable;
	registerDeclarativeSuggestSupport(modeId: string, declaration: ISuggestContribution): IDisposable;
	registerTokenizationSupport(modeId: string, callback: (mode: Modes.IMode) => Modes.ITokenizationSupport): IDisposable;
	registerRichEditSupport(modeId: string, support: IRichEditConfiguration): IDisposable;

	registerMonarchDefinition(modeId:string, language:MonarchTypes.ILanguage): IDisposable;
}
