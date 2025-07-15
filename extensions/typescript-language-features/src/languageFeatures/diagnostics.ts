/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { TypeScriptServiceConfiguration } from '../configuration/configuration';
import { DiagnosticLanguage } from '../configuration/languageDescription';
import { TelemetryReporter } from '../logging/telemetry';
import { DiagnosticPerformanceData as TsDiagnosticPerformanceData } from '../tsServer/protocol/protocol';
import * as arrays from '../utils/arrays';
import { Disposable } from '../utils/dispose';
import { equals } from '../utils/objects';
import { ResourceMap } from '../utils/resourceMap';

function diagnosticsEquals(a: vscode.Diagnostic, b: vscode.Diagnostic): boolean {
	if (a === b) {
		return true;
	}

	return a.code === b.code
		&& a.message === b.message
		&& a.severity === b.severity
		&& a.source === b.source
		&& a.range.isEqual(b.range)
		&& arrays.equals(a.relatedInformation || arrays.empty, b.relatedInformation || arrays.empty, (a, b) => {
			return a.message === b.message
				&& a.location.range.isEqual(b.location.range)
				&& a.location.uri.fsPath === b.location.uri.fsPath;
		})
		&& arrays.equals(a.tags || arrays.empty, b.tags || arrays.empty);
}

export const enum DiagnosticKind {
	Syntax,
	Semantic,
	Suggestion,
	RegionSemantic,
}

class FileDiagnostics {

	private readonly _diagnostics = new Map<DiagnosticKind, ReadonlyArray<vscode.Diagnostic>>();

	constructor(
		public readonly file: vscode.Uri,
		public language: DiagnosticLanguage
	) { }

	public updateDiagnostics(
		language: DiagnosticLanguage,
		kind: DiagnosticKind,
		diagnostics: ReadonlyArray<vscode.Diagnostic>,
		ranges: ReadonlyArray<vscode.Range> | undefined
	): boolean {
		if (language !== this.language) {
			this._diagnostics.clear();
			this.language = language;
		}

		const existing = this._diagnostics.get(kind);
		if (existing?.length === 0 && diagnostics.length === 0) {
			// No need to update
			return false;
		}

		if (kind === DiagnosticKind.RegionSemantic) {
			return this.updateRegionDiagnostics(diagnostics, ranges!);
		}
		this._diagnostics.set(kind, diagnostics);
		return true;
	}

	public getAllDiagnostics(settings: DiagnosticSettings): vscode.Diagnostic[] {
		if (!settings.getValidate(this.language)) {
			return [];
		}

		return [
			...this.get(DiagnosticKind.Syntax),
			...this.get(DiagnosticKind.Semantic),
			...this.getSuggestionDiagnostics(settings),
		];
	}

	public delete(toDelete: vscode.Diagnostic): void {
		for (const [type, diags] of this._diagnostics) {
			this._diagnostics.set(type, diags.filter(diag => !diagnosticsEquals(diag, toDelete)));
		}
	}

	/**
	 * @param ranges The ranges whose diagnostics were updated.
	 */
	private updateRegionDiagnostics(
		diagnostics: ReadonlyArray<vscode.Diagnostic>,
		ranges: ReadonlyArray<vscode.Range>): boolean {
		if (!this._diagnostics.get(DiagnosticKind.Semantic)) {
			this._diagnostics.set(DiagnosticKind.Semantic, diagnostics);
			return true;
		}
		const oldDiagnostics = this._diagnostics.get(DiagnosticKind.Semantic)!;
		const newDiagnostics = oldDiagnostics.filter(diag => !ranges.some(range => diag.range.intersection(range)));
		newDiagnostics.push(...diagnostics);
		this._diagnostics.set(DiagnosticKind.Semantic, newDiagnostics);
		return true;
	}

