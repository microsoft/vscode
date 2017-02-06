/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import 'vs/css!./media/standalone-tokens';
import * as editorCommon from 'vs/editor/common/editorCommon';
import { ICodeEditor, ContentWidgetPositionPreference, OverlayWidgetPositionPreference } from 'vs/editor/browser/editorBrowser';
import { StandaloneEditor, IStandaloneCodeEditor, StandaloneDiffEditor, IStandaloneDiffEditor, IEditorConstructionOptions, IDiffEditorConstructionOptions } from 'vs/editor/browser/standalone/standaloneCodeEditor';
import { ScrollbarVisibility } from 'vs/base/common/scrollable';
import { IEditorOverrideServices, DynamicStandaloneServices, StaticServices } from 'vs/editor/browser/standalone/standaloneServices';
import { IDisposable } from 'vs/base/common/lifecycle';
import URI from 'vs/base/common/uri';
import { TPromise } from 'vs/base/common/winjs.base';
import { OpenerService } from 'vs/platform/opener/browser/openerService';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import { Colorizer, IColorizerElementOptions, IColorizerOptions } from 'vs/editor/browser/standalone/colorizer';
import { SimpleEditorService, SimpleEditorModelResolverService } from 'vs/editor/browser/standalone/simpleServices';
import * as modes from 'vs/editor/common/modes';
import { IWebWorkerOptions, MonacoWebWorker, createWebWorker as actualCreateWebWorker } from 'vs/editor/common/services/webWorker';
import { IMarkerData } from 'vs/platform/markers/common/markers';
import { DiffNavigator } from 'vs/editor/contrib/diffNavigator/common/diffNavigator';
import { IEditorService } from 'vs/platform/editor/common/editor';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { IContextViewService } from 'vs/platform/contextview/browser/contextView';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { ICodeEditorService } from 'vs/editor/common/services/codeEditorService';
import { IEditorWorkerService } from 'vs/editor/common/services/editorWorkerService';
import { ITextModelResolverService } from 'vs/editor/common/services/resolverService';
import { NULL_STATE, nullTokenize } from 'vs/editor/common/modes/nullMode';
import { ITheme, IStandaloneColorService } from 'vs/editor/common/services/standaloneColorService';
import { Token } from 'vs/editor/common/core/token';
import { FontInfo, BareFontInfo } from 'vs/editor/common/config/fontInfo';

/**
 * @internal
 */
export function setupServices(overrides: IEditorOverrideServices): any {
	return StaticServices.init(overrides);
}

function withAllStandaloneServices<T extends editorCommon.IEditor>(domElement: HTMLElement, override: IEditorOverrideServices, callback: (services: DynamicStandaloneServices) => T): T {
	let services = new DynamicStandaloneServices(domElement, override);

	// The editorService is a lovely beast. It needs to point back to the code editor instance...
	let simpleEditorService: SimpleEditorService = null;
	if (!services.has(IEditorService)) {
		simpleEditorService = new SimpleEditorService();
		services.set(IEditorService, simpleEditorService);
	}

	let simpleEditorModelResolverService: SimpleEditorModelResolverService = null;
	if (!services.has(ITextModelResolverService)) {
		simpleEditorModelResolverService = new SimpleEditorModelResolverService();
		services.set(ITextModelResolverService, simpleEditorModelResolverService);
	}

	if (!services.has(IOpenerService)) {
		services.set(IOpenerService, new OpenerService(services.get(IEditorService), services.get(ICommandService)));
	}

	let result = callback(services);

	if (simpleEditorService) {
		simpleEditorService.setEditor(result);
	}

	if (simpleEditorModelResolverService) {
		simpleEditorModelResolverService.setEditor(result);
	}

	return result;
}

/**
 * Create a new editor under `domElement`.
 * `domElement` should be empty (not contain other dom nodes).
 * The editor will read the size of `domElement`.
 */
export function create(domElement: HTMLElement, options?: IEditorConstructionOptions, override?: IEditorOverrideServices): IStandaloneCodeEditor {
	return withAllStandaloneServices(domElement, override, (services) => {
		return new StandaloneEditor(
			domElement,
			options,
			services,
			services.get(IInstantiationService),
			services.get(ICodeEditorService),
			services.get(ICommandService),
			services.get(IContextKeyService),
			services.get(IKeybindingService),
			services.get(IContextViewService),
			services.get(IStandaloneColorService)
		);
	});
}

/**
 * Emitted when an editor is created.
 * Creating a diff editor might cause this listener to be invoked with the two editors.
 * @event
 */
export function onDidCreateEditor(listener: (codeEditor: ICodeEditor) => void): IDisposable {
	return StaticServices.codeEditorService.get().onCodeEditorAdd((editor) => {
		listener(<ICodeEditor>editor);
	});
}

