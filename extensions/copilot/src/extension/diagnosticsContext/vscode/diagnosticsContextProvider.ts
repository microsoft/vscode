/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ConfigKey, IConfigurationService } from '../../../platform/configuration/common/configurationService';
import { Copilot } from '../../../platform/inlineCompletions/common/api';
import { ILanguageContextProviderService, ProviderTarget } from '../../../platform/languageContextProvider/common/languageContextProviderService';
import { ILanguageDiagnosticsService } from '../../../platform/languages/common/languageDiagnosticsService';
import { ILogService } from '../../../platform/log/common/logService';
import { IExperimentationService } from '../../../platform/telemetry/common/nullExperimentationService';
import { CancellationToken } from '../../../util/vs/base/common/cancellation';
import { Disposable, DisposableStore, IDisposable } from '../../../util/vs/base/common/lifecycle';
import { autorun, IObservable } from '../../../util/vs/base/common/observableInternal';
import { URI } from '../../../util/vs/base/common/uri';
import { Position } from '../../../util/vs/editor/common/core/position';
import { Range } from '../../../util/vs/editor/common/core/range';
import { Diagnostic, DiagnosticSeverity, Range as ExternalRange } from '../../../vscodeTypes';
import { N_LINES_ABOVE, N_LINES_BELOW } from '../../xtab/common/promptCrafting';

export class DiagnosticsContextContribution extends Disposable {

	private readonly _enableDiagnosticsContextProvider: IObservable<boolean>;

	constructor(
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@ILogService private readonly logService: ILogService,
		@IExperimentationService private readonly experimentationService: IExperimentationService,
		@ILanguageDiagnosticsService private readonly diagnosticsService: ILanguageDiagnosticsService,
		@ILanguageContextProviderService private readonly languageContextProviderService: ILanguageContextProviderService,
	) {
		super();
		this._enableDiagnosticsContextProvider = configurationService.getExperimentBasedConfigObservable(ConfigKey.Advanced.DiagnosticsContextProvider, experimentationService);
		this._register(autorun(reader => {
			if (this._enableDiagnosticsContextProvider.read(reader)) {
				reader.store.add(this.register());
			}
		}));
	}

	private register(): IDisposable {
		const disposables = new DisposableStore();
		try {
			const resolver = new ContextResolver(this.diagnosticsService, this.configurationService, this.experimentationService);
			const provider: Copilot.ContextProvider<Copilot.SupportedContextItem> = {
				id: 'diagnostics-context-provider',
				selector: '*',
				resolver: resolver
			};
			disposables.add(this.languageContextProviderService.registerContextProvider(provider, [ProviderTarget.NES]));
		} catch (error) {
			this.logService.error('Error registering diagnostics context provider:', error);
		}
		return disposables;
	}
}

type DiagnosticsContextOptions = {
	maxDiagnostics: number;
	includeDiagnosticsRange?: Range;
	includeWarnings: boolean;
};

class ContextResolver implements Copilot.ContextResolver<Copilot.SupportedContextItem> {

	constructor(
		private readonly diagnosticsService: ILanguageDiagnosticsService,
		private readonly configurationService: IConfigurationService,
		private readonly experimentationService: IExperimentationService,
	) { }

	async resolve(request: Copilot.ResolveRequest, token: CancellationToken): Promise<Copilot.SupportedContextItem[]> {
		return []; // resolve only on timeout to ensure the state of diagnostics is as fresh as possible
	}

	resolveOnTimeout(request: Copilot.ResolveRequest): Copilot.SupportedContextItem[] {
		if (!request.documentContext.position) {
			return [];
		}

		const languageId = request.documentContext.languageId;
		const languageEnablement = this.experimentationService.getTreatmentVariable<boolean>(`config.github.copilot.chat.inlineEdits.diagnosticsContextProvider.${languageId}`);
		if (!languageEnablement) {
			return [];
		}

		const requestedFileResource = URI.parse(request.documentContext.uri);
		const cursor = new Position(request.documentContext.position.line + 1, request.documentContext.position.character + 1);
		const linesAbove = this.configurationService.getExperimentBasedConfig(ConfigKey.TeamInternal.InlineEditsXtabProviderNLinesAbove, this.experimentationService) ?? N_LINES_ABOVE;
		const linesBelow = this.configurationService.getExperimentBasedConfig(ConfigKey.TeamInternal.InlineEditsXtabProviderNLinesBelow, this.experimentationService) ?? N_LINES_BELOW;
		const editWindow = new Range(cursor.lineNumber - linesAbove, 1, cursor.lineNumber + linesBelow, Number.MAX_SAFE_INTEGER);

		return this.getContext(requestedFileResource, cursor, {
			maxDiagnostics: 3,
			includeWarnings: true,
			includeDiagnosticsRange: editWindow,
		});
	}

	private getContext(resource: URI, cursor: Position, options: DiagnosticsContextOptions): Copilot.SupportedContextItem[] {
		let diagnostics = this.diagnosticsService.getDiagnostics(resource);

		if (options.includeDiagnosticsRange) {
			diagnostics = diagnostics.filter(d => options.includeDiagnosticsRange!.containsRange(toInternalRange(d.range)));
		}

		if (!options.includeWarnings) {
			diagnostics = diagnostics.filter(d => d.severity !== DiagnosticSeverity.Warning);
		}

		const diagnosticsSortedByDistance = diagnostics.sort((a, b) => {
			const aDistance = Math.abs(a.range.start.line - cursor.lineNumber);
			const bDistance = Math.abs(b.range.start.line - cursor.lineNumber);
			return aDistance - bDistance;
		});

		return diagnosticsToTraits(diagnosticsSortedByDistance.slice(0, options.maxDiagnostics));
	}
}

function diagnosticsToTraits(diagnostics: Diagnostic[]): Copilot.Trait[] {

	const traits: Copilot.Trait[] = [];
	if (diagnostics.length > 0) {
		traits.push({
			name: `Problems near the user's cursor`,
			value: diagnostics.map(d => `\n\t${diagnosticsToString(d)}`).join(''),
		});
	}

	return traits;
}

function toInternalRange(range: ExternalRange): Range {
	return new Range(range.start.line + 1, range.start.character + 1, range.end.line + 1, range.end.character + 1);
}

function diagnosticsToString(diagnostics: Diagnostic): string {
	const errorstartPosition = `${diagnostics.range.start.line + 1}:${diagnostics.range.start.character + 1}`;
	const severity = diagnostics.severity === DiagnosticSeverity.Error ? 'error' : 'warning';

	let messageCode = '';
	if (diagnostics.code) {
		messageCode = ` ${diagnostics.source?.toUpperCase() ?? ''}${diagnostics.code}`;
	}

	return `${errorstartPosition} - ${severity}${messageCode}: ${diagnostics.message}`;
}