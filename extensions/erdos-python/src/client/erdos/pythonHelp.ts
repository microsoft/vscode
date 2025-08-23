/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 Lotas Inc. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import * as erdos from 'erdos';
import { PythonRuntimeSession } from './session';

export async function suggestPythonHelpTopics(query: string): Promise<string[]> {
    
    if (!query || query.trim().length === 0) {
        return [];
    }

    try {
        let session = await erdos.runtime.getForegroundSession();
        
        if (!session || session.runtimeMetadata.languageId !== 'python') {
            const sessions = await erdos.runtime.getActiveSessions();
            session = sessions.find((s: any) => s.runtimeMetadata.languageId === 'python');
        }

        if (!session) {
            return [];
        }

        const topics = await (session as PythonRuntimeSession).callMethod('suggest_help_topics', query);
        
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

export async function getPythonHelpAsMarkdown(topic: string): Promise<string> {
    if (!topic || topic.trim().length === 0) {
        return '';
    }

    try {
        let session = await erdos.runtime.getForegroundSession();
        
        if (!session || session.runtimeMetadata.languageId !== 'python') {
            const sessions = await erdos.runtime.getActiveSessions();
            session = sessions.find((s: any) => s.runtimeMetadata.languageId === 'python');
        }

        if (!session) {
            return `# Python Documentation: ${topic}\n\nNo Python session available for help content.`;
        }

        const helpContent = await (session as PythonRuntimeSession).callMethod('get_help_as_markdown', topic);
        
        if (helpContent && typeof helpContent === 'string' && helpContent.length > 0) {
            return helpContent;
        } else {
            return `# Python Documentation: ${topic}\n\nNo help content available.`;
        }
    } catch (error) {
        return `# Python Documentation: ${topic}\n\nError retrieving help content: ${error}`;
    }
}