	private getSuggestionDiagnostics(settings: DiagnosticSettings) {
		const enableSuggestions = settings.getEnableSuggestions(this.language);
		return this.get(DiagnosticKind.Suggestion).filter(x => {
			if (!enableSuggestions) {
				// Still show unused
				return x.tags && (x.tags.includes(vscode.DiagnosticTag.Unnecessary) || x.tags.includes(vscode.DiagnosticTag.Deprecated));
			}
			return true;
		});
	}

	private get(kind: DiagnosticKind): ReadonlyArray<vscode.Diagnostic> {
		return this._diagnostics.get(kind) || [];
	}
}

interface LanguageDiagnosticSettings {
	readonly validate: boolean;
	readonly enableSuggestions: boolean;
}

function areLanguageDiagnosticSettingsEqual(currentSettings: LanguageDiagnosticSettings, newSettings: LanguageDiagnosticSettings): boolean {
	return currentSettings.validate === newSettings.validate
		&& currentSettings.enableSuggestions === newSettings.enableSuggestions;
}

class DiagnosticSettings {
	private static readonly defaultSettings: LanguageDiagnosticSettings = {
		validate: true,
		enableSuggestions: true
	};

	private readonly _languageSettings = new Map<DiagnosticLanguage, LanguageDiagnosticSettings>();

	public getValidate(language: DiagnosticLanguage): boolean {
		return this.get(language).validate;
	}

	public setValidate(language: DiagnosticLanguage, value: boolean): boolean {
		return this.update(language, settings => ({
			validate: value,
			enableSuggestions: settings.enableSuggestions,
		}));
	}

	public getEnableSuggestions(language: DiagnosticLanguage): boolean {
		return this.get(language).enableSuggestions;
	}

	public setEnableSuggestions(language: DiagnosticLanguage, value: boolean): boolean {
		return this.update(language, settings => ({
			validate: settings.validate,
			enableSuggestions: value
		}));
	}

	private get(language: DiagnosticLanguage): LanguageDiagnosticSettings {
		return this._languageSettings.get(language) || DiagnosticSettings.defaultSettings;
	}

	private update(language: DiagnosticLanguage, f: (x: LanguageDiagnosticSettings) => LanguageDiagnosticSettings): boolean {
		const currentSettings = this.get(language);
		const newSettings = f(currentSettings);
		this._languageSettings.set(language, newSettings);
		return !areLanguageDiagnosticSettingsEqual(currentSettings, newSettings);
	}
}

interface DiagnosticPerformanceData extends TsDiagnosticPerformanceData {
	fileLineCount?: number;
}

class DiagnosticsTelemetryManager extends Disposable {

	private readonly _diagnosticCodesMap = new Map<number, number>();
	private readonly _diagnosticSnapshotsMap = new ResourceMap<readonly vscode.Diagnostic[]>(uri => uri.toString(), { onCaseInsensitiveFileSystem: false });
	private _timeout: NodeJS.Timeout | undefined;
	private _telemetryEmitter: NodeJS.Timeout | undefined;

	constructor(
		private readonly _telemetryReporter: TelemetryReporter,
		private readonly _diagnosticsCollection: vscode.DiagnosticCollection,
	) {
		super();
		this._register(vscode.workspace.onDidChangeTextDocument(e => {
			if (e.document.languageId === 'typescript' || e.document.languageId === 'typescriptreact') {
				this._updateAllDiagnosticCodesAfterTimeout();
			}
		}));
		this._updateAllDiagnosticCodesAfterTimeout();
		this._registerTelemetryEventEmitter();
	}

