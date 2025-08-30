/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023-2025 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

export async function suggestPythonHelpTopics(query: string): Promise<string[]> {
    
    if (!query || query.trim().length === 0) {
        return [];
    }

    try {
        // Use VSCode's command system to access the help service
        const topics = await vscode.commands.executeCommand<string[]>(
            'erdos.help.searchTopics',
            'python',
            query
        );
        
        if (Array.isArray(topics)) {
            const filteredTopics = topics.filter(topic => typeof topic === 'string');
            return filteredTopics;
        } else {
            return [];
        }
    } catch (error) {
        return [];
    }
}