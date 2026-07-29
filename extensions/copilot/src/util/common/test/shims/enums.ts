/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export enum InteractiveEditorResponseFeedbackKind {
	Unhelpful = 0,
	Helpful = 1,
	Undone = 2,
	Accepted = 3,
	Bug = 4
}

export enum TextEditorCursorStyle {
	Line = 1,
	Block = 2,
	Underline = 3,
	LineThin = 4,
	BlockOutline = 5,
	UnderlineThin = 6
}

export enum TextEditorLineNumbersStyle {
	Off = 0,
	On = 1,
	Relative = 2,
	Interval = 3,
}

export enum TextEditorRevealType {
	Default = 0,
	InCenter = 1,
	InCenterIfOutsideViewport = 2,
	AtTop = 3
}

export enum DiagnosticSeverity {
	Error = 0,
	Warning = 1,
	Information = 2,
	Hint = 3
}

export enum ExtensionMode {
	Production = 1,
	Development = 2,
	Test = 3,
}

export enum ChatVariableLevel {
	Short = 1,
	Medium = 2,
	Full = 3
}

export enum ChatLocation {
	Panel = 1,
	Terminal = 2,
	Notebook = 3,
	Editor = 4,
}

export enum ChatSessionStatus {
	Failed = 0,
	Completed = 1,
	InProgress = 2
}

export enum FileType {
	Unknown = 0,
	File = 1,
	Directory = 2,
	SymbolicLink = 64
}