	public logDiagnosticsPerformanceTelemetry(performanceData: DiagnosticPerformanceData[]): void {
		for (const data of performanceData) {
			/* __GDPR__
				"diagnostics.performance" : {
					"owner": "mjbvz",
					"syntaxDiagDuration" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
					"semanticDiagDuration" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
					"suggestionDiagDuration" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
					"regionSemanticDiagDuration" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
					"fileLineCount" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
					"${include}": [
						"${TypeScriptCommonProperties}"
					]
				}
			*/
			this._telemetryReporter.logTelemetry('diagnostics.performance',
				{
					syntaxDiagDuration: data.syntaxDiag,
					semanticDiagDuration: data.semanticDiag,
					suggestionDiagDuration: data.suggestionDiag,
					regionSemanticDiagDuration: data.regionSemanticDiag,
					fileLineCount: data.fileLineCount,
				},
			);
		}
	}

	private _updateAllDiagnosticCodesAfterTimeout() {
		clearTimeout(this._timeout);
		this._timeout = setTimeout(() => this._updateDiagnosticCodes(), 5000);
	}

	private _increaseDiagnosticCodeCount(code: string | number | undefined) {
		if (code === undefined) {
			return;
		}
		this._diagnosticCodesMap.set(Number(code), (this._diagnosticCodesMap.get(Number(code)) || 0) + 1);
	}

	private _updateDiagnosticCodes() {
		this._diagnosticsCollection.forEach((uri, diagnostics) => {
			const previousDiagnostics = this._diagnosticSnapshotsMap.get(uri);
			this._diagnosticSnapshotsMap.set(uri, diagnostics);
			const diagnosticsDiff = diagnostics.filter((diagnostic) => !previousDiagnostics?.some((previousDiagnostic) => equals(diagnostic, previousDiagnostic)));
			diagnosticsDiff.forEach((diagnostic) => {
				const code = diagnostic.code;
				this._increaseDiagnosticCodeCount(typeof code === 'string' || typeof code === 'number' ? code : code?.value);
			});
		});
	}

	private _registerTelemetryEventEmitter() {
		this._telemetryEmitter = setInterval(() => {
			if (this._diagnosticCodesMap.size > 0) {
				let diagnosticCodes = '';
				this._diagnosticCodesMap.forEach((value, key) => {
					diagnosticCodes += `${key}:${value},`;
				});
				this._diagnosticCodesMap.clear();
				/* __GDPR__
					"typescript.diagnostics" : {
						"owner": "aiday-mar",
						"diagnosticCodes" : { "classification": "PublicNonPersonalData", "purpose": "FeatureInsight" },
						"${include}": [
							"${TypeScriptCommonProperties}"
						]
					}
				*/
				this._telemetryReporter.logTelemetry('typescript.diagnostics', {
					diagnosticCodes: diagnosticCodes
				});
			}
		}, 5 * 60 * 1000); // 5 minutes
	}

	override dispose() {
		super.dispose();
		clearTimeout(this._timeout);
		clearInterval(this._telemetryEmitter);
	}
}

export class DiagnosticsManager extends Disposable {
	private readonly _diagnostics: ResourceMap<FileDiagnostics>;
	private readonly _settings = new DiagnosticSettings();
	private readonly _currentDiagnostics: vscode.DiagnosticCollection;
	private readonly _pendingUpdates: ResourceMap<any>;

	private readonly _updateDelay = 50;

	private readonly _diagnosticsTelemetryManager: DiagnosticsTelemetryManager | undefined;

	constructor(
		owner: string,
		configuration: TypeScriptServiceConfiguration,
		telemetryReporter: TelemetryReporter,
		onCaseInsensitiveFileSystem: boolean
	) {
		super();
		this._diagnostics = new ResourceMap<FileDiagnostics>(undefined, { onCaseInsensitiveFileSystem });
		this._pendingUpdates = new ResourceMap<any>(undefined, { onCaseInsensitiveFileSystem });

		this._currentDiagnostics = this._register(vscode.languages.createDiagnosticCollection(owner));
		// Here we are selecting only 1 user out of 1000 to send telemetry diagnostics
		if (Math.random() * 1000 <= 1 || configuration.enableDiagnosticsTelemetry) {
			this._diagnosticsTelemetryManager = this._register(new DiagnosticsTelemetryManager(telemetryReporter, this._currentDiagnostics));
		}
	}

