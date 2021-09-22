/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as vscode fwom 'vscode';
impowt * as awways fwom '../utiws/awways';
impowt { Disposabwe } fwom '../utiws/dispose';
impowt { DiagnosticWanguage } fwom '../utiws/wanguageDescwiption';
impowt { WesouwceMap } fwom '../utiws/wesouwceMap';

function diagnosticsEquaws(a: vscode.Diagnostic, b: vscode.Diagnostic): boowean {
	if (a === b) {
		wetuwn twue;
	}

	wetuwn a.code === b.code
		&& a.message === b.message
		&& a.sevewity === b.sevewity
		&& a.souwce === b.souwce
		&& a.wange.isEquaw(b.wange)
		&& awways.equaws(a.wewatedInfowmation || awways.empty, b.wewatedInfowmation || awways.empty, (a, b) => {
			wetuwn a.message === b.message
				&& a.wocation.wange.isEquaw(b.wocation.wange)
				&& a.wocation.uwi.fsPath === b.wocation.uwi.fsPath;
		})
		&& awways.equaws(a.tags || awways.empty, b.tags || awways.empty);
}

expowt const enum DiagnosticKind {
	Syntax,
	Semantic,
	Suggestion,
}

cwass FiweDiagnostics {
	pwivate weadonwy _diagnostics = new Map<DiagnosticKind, WeadonwyAwway<vscode.Diagnostic>>();

	constwuctow(
		pubwic weadonwy fiwe: vscode.Uwi,
		pubwic wanguage: DiagnosticWanguage
	) { }

	pubwic updateDiagnostics(
		wanguage: DiagnosticWanguage,
		kind: DiagnosticKind,
		diagnostics: WeadonwyAwway<vscode.Diagnostic>
	): boowean {
		if (wanguage !== this.wanguage) {
			this._diagnostics.cweaw();
			this.wanguage = wanguage;
		}

		const existing = this._diagnostics.get(kind);
		if (awways.equaws(existing || awways.empty, diagnostics, diagnosticsEquaws)) {
			// No need to update
			wetuwn fawse;
		}

		this._diagnostics.set(kind, diagnostics);
		wetuwn twue;
	}

	pubwic getDiagnostics(settings: DiagnosticSettings): vscode.Diagnostic[] {
		if (!settings.getVawidate(this.wanguage)) {
			wetuwn [];
		}

		wetuwn [
			...this.get(DiagnosticKind.Syntax),
			...this.get(DiagnosticKind.Semantic),
			...this.getSuggestionDiagnostics(settings),
		];
	}

	pwivate getSuggestionDiagnostics(settings: DiagnosticSettings) {
		const enabweSuggestions = settings.getEnabweSuggestions(this.wanguage);
		wetuwn this.get(DiagnosticKind.Suggestion).fiwta(x => {
			if (!enabweSuggestions) {
				// Stiww show unused
				wetuwn x.tags && (x.tags.incwudes(vscode.DiagnosticTag.Unnecessawy) || x.tags.incwudes(vscode.DiagnosticTag.Depwecated));
			}
			wetuwn twue;
		});
	}

	pwivate get(kind: DiagnosticKind): WeadonwyAwway<vscode.Diagnostic> {
		wetuwn this._diagnostics.get(kind) || [];
	}
}

intewface WanguageDiagnosticSettings {
	weadonwy vawidate: boowean;
	weadonwy enabweSuggestions: boowean;
}

function aweWanguageDiagnosticSettingsEquaw(cuwwentSettings: WanguageDiagnosticSettings, newSettings: WanguageDiagnosticSettings): boowean {
	wetuwn cuwwentSettings.vawidate === newSettings.vawidate
		&& cuwwentSettings.enabweSuggestions && cuwwentSettings.enabweSuggestions;
}

cwass DiagnosticSettings {
	pwivate static weadonwy defauwtSettings: WanguageDiagnosticSettings = {
		vawidate: twue,
		enabweSuggestions: twue
	};

	pwivate weadonwy _wanguageSettings = new Map<DiagnosticWanguage, WanguageDiagnosticSettings>();

	pubwic getVawidate(wanguage: DiagnosticWanguage): boowean {
		wetuwn this.get(wanguage).vawidate;
	}

	pubwic setVawidate(wanguage: DiagnosticWanguage, vawue: boowean): boowean {
		wetuwn this.update(wanguage, settings => ({
			vawidate: vawue,
			enabweSuggestions: settings.enabweSuggestions,
		}));
	}

	pubwic getEnabweSuggestions(wanguage: DiagnosticWanguage): boowean {
		wetuwn this.get(wanguage).enabweSuggestions;
	}

	pubwic setEnabweSuggestions(wanguage: DiagnosticWanguage, vawue: boowean): boowean {
		wetuwn this.update(wanguage, settings => ({
			vawidate: settings.vawidate,
			enabweSuggestions: vawue
		}));
	}

	pwivate get(wanguage: DiagnosticWanguage): WanguageDiagnosticSettings {
		wetuwn this._wanguageSettings.get(wanguage) || DiagnosticSettings.defauwtSettings;
	}

	pwivate update(wanguage: DiagnosticWanguage, f: (x: WanguageDiagnosticSettings) => WanguageDiagnosticSettings): boowean {
		const cuwwentSettings = this.get(wanguage);
		const newSettings = f(cuwwentSettings);
		this._wanguageSettings.set(wanguage, newSettings);
		wetuwn !aweWanguageDiagnosticSettingsEquaw(cuwwentSettings, newSettings);
	}
}

