/**
 * Artifact Templates for Phase Transitions
 * Provides templates and content generation for handover artifacts
 */

import type { Phase } from '../../types/cli';
import type { AgentMemory, HandoverArtifact } from '../../types/state';
import type { ChatMessage } from '../../types/messages';

/**
 * Template structure for each phase
 */
export interface ArtifactTemplate {
    /** Phase this template applies to */
    phase: Phase;
    /** Sections to include in the artifact */
    sections: string[];
    /** Prompts for generating content */
    prompts: Record<string, string>;
}

/**
 * Phase-specific templates for artifact generation
 */
export const TEMPLATES: Record<Phase, ArtifactTemplate> = {
    design: {
        phase: 'design',
        sections: ['decisions', 'architecture', 'openQuestions'],
        prompts: {
            summary: 'Design decisions and architectural choices made during this phase.',
            nextSteps: 'Key implementation tasks derived from the design.'
        }
    },
    implementation: {
        phase: 'implementation',
        sections: ['completedTasks', 'modifiedFiles', 'testStatus'],
        prompts: {
            summary: 'Implementation progress and completed features.',
            issues: 'Remaining bugs, technical debt, or incomplete work.'
        }
    },
    review: {
        phase: 'review',
        sections: ['reviewFindings', 'qualityMetrics', 'recommendations'],
        prompts: {
            summary: 'Review findings and quality assessment.',
            nextCycle: 'Recommendations for the next development iteration.'
        }
    }
};

/**
 * Get the template for a specific phase
 */
export function getTemplateForPhase(phase: Phase): ArtifactTemplate {
    return TEMPLATES[phase];
}

/**
 * Extract key points from chat history
 */
function extractKeyPoints(history: ChatMessage[], maxPoints: number = 5): string[] {
    const points: string[] = [];

    // Look for messages with key indicators
    const keyIndicators = [
        'decided', 'decision', 'chose', 'selected',
        'implemented', 'created', 'added', 'fixed',
        'found', 'issue', 'bug', 'problem',
        'completed', 'finished', 'done'
    ];

    for (const message of history) {
        if (message.sender === 'assistant') {
            const content = message.content.toLowerCase();
            for (const indicator of keyIndicators) {
                if (content.includes(indicator) && points.length < maxPoints) {
                    // Extract first sentence containing the indicator
                    const sentences = message.content.split(/[.!?]+/);
                    for (const sentence of sentences) {
                        if (sentence.toLowerCase().includes(indicator)) {
                            const trimmed = sentence.trim();
                            if (trimmed.length > 20 && trimmed.length < 200) {
                                points.push(trimmed);
                                break;
                            }
                        }
                    }
                    break;
                }
            }
        }
    }

    return points;
}

/**
 * Format memory content for artifact
 */
function formatMemory(memory: AgentMemory): string {
    const lines: string[] = [];

    if (memory.shortTerm) {
        lines.push(`### Context\n${memory.shortTerm}`);
    }

    if (memory.todo && memory.todo.length > 0) {
        lines.push(`### Pending Tasks\n${memory.todo.map(t => `- ${t}`).join('\n')}`);
    }

    if (memory.decisions && memory.decisions.length > 0) {
        lines.push(`### Key Decisions\n${memory.decisions.map(d => `- ${d}`).join('\n')}`);
    }

    if (memory.blockers && memory.blockers.length > 0) {
        lines.push(`### Blockers\n${memory.blockers.map(b => `- ${b}`).join('\n')}`);
    }

    return lines.join('\n\n');
}

/**
 * Generate phase-specific summary section
 */
function generatePhaseSummary(phase: Phase, keyPoints: string[]): string {
    const template = TEMPLATES[phase];
    const lines: string[] = [];

    lines.push(`## ${phase.charAt(0).toUpperCase() + phase.slice(1)} Phase Summary`);
    lines.push('');

    if (keyPoints.length > 0) {
        lines.push('### Key Activities');
        keyPoints.forEach(point => {
            lines.push(`- ${point}`);
        });
        lines.push('');
    }

    lines.push(`### Focus Areas: ${template.sections.join(', ')}`);

    return lines.join('\n');
}

/**
 * Generate artifact content from phase data
 * @param fromPhase The phase being transitioned from
 * @param memory Current agent memory
 * @param recentHistory Recent chat messages
 * @returns Formatted artifact content string
 */
export function generateArtifactContent(
    fromPhase: Phase,
    memory: AgentMemory,
    recentHistory: ChatMessage[]
): string {
    const sections: string[] = [];

    // Header
    sections.push(`# Handover Artifact: ${fromPhase.toUpperCase()} Phase`);
    sections.push(`Generated: ${new Date().toISOString()}`);
    sections.push('');

    // Extract key points from history
    const keyPoints = extractKeyPoints(recentHistory);

    // Phase summary
    sections.push(generatePhaseSummary(fromPhase, keyPoints));
    sections.push('');

    // Memory content
    const memoryContent = formatMemory(memory);
    if (memoryContent) {
        sections.push(memoryContent);
        sections.push('');
    }

    // Recent activity summary
    if (recentHistory.length > 0) {
        sections.push('## Recent Activity');
        sections.push(`- Total messages: ${recentHistory.length}`);
        const userMessages = recentHistory.filter(m => m.sender === 'user').length;
        const assistantMessages = recentHistory.filter(m => m.sender === 'assistant').length;
        sections.push(`- User messages: ${userMessages}`);
        sections.push(`- Assistant messages: ${assistantMessages}`);
    }

    return sections.join('\n');
}

/**
 * Create a handover artifact
 * @param fromPhase Source phase
 * @param toPhase Target phase
 * @param memory Agent memory
 * @param recentHistory Recent chat history
 * @param cliName Name of the CLI that generated this
 * @param modifiedFiles List of modified files
 * @returns Complete HandoverArtifact
 */
export function createHandoverArtifact(
    fromPhase: Phase,
    toPhase: Phase,
    memory: AgentMemory,
    recentHistory: ChatMessage[],
    cliName: string,
    modifiedFiles: string[] = []
): HandoverArtifact {
    return {
        fromPhase,
        toPhase,
        summary: generateArtifactContent(fromPhase, memory, recentHistory),
        modifiedFiles,
        issues: memory.blockers,
        createdAt: new Date().toISOString(),
        createdBy: cliName
    };
}
