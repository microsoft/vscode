/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import type { ChatErrorDetails, Diagnostic, FormattingOptions, Uri, WorkspaceEdit } from 'vscode';
import { IDeserializedWorkspaceState } from '../../src/platform/test/node/promptContextModel';
import { ITestingServicesAccessor } from '../../src/platform/test/node/services';
import { IFile, SimulationWorkspace } from '../../src/platform/test/node/simulationWorkspace';
import { ResourceMap } from '../../src/util/vs/base/common/map';

export interface IInlineEdit {
	readonly offset: number;
	readonly length: number;
	readonly range: { start: { line: number; character: number }; end: { line: number; character: number } };
	readonly newText: string;
}
export interface IInlineEditOutcome {
	readonly type: 'inlineEdit';
	readonly appliedEdits: IInlineEdit[];
	/**
	 * The document content before this step.
	 */
	readonly originalFileContents: string;
	readonly fileContents: string;
	readonly initialDiagnostics?: ResourceMap<Diagnostic[]>;
	readonly chatResponseMarkdown: string;
	readonly annotations: OutcomeAnnotation[];
}
export interface IWorkspaceEditOutcome {
	readonly type: 'workspaceEdit';
	readonly files: IFile[] | Array<{ srcUri: string; post: string }>;
	readonly edits: WorkspaceEdit;
	readonly chatResponseMarkdown: string;
	readonly annotations: OutcomeAnnotation[];
}
export interface IConversationalOutcome {
	readonly type: 'conversational';
	readonly chatResponseMarkdown: string;
	readonly annotations: OutcomeAnnotation[];
}
export interface IEmptyOutcome {
	readonly type: 'none';
	readonly chatResponseMarkdown: string;
	readonly annotations: OutcomeAnnotation[];
}
export interface IErrorOutcome {
	readonly type: 'error';
	readonly errorDetails: ChatErrorDetails;
	readonly annotations: OutcomeAnnotation[];
}

export type OutcomeAnnotation = { severity: 'info' | 'warning' | 'error'; label: string; message: string };

export type IOutcome = (IInlineEditOutcome | IWorkspaceEditOutcome | IConversationalOutcome | IErrorOutcome | IEmptyOutcome);

export interface ICommonScenarioProps {
	queries: IScenarioQuery[];
	extraWorkspaceSetup?: (workspace: SimulationWorkspace) => void | Promise<void>;
	onBeforeStart?: (accessor: ITestingServicesAccessor) => void | Promise<void>;
}
export interface IDeserializedWorkspaceStateBasedScenario extends ICommonScenarioProps {
	readonly workspaceState: IDeserializedWorkspaceState;
	readonly scenarioFolderPath?: string;
}
export interface IFileBasedScenario extends ICommonScenarioProps {
	readonly files: IFile[];
	readonly workspaceFolders?: Uri[];
}
export type IScenario = IDeserializedWorkspaceStateBasedScenario | IFileBasedScenario;
export type DiagnosticProviderId = 'tsc' | 'eslint' | 'pylint' | 'pyright' | 'roslyn' | 'cpp' | 'ruff';

export interface IScenarioQuery {
	file?: string | Uri;
	activeCell?: number;
	selection?: [number, number, number, number] | [number, number];
	visibleRanges?: ([number, number, number, number] | [number, number])[];
	wholeRange?: [number, number, number, number] | [number, number];
	query: string;
	expectedIntent?: string | undefined;
	validate(outcome: IOutcome, workspace: SimulationWorkspace, accessor: ITestingServicesAccessor): void | Promise<void>;
	diagnostics?: IScenarioDiagnostic[] | DiagnosticProviderId;
	fileIndentInfo?: FormattingOptions;
	promptReferences?: IScenarioPromptReference[];
}

export interface IScenarioDiagnostic {
	startLine: number;
	startCharacter: number;
	endLine: number;
	endCharacter: number;
	message: string;
	relatedInformation?: IScenarioRelatedInformation[];
}


export interface IScenarioPromptReference {
	value: string | IFile;
	id: string;
}

export interface IScenarioRelatedInformation {
	location: IScenarioLocation;
	message: string;
}

export interface IScenarioLocation {
	path: string | Uri;
	startLine: number;
	startCharacter: number;
	endLine: number;
	endCharacter: number;
}

export const enum EditTestStrategy {
	/**
	 * Tests Edits in non-agent mode (with codeblock strategy)
	 */
	Edits,
	/**
	 * We will test an inline interaction.
	 */
	Inline,
	/**
	 * We will test an inline chat intent interaction.
	 */
	InlineChatIntent,
	/**
	 * Test Edits in agent mode
	 */
	Agent
}