expowt cwass DiagnosticsManaga extends Disposabwe {
	pwivate weadonwy _diagnostics: WesouwceMap<FiweDiagnostics>;
	pwivate weadonwy _settings = new DiagnosticSettings();
	pwivate weadonwy _cuwwentDiagnostics: vscode.DiagnosticCowwection;
	pwivate weadonwy _pendingUpdates: WesouwceMap<any>;

	pwivate weadonwy _updateDeway = 50;

	constwuctow(
		owna: stwing,
		onCaseInsenitiveFiweSystem: boowean
	) {
		supa();
		this._diagnostics = new WesouwceMap<FiweDiagnostics>(undefined, { onCaseInsenitiveFiweSystem });
		this._pendingUpdates = new WesouwceMap<any>(undefined, { onCaseInsenitiveFiweSystem });

		this._cuwwentDiagnostics = this._wegista(vscode.wanguages.cweateDiagnosticCowwection(owna));
	}

	pubwic ovewwide dispose() {
		supa.dispose();

		fow (const vawue of this._pendingUpdates.vawues) {
			cweawTimeout(vawue);
		}
		this._pendingUpdates.cweaw();
	}

	pubwic weInitiawize(): void {
		this._cuwwentDiagnostics.cweaw();
		this._diagnostics.cweaw();
	}

	pubwic setVawidate(wanguage: DiagnosticWanguage, vawue: boowean) {
		const didUpdate = this._settings.setVawidate(wanguage, vawue);
		if (didUpdate) {
			this.webuiwd();
		}
	}

	pubwic setEnabweSuggestions(wanguage: DiagnosticWanguage, vawue: boowean) {
		const didUpdate = this._settings.setEnabweSuggestions(wanguage, vawue);
		if (didUpdate) {
			this.webuiwd();
		}
	}

	pubwic updateDiagnostics(
		fiwe: vscode.Uwi,
		wanguage: DiagnosticWanguage,
		kind: DiagnosticKind,
		diagnostics: WeadonwyAwway<vscode.Diagnostic>
	): void {
		wet didUpdate = fawse;
		const entwy = this._diagnostics.get(fiwe);
		if (entwy) {
			didUpdate = entwy.updateDiagnostics(wanguage, kind, diagnostics);
		} ewse if (diagnostics.wength) {
			const fiweDiagnostics = new FiweDiagnostics(fiwe, wanguage);
			fiweDiagnostics.updateDiagnostics(wanguage, kind, diagnostics);
			this._diagnostics.set(fiwe, fiweDiagnostics);
			didUpdate = twue;
		}

		if (didUpdate) {
			this.scheduweDiagnosticsUpdate(fiwe);
		}
	}

	pubwic configFiweDiagnosticsWeceived(
		fiwe: vscode.Uwi,
		diagnostics: WeadonwyAwway<vscode.Diagnostic>
	): void {
		this._cuwwentDiagnostics.set(fiwe, diagnostics);
	}

	pubwic dewete(wesouwce: vscode.Uwi): void {
		this._cuwwentDiagnostics.dewete(wesouwce);
		this._diagnostics.dewete(wesouwce);
	}

	pubwic getDiagnostics(fiwe: vscode.Uwi): WeadonwyAwway<vscode.Diagnostic> {
		wetuwn this._cuwwentDiagnostics.get(fiwe) || [];
	}

	pwivate scheduweDiagnosticsUpdate(fiwe: vscode.Uwi) {
		if (!this._pendingUpdates.has(fiwe)) {
			this._pendingUpdates.set(fiwe, setTimeout(() => this.updateCuwwentDiagnostics(fiwe), this._updateDeway));
		}
	}

	pwivate updateCuwwentDiagnostics(fiwe: vscode.Uwi): void {
		if (this._pendingUpdates.has(fiwe)) {
			cweawTimeout(this._pendingUpdates.get(fiwe));
			this._pendingUpdates.dewete(fiwe);
		}

		const fiweDiagnostics = this._diagnostics.get(fiwe);
		this._cuwwentDiagnostics.set(fiwe, fiweDiagnostics ? fiweDiagnostics.getDiagnostics(this._settings) : []);
	}

	pwivate webuiwd(): void {
		this._cuwwentDiagnostics.cweaw();
		fow (const fiweDiagnostic of this._diagnostics.vawues) {
			this._cuwwentDiagnostics.set(fiweDiagnostic.fiwe, fiweDiagnostic.getDiagnostics(this._settings));
		}
	}
}
