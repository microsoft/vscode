/**
 * IDEIntentApp - Flash App for classifying IDE user intent
 *
 * Ultra-fast classification (<1ms) to determine if user input
 * is a tool call, completion request, or general chat.
 */

export type IDEIntent =
  | 'completion'
  | 'refactor'
  | 'explain'
  | 'generate'
  | 'debug'
  | 'test'
  | 'document'
  | 'search'
  | 'chat'
  | 'unknown';

export interface IntentResult {
  intent: IDEIntent;
  confidence: number;
  handled: boolean;
  metadata?: Record<string, unknown>;
}

export interface IntentInput {
  query: string;
  hasSelection: boolean;
  selectionLanguage?: string;
  cursorContext?: string;
  recentCommands?: string[];
}

/**
 * Fast intent classification using pattern matching and keyword detection
 */
export class IDEIntentApp {
  name = 'IDEIntentApp';

  // Pattern matchers for each intent type
  private patterns: Record<IDEIntent, RegExp[]> = {
    completion: [
      /^complete\s/i,
      /^finish\s/i,
      /^continue\s/i,
      /what comes next/i,
    ],
    refactor: [
      /^refactor\s/i,
      /^rename\s/i,
      /^extract\s/i,
      /^inline\s/i,
      /^move\s/i,
      /clean up/i,
      /improve.*code/i,
    ],
    explain: [
      /^explain\s/i,
      /^what (does|is)/i,
      /^how does/i,
      /^why (does|is)/i,
      /what's happening/i,
    ],
    generate: [
      /^generate\s/i,
      /^create\s/i,
      /^write\s/i,
      /^implement\s/i,
      /^add\s.*function/i,
      /^add\s.*method/i,
      /^add\s.*class/i,
    ],
    debug: [
      /^debug\s/i,
      /^fix\s/i,
      /^why.*error/i,
      /^what's wrong/i,
      /not working/i,
      /bug/i,
      /issue/i,
    ],
    test: [
      /^test\s/i,
      /^write test/i,
      /^add test/i,
      /^generate test/i,
      /unit test/i,
      /test case/i,
    ],
    document: [
      /^document\s/i,
      /^add (doc|comment)/i,
      /^jsdoc/i,
      /^docstring/i,
      /add documentation/i,
    ],
    search: [
      /^find\s/i,
      /^search\s/i,
      /^where is/i,
      /^locate\s/i,
      /^show me/i,
    ],
    chat: [
      /^hi\s/i,
      /^hello/i,
      /^hey/i,
      /^thanks/i,
      /^thank you/i,
    ],
    unknown: [],
  };

  // Keywords with associated intents
  private keywords: Map<string, IDEIntent> = new Map([
    ['refactor', 'refactor'],
    ['rename', 'refactor'],
    ['extract', 'refactor'],
    ['explain', 'explain'],
    ['what', 'explain'],
    ['why', 'explain'],
    ['how', 'explain'],
    ['generate', 'generate'],
    ['create', 'generate'],
    ['write', 'generate'],
    ['implement', 'generate'],
    ['debug', 'debug'],
    ['fix', 'debug'],
    ['bug', 'debug'],
    ['error', 'debug'],
    ['test', 'test'],
    ['document', 'document'],
    ['jsdoc', 'document'],
    ['find', 'search'],
    ['search', 'search'],
    ['where', 'search'],
  ]);

  /**
   * Classify user intent from input
   */
  async process(input: IntentInput): Promise<IntentResult> {
    const startTime = performance.now();

    // Try pattern matching first (fastest)
    const patternResult = this.matchPatterns(input.query);
    if (patternResult.confidence > 0.8) {
      console.log(`[IDEIntentApp] Pattern match: ${patternResult.intent} in ${(performance.now() - startTime).toFixed(2)}ms`);
      return patternResult;
    }

    // Try keyword detection
    const keywordResult = this.matchKeywords(input.query);
    if (keywordResult.confidence > 0.6) {
      console.log(`[IDEIntentApp] Keyword match: ${keywordResult.intent} in ${(performance.now() - startTime).toFixed(2)}ms`);
      return keywordResult;
    }

    // Consider context
    const contextResult = this.considerContext(input);
    if (contextResult.confidence > 0.5) {
      console.log(`[IDEIntentApp] Context match: ${contextResult.intent} in ${(performance.now() - startTime).toFixed(2)}ms`);
      return contextResult;
    }

    // Default to chat
    return {
      intent: 'chat',
      confidence: 0.3,
      handled: false,
    };
  }

  /**
   * Match against regex patterns
   */
  private matchPatterns(query: string): IntentResult {
    for (const [intent, patterns] of Object.entries(this.patterns)) {
      if (intent === 'unknown') continue;

      for (const pattern of patterns) {
        if (pattern.test(query)) {
          return {
            intent: intent as IDEIntent,
            confidence: 0.9,
            handled: true,
          };
        }
      }
    }

    return { intent: 'unknown', confidence: 0, handled: false };
  }

  /**
   * Match against keywords
   */
  private matchKeywords(query: string): IntentResult {
    const words = query.toLowerCase().split(/\s+/);
    const intentCounts = new Map<IDEIntent, number>();

    for (const word of words) {
      const intent = this.keywords.get(word);
      if (intent) {
        intentCounts.set(intent, (intentCounts.get(intent) || 0) + 1);
      }
    }

    // Find most common intent
    let maxIntent: IDEIntent = 'unknown';
    let maxCount = 0;

    for (const [intent, count] of intentCounts.entries()) {
      if (count > maxCount) {
        maxCount = count;
        maxIntent = intent;
      }
    }

    if (maxCount > 0) {
      return {
        intent: maxIntent,
        confidence: Math.min(0.8, 0.4 + maxCount * 0.2),
        handled: true,
      };
    }

    return { intent: 'unknown', confidence: 0, handled: false };
  }

  /**
   * Consider context for intent classification
   */
  private considerContext(input: IntentInput): IntentResult {
    // If there's a selection, likely refactor or explain
    if (input.hasSelection) {
      const queryLower = input.query.toLowerCase();

      if (queryLower.includes('?')) {
        return { intent: 'explain', confidence: 0.6, handled: true };
      }

      return { intent: 'refactor', confidence: 0.5, handled: true };
    }

    // Check recent commands for context
    if (input.recentCommands?.length) {
      const lastCommand = input.recentCommands[0].toLowerCase();
      if (lastCommand.includes('test')) {
        return { intent: 'test', confidence: 0.5, handled: true };
      }
    }

    return { intent: 'unknown', confidence: 0, handled: false };
  }
}

export default IDEIntentApp;

