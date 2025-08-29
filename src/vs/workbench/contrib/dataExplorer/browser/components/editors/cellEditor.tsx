/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Lotas Inc. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as React from 'react';
import { TextEditor } from './textEditor.js';

interface CellEditorProps {
	value: any;
	onCommit: (value: any) => void;
	onCancel: () => void;
}

export const CellEditor: React.FC<CellEditorProps> = ({ value, onCommit, onCancel }) => {
	return <TextEditor value={value} onCommit={onCommit} onCancel={onCancel} />;
};
