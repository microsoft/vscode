/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { ServicesAccessor } from '../../../../../util/vs/platform/instantiation/common/instantiation';
import { BuildInfo, ICompletionsEditorAndPluginInfo } from './config';
import { TelemetryData } from './telemetry';

const os = {
	EOL: '\n',
};

/** Diagnostics report made available in extension or agent. */
interface Report {
	sections: Section[];
}

type SectionItems = { [key: string]: boolean | string | number | undefined };

/** Section of a diagnostics report. */
interface Section {
	name: string;
	items: SectionItems;
}

export function collectCompletionDiagnostics(accessor: ServicesAccessor, telemetry: TelemetryData | undefined): Report {
	const telemetryItems: SectionItems = {};
	if (telemetry !== undefined) {
		if (telemetry.properties.headerRequestId) {
			telemetryItems['Header Request ID'] = telemetry.properties.headerRequestId;
		}
		if (telemetry.properties.choiceIndex) {
			telemetryItems['Choice Index'] = telemetry.properties.choiceIndex;
		}
		if (telemetry.properties.opportunityId) {
			telemetryItems['Opportunity ID'] = telemetry.properties.opportunityId;
		}
		if (telemetry.properties.clientCompletionId) {
			telemetryItems['Client Completion ID'] = telemetry.properties.clientCompletionId;
		}
		if (telemetry.properties.engineName) {
			telemetryItems['Model ID'] = telemetry.properties.engineName;
		}
	}
	return {
		sections: [
			{
				name: 'Copilot Extension',
				items: {
					Version: BuildInfo.getVersion(),
					Editor: getEditorDisplayVersion(accessor),
					...telemetryItems,
				},
			},
		],
	};
}

export function formatDiagnosticsAsMarkdown(data: Report): string {
	const s = data.sections.map(formatSectionAsMarkdown);
	return s.join(os.EOL + os.EOL) + os.EOL;
}

function formatSectionAsMarkdown(s: Section) {
	return (
		`## ${s.name}` +
		os.EOL +
		os.EOL +
		Object.keys(s.items)
			.filter(k => k !== 'name')
			.map(k => `- ${k}: ${s.items[k] ?? 'N/A'}`)
			.join(os.EOL)
	);
}

function getEditorDisplayVersion(accessor: ServicesAccessor): string {
	const info = accessor.get(ICompletionsEditorAndPluginInfo).getEditorInfo();
	return `${info.name} ${info.version}`;
}
