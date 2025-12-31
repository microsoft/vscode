/**
 * AutoModeDetector - Automatically detect appropriate mode based on query content
 *
 * Analyzes user queries to suggest the most appropriate Aria mode.
 */

import type { AriaModeId } from './types';

/**
 * Pattern definition for mode detection
 */
interface ModePattern {
  patterns: RegExp[];
  weight: number;
}

/**
 * Detection result
 */
export interface ModeDetectionResult {
  suggestedMode: AriaModeId;
  confidence: number;
  reason: string;
  allScores: Record<AriaModeId, number>;
}

/**
 * Mode detection patterns
 */
const MODE_PATTERNS: Record<AriaModeId, ModePattern[]> = {
  agent: [
    { patterns: [/\b(implement|create|build|add|make|write)\b/i], weight: 0.7 },
    { patterns: [/\b(fix|change|update|modify|edit|replace)\b/i], weight: 0.6 },
    { patterns: [/\b(run|execute|deploy|install)\b/i], weight: 0.5 },
    { patterns: [/\b(refactor|migrate|move)\b/i], weight: 0.6 },
    { patterns: [/do (it|this|that)/i], weight: 0.5 },
  ],
  plan: [
    { patterns: [/\b(plan|design|architect|structure)\b/i], weight: 0.9 },
    { patterns: [/\bhow (would|should|could) (i|we|you)\b/i], weight: 0.6 },
    { patterns: [/\b(steps|roadmap|strategy|approach)\b/i], weight: 0.7 },
    { patterns: [/\bbreak(ing)? (down|into)\b/i], weight: 0.6 },
    { patterns: [/\b(outline|sketch|draft)\b/i], weight: 0.5 },
    { patterns: [/\bwithout (making|doing|executing)\b/i], weight: 0.8 },
    { patterns: [/don't (make|do|execute|change)/i], weight: 0.8 },
    { patterns: [/\bjust plan\b/i], weight: 0.95 },
  ],
  debug: [
    { patterns: [/\b(debug|debugging|debugger)\b/i], weight: 0.9 },
    { patterns: [/\berror(s)?\b/i], weight: 0.6 },
    { patterns: [/\b(bug|issue|problem|broken)\b/i], weight: 0.5 },
    { patterns: [/\b(crash|exception|stack\s*trace)\b/i], weight: 0.7 },
    { patterns: [/\b(not working|doesn't work|fails)\b/i], weight: 0.6 },
    { patterns: [/\b(breakpoint|step through|inspect)\b/i], weight: 0.8 },
    { patterns: [/why (is|does|doesn't|isn't)/i], weight: 0.4 },
    { patterns: [/\b(fix this|figure out|diagnose)\b/i], weight: 0.5 },
  ],
  ask: [
    { patterns: [/\bwhat (is|are|does|do)\b/i], weight: 0.6 },
    { patterns: [/\bhow (does|do|is)\b/i], weight: 0.5 },
    { patterns: [/\bexplain\b/i], weight: 0.7 },
    { patterns: [/\bwhy (is|does|do)\b/i], weight: 0.5 },
    { patterns: [/\bcan you (tell|explain|describe)\b/i], weight: 0.6 },
    { patterns: [/\bwhat's the (purpose|point|meaning)\b/i], weight: 0.6 },
    { patterns: [/\bhelp me understand\b/i], weight: 0.7 },
    { patterns: [/^(what|how|why|when|where|who)\b/i], weight: 0.4 },
    { patterns: [/\?$/], weight: 0.3 },
  ],
  research: [
    { patterns: [/\b(research|investigate|explore)\b/i], weight: 0.9 },
    { patterns: [/\b(compare|comparison|versus|vs)\b/i], weight: 0.7 },
    { patterns: [/\bbest (practice|approach|way|method)\b/i], weight: 0.7 },
    { patterns: [/\b(state of the art|latest|current)\b/i], weight: 0.6 },
    { patterns: [/\b(options|alternatives|choices)\b/i], weight: 0.5 },
    { patterns: [/\b(pros and cons|trade-?offs?)\b/i], weight: 0.7 },
    { patterns: [/\b(deep dive|in-depth|comprehensive)\b/i], weight: 0.6 },
    { patterns: [/\bweb search\b/i], weight: 0.8 },
  ],
  code_review: [
    { patterns: [/\b(review|audit|analyze)\b.*\b(code|changes|pr|pull request)\b/i], weight: 0.9 },
    { patterns: [/\b(code review|review code)\b/i], weight: 0.95 },
    { patterns: [/\bcheck (for|my|this|the)\b.*\b(code|changes)\b/i], weight: 0.7 },
    { patterns: [/\b(security|vulnerability|vulnerabilities)\b/i], weight: 0.6 },
    { patterns: [/\b(improve|improvement|suggestion)\b.*\bcode\b/i], weight: 0.6 },
    { patterns: [/\blook (at|over) (my|this|the) code\b/i], weight: 0.7 },
    { patterns: [/\b(quality|clean|smell)\b.*\bcode\b/i], weight: 0.6 },
    { patterns: [/\blast commit|recent changes\b/i], weight: 0.5 },
  ],
};

/**
 * Default mode when no strong signal is found
 */
const DEFAULT_MODE: AriaModeId = 'agent';

/**
 * Minimum confidence to suggest a mode
 */
const MIN_CONFIDENCE = 0.3;

/**
 * AutoModeDetector class
 */
export class AutoModeDetector {
  private static instance: AutoModeDetector;

  private constructor() {}

  static getInstance(): AutoModeDetector {
    if (!AutoModeDetector.instance) {
      AutoModeDetector.instance = new AutoModeDetector();
    }
    return AutoModeDetector.instance;
  }

  /**
   * Detect the most appropriate mode for a query
   */
  detectMode(query: string): ModeDetectionResult {
    const scores: Record<AriaModeId, number> = {
      agent: 0,
      plan: 0,
      debug: 0,
      ask: 0,
      research: 0,
      code_review: 0,
    };

    const reasons: Record<AriaModeId, string[]> = {
      agent: [],
      plan: [],
      debug: [],
      ask: [],
      research: [],
      code_review: [],
    };

    // Calculate scores for each mode
    for (const [modeId, patterns] of Object.entries(MODE_PATTERNS) as [AriaModeId, ModePattern[]][]) {
      for (const pattern of patterns) {
        for (const regex of pattern.patterns) {
          const match = query.match(regex);
          if (match) {
            scores[modeId] += pattern.weight;
            reasons[modeId].push(match[0]);
          }
        }
      }
    }

    // Find the mode with highest score
    let maxScore = 0;
    let suggestedMode: AriaModeId = DEFAULT_MODE;

    for (const [modeId, score] of Object.entries(scores) as [AriaModeId, number][]) {
      if (score > maxScore) {
        maxScore = score;
        suggestedMode = modeId;
      }
    }

    // Normalize confidence to 0-1 range
    const maxPossibleScore = 3; // Rough estimate
    const confidence = Math.min(1, maxScore / maxPossibleScore);

    // If confidence is too low, default to agent mode
    if (confidence < MIN_CONFIDENCE) {
      suggestedMode = DEFAULT_MODE;
    }

    // Build reason string
    const matchedPatterns = reasons[suggestedMode].slice(0, 3);
    const reason = matchedPatterns.length > 0
      ? `Matched patterns: ${matchedPatterns.join(', ')}`
      : 'Default mode';

    return {
      suggestedMode,
      confidence,
      reason,
      allScores: scores,
    };
  }

  /**
   * Check if auto mode switching should be triggered
   */
  shouldSwitchMode(
    query: string,
    currentMode: AriaModeId,
    threshold: number = 0.5
  ): { shouldSwitch: boolean; newMode?: AriaModeId; reason?: string } {
    const detection = this.detectMode(query);

    // Don't switch if confidence is too low
    if (detection.confidence < threshold) {
      return { shouldSwitch: false };
    }

    // Don't switch if already in the suggested mode
    if (detection.suggestedMode === currentMode) {
      return { shouldSwitch: false };
    }

    // Special rules
    // Don't auto-switch FROM agent mode to ask mode (questions can still be agentic)
    if (currentMode === 'agent' && detection.suggestedMode === 'ask' && detection.confidence < 0.7) {
      return { shouldSwitch: false };
    }

    return {
      shouldSwitch: true,
      newMode: detection.suggestedMode,
      reason: detection.reason,
    };
  }
}

export const autoModeDetector = AutoModeDetector.getInstance();
export default AutoModeDetector;