/**
 * Create a new diff editor under `domElement`.
 * `domElement` should be empty (not contain other dom nodes).
 * The editor will read the size of `domElement`.
 */
export function createDiffEditor(domElement: HTMLElement, options?: IDiffEditorConstructionOptions, override?: IEditorOverrideServices): IStandaloneDiffEditor {
	return withAllStandaloneServices(domElement, override, (services) => {
		return new StandaloneDiffEditor(
			domElement,
			options,
			services,
			services.get(IInstantiationService),
			services.get(IContextKeyService),
			services.get(IKeybindingService),
			services.get(IContextViewService),
			services.get(IEditorWorkerService)
		);
	});
}

export interface IDiffNavigator {
	canNavigate(): boolean;
	next(): void;
	previous(): void;
	dispose(): void;
}

export interface IDiffNavigatorOptions {
	readonly followsCaret?: boolean;
	readonly ignoreCharChanges?: boolean;
	readonly alwaysRevealFirst?: boolean;
}

export function createDiffNavigator(diffEditor: IStandaloneDiffEditor, opts?: IDiffNavigatorOptions): IDiffNavigator {
	return new DiffNavigator(diffEditor, opts);
}

function doCreateModel(value: string, mode: TPromise<modes.IMode>, uri?: URI): editorCommon.IModel {
	return StaticServices.modelService.get().createModel(value, mode, uri);
}

/**
 * Create a new editor model.
 * You can specify the language that should be set for this model or let the language be inferred from the `uri`.
 */
export function createModel(value: string, language?: string, uri?: URI): editorCommon.IModel {
	value = value || '';

	if (!language) {
		let path = uri ? uri.path : null;

		let firstLF = value.indexOf('\n');
		let firstLine = value;
		if (firstLF !== -1) {
			firstLine = value.substring(0, firstLF);
		}

		return doCreateModel(value, StaticServices.modeService.get().getOrCreateModeByFilenameOrFirstLine(path, firstLine), uri);
	}
	return doCreateModel(value, StaticServices.modeService.get().getOrCreateMode(language), uri);
}

/**
 * Change the language for a model.
 */
export function setModelLanguage(model: editorCommon.IModel, language: string): void {
	StaticServices.modelService.get().setMode(model, StaticServices.modeService.get().getOrCreateMode(language));
}

/**
 * Set the markers for a model.
 */
export function setModelMarkers(model: editorCommon.IModel, owner: string, markers: IMarkerData[]): void {
	if (model) {
		StaticServices.markerService.get().changeOne(owner, model.uri, markers);
	}
}

/**
 * Get the model that has `uri` if it exists.
 */
export function getModel(uri: URI): editorCommon.IModel {
	return StaticServices.modelService.get().getModel(uri);
}

/**
 * Get all the created models.
 */
export function getModels(): editorCommon.IModel[] {
	return StaticServices.modelService.get().getModels();
}

/**
 * Emitted when a model is created.
 * @event
 */
export function onDidCreateModel(listener: (model: editorCommon.IModel) => void): IDisposable {
	return StaticServices.modelService.get().onModelAdded(listener);
}

/**
 * Emitted right before a model is disposed.
 * @event
 */
export function onWillDisposeModel(listener: (model: editorCommon.IModel) => void): IDisposable {
	return StaticServices.modelService.get().onModelRemoved(listener);
}

/**
 * Emitted when a different language is set to a model.
 * @event
 */
export function onDidChangeModelLanguage(listener: (e: { readonly model: editorCommon.IModel; readonly oldLanguage: string; }) => void): IDisposable {
	return StaticServices.modelService.get().onModelModeChanged((e) => {
		listener({
			model: e.model,
			oldLanguage: e.oldModeId
		});
	});
}

/**
 * Create a new web worker that has model syncing capabilities built in.
 * Specify an AMD module to load that will `create` an object that will be proxied.
 */
export function createWebWorker<T>(opts: IWebWorkerOptions): MonacoWebWorker<T> {
	return actualCreateWebWorker<T>(StaticServices.modelService.get(), opts);
}

/**
 * Colorize the contents of `domNode` using attribute `data-lang`.
 */
export function colorizeElement(domNode: HTMLElement, options: IColorizerElementOptions): TPromise<void> {
	return Colorizer.colorizeElement(StaticServices.standaloneColorService.get(), StaticServices.modeService.get(), domNode, options);
}

/**
 * Colorize `text` using language `languageId`.
 */
export function colorize(text: string, languageId: string, options: IColorizerOptions): TPromise<string> {
	return Colorizer.colorize(StaticServices.modeService.get(), text, languageId, options);
}

/**
 * Colorize a line in a model.
 */