	public override dispose() {
		super.dispose();

		for (const value of this._pendingUpdates.values()) {
			clearTimeout(value);
		}
		this._pendingUpdates.clear();
	}

	public reInitialize(): void {
		this._currentDiagnostics.clear();
		this._diagnostics.clear();
	}

	public setValidate(language: DiagnosticLanguage, value: boolean) {
		const didUpdate = this._settings.setValidate(language, value);
		if (didUpdate) {
			this.rebuildAll();
		}
	}

	public setEnableSuggestions(language: DiagnosticLanguage, value: boolean) {
		const didUpdate = this._settings.setEnableSuggestions(language, value);
		if (didUpdate) {
			this.rebuildAll();
		}
	}

	public updateDiagnostics(
		file: vscode.Uri,
		language: DiagnosticLanguage,
		kind: DiagnosticKind,
		diagnostics: ReadonlyArray<vscode.Diagnostic>,
		ranges: ReadonlyArray<vscode.Range> | undefined,
	): void {
		let didUpdate = false;
		const entry = this._diagnostics.get(file);
		if (entry) {
			didUpdate = entry.updateDiagnostics(language, kind, diagnostics, ranges);
		} else if (diagnostics.length) {
			const fileDiagnostics = new FileDiagnostics(file, language);
			fileDiagnostics.updateDiagnostics(language, kind, diagnostics, ranges);
			this._diagnostics.set(file, fileDiagnostics);
			didUpdate = true;
		}

		if (didUpdate) {
			this.scheduleDiagnosticsUpdate(file);
		}
	}

	public configFileDiagnosticsReceived(
		file: vscode.Uri,
		diagnostics: ReadonlyArray<vscode.Diagnostic>
	): void {
		this._currentDiagnostics.set(file, diagnostics);
	}

	public deleteAllDiagnosticsInFile(resource: vscode.Uri): void {
		this._currentDiagnostics.delete(resource);
		this._diagnostics.delete(resource);
	}

	public deleteDiagnostic(resource: vscode.Uri, diagnostic: vscode.Diagnostic): void {
		const fileDiagnostics = this._diagnostics.get(resource);
		if (fileDiagnostics) {
			fileDiagnostics.delete(diagnostic);
			this.rebuildFile(fileDiagnostics);
		}
	}

	public getDiagnostics(file: vscode.Uri): ReadonlyArray<vscode.Diagnostic> {
		return this._currentDiagnostics.get(file) || [];
	}

	public logDiagnosticsPerformanceTelemetry(performanceData: DiagnosticPerformanceData[]): void {
		this._diagnosticsTelemetryManager?.logDiagnosticsPerformanceTelemetry(performanceData);
	}

	private scheduleDiagnosticsUpdate(file: vscode.Uri) {
		if (!this._pendingUpdates.has(file)) {
			this._pendingUpdates.set(file, setTimeout(() => this.updateCurrentDiagnostics(file), this._updateDelay));
		}
	}

	private updateCurrentDiagnostics(file: vscode.Uri): void {
		if (this._pendingUpdates.has(file)) {
			clearTimeout(this._pendingUpdates.get(file));
			this._pendingUpdates.delete(file);
		}

		const fileDiagnostics = this._diagnostics.get(file);
		this._currentDiagnostics.set(file, fileDiagnostics ? fileDiagnostics.getAllDiagnostics(this._settings) : []);
	}

	private rebuildAll(): void {
		this._currentDiagnostics.clear();
		for (const fileDiagnostic of this._diagnostics.values()) {
			this.rebuildFile(fileDiagnostic);
		}
	}

	private rebuildFile(fileDiagnostic: FileDiagnostics) {
		this._currentDiagnostics.set(fileDiagnostic.file, fileDiagnostic.getAllDiagnostics(this._settings));
	}
}