export function colorizeModelLine(model: editorCommon.IModel, lineNumber: number, tabSize: number = 4): string {
	return Colorizer.colorizeModelLine(model, lineNumber, tabSize);
}

/**
 * @internal
 */
function getSafeTokenizationSupport(languageId: string): modes.ITokenizationSupport {
	let tokenizationSupport = modes.TokenizationRegistry.get(languageId);
	if (tokenizationSupport) {
		return tokenizationSupport;
	}
	return {
		getInitialState: () => NULL_STATE,
		tokenize: (line: string, state: modes.IState, deltaOffset: number) => nullTokenize(languageId, line, state, deltaOffset),
		tokenize2: undefined,
	};
}

/**
 * Tokenize `text` using language `languageId`
 */
export function tokenize(text: string, languageId: string): Token[][] {
	let modeService = StaticServices.modeService.get();
	// Needed in order to get the mode registered for subsequent look-ups
	modeService.getOrCreateMode(languageId);

	let tokenizationSupport = getSafeTokenizationSupport(languageId);
	let lines = text.split(/\r\n|\r|\n/);
	let result: Token[][] = [];
	let state = tokenizationSupport.getInitialState();
	for (let i = 0, len = lines.length; i < len; i++) {
		let line = lines[i];
		let tokenizationResult = tokenizationSupport.tokenize(line, state, 0);

		result[i] = tokenizationResult.tokens;
		state = tokenizationResult.endState;
	}
	return result;
}

/**
 * Define a new theme.
 */
export function defineTheme(themeName: string, themeData: ITheme): void {
	StaticServices.standaloneColorService.get().defineTheme(themeName, themeData);
}

/**
 * @internal
 */
export function createMonacoEditorAPI(): typeof monaco.editor {
	return {
		// methods
		create: <any>create,
		onDidCreateEditor: <any>onDidCreateEditor,
		createDiffEditor: createDiffEditor,
		createDiffNavigator: createDiffNavigator,

		createModel: createModel,
		setModelLanguage: setModelLanguage,
		setModelMarkers: setModelMarkers,
		getModels: getModels,
		getModel: getModel,
		onDidCreateModel: onDidCreateModel,
		onWillDisposeModel: onWillDisposeModel,
		onDidChangeModelLanguage: onDidChangeModelLanguage,


		createWebWorker: createWebWorker,
		colorizeElement: colorizeElement,
		colorize: colorize,
		colorizeModelLine: colorizeModelLine,
		tokenize: tokenize,
		defineTheme: defineTheme,

		// enums
		ScrollbarVisibility: ScrollbarVisibility,
		WrappingIndent: editorCommon.WrappingIndent,
		OverviewRulerLane: editorCommon.OverviewRulerLane,
		EndOfLinePreference: editorCommon.EndOfLinePreference,
		DefaultEndOfLine: editorCommon.DefaultEndOfLine,
		EndOfLineSequence: editorCommon.EndOfLineSequence,
		TrackedRangeStickiness: editorCommon.TrackedRangeStickiness,
		CursorChangeReason: editorCommon.CursorChangeReason,
		MouseTargetType: editorCommon.MouseTargetType,
		TextEditorCursorStyle: editorCommon.TextEditorCursorStyle,
		TextEditorCursorBlinkingStyle: editorCommon.TextEditorCursorBlinkingStyle,
		ContentWidgetPositionPreference: ContentWidgetPositionPreference,
		OverlayWidgetPositionPreference: OverlayWidgetPositionPreference,

		// classes
		InternalEditorScrollbarOptions: <any>editorCommon.InternalEditorScrollbarOptions,
		EditorWrappingInfo: <any>editorCommon.EditorWrappingInfo,
		InternalEditorViewOptions: <any>editorCommon.InternalEditorViewOptions,
		EditorContribOptions: <any>editorCommon.EditorContribOptions,
		InternalEditorOptions: <any>editorCommon.InternalEditorOptions,
		OverviewRulerPosition: <any>editorCommon.OverviewRulerPosition,
		EditorLayoutInfo: <any>editorCommon.EditorLayoutInfo,
		BareFontInfo: <any>BareFontInfo,
		FontInfo: <any>FontInfo,
		TextModelResolvedOptions: <any>editorCommon.TextModelResolvedOptions,
		FindMatch: <any>editorCommon.FindMatch,

		// vars
		EditorType: editorCommon.EditorType,
		CursorMoveByUnit: editorCommon.CursorMoveByUnit,
		CursorMovePosition: editorCommon.CursorMovePosition,
		EditorScrollDirection: editorCommon.EditorScrollDirection,
		EditorScrollByUnit: editorCommon.EditorScrollByUnit,
		RevealLineAtArgument: editorCommon.RevealLineAtArgument,
		Handler: editorCommon.Handler,
	};
}
