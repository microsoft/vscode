/**
 * Research Tools - Tools for web search and research operations
 *
 * Provides agents with the ability to:
 * - Search the web
 * - Fetch URL content
 * - Invoke Athena deep research
 * - Create and manage citations
 *
 * These tools integrate with Athena research service.
 */

import * as vscode from 'vscode';
import type {
  ToolDefinition,
  ToolImplementation,
  ToolInvocationContext,
  ToolResult,
} from '../AriaToolRegistry';

// =============================================================================
// Athena Client
// =============================================================================

interface AthenaSession {
  id: string;
  question: string;
  status: string;
  created_at: string;
}

interface AthenaThread {
  id: string;
  name: string;
  status: string;
  sources: any[];
  propositions: any[];
  narrative?: string;
}

class AthenaClient {
  private static instance: AthenaClient;
  private baseUrl: string;

  private constructor() {
    // Get Athena URL from configuration
    const config = vscode.workspace.getConfiguration('logos');
    this.baseUrl = config.get('athena.baseUrl') || 'https://athena.bravozero.ai';
  }

  static getInstance(): AthenaClient {
    if (!AthenaClient.instance) {
      AthenaClient.instance = new AthenaClient();
    }
    return AthenaClient.instance;
  }

  async createSession(question: string): Promise<AthenaSession> {
    const response = await fetch(`${this.baseUrl}/v1/sessions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ question }),
    });

    if (!response.ok) {
      throw new Error(`Failed to create Athena session: ${response.statusText}`);
    }

    return response.json();
  }

  async getSession(sessionId: string): Promise<AthenaSession> {
    const response = await fetch(`${this.baseUrl}/v1/sessions/${sessionId}`);

    if (!response.ok) {
      throw new Error(`Failed to get session: ${response.statusText}`);
    }

    return response.json();
  }

  async getThreads(sessionId: string): Promise<AthenaThread[]> {
    const response = await fetch(`${this.baseUrl}/v1/sessions/${sessionId}/threads`);

    if (!response.ok) {
      throw new Error(`Failed to get threads: ${response.statusText}`);
    }

    return response.json();
  }

  async getSources(sessionId: string): Promise<any[]> {
    const response = await fetch(`${this.baseUrl}/v1/sessions/${sessionId}/sources`);

    if (!response.ok) {
      throw new Error(`Failed to get sources: ${response.statusText}`);
    }

    return response.json();
  }

  async getNarrative(sessionId: string): Promise<string> {
    const response = await fetch(`${this.baseUrl}/v1/narratives/${sessionId}`);

    if (!response.ok) {
      throw new Error(`Failed to get narrative: ${response.statusText}`);
    }

    const data = await response.json();
    return data.content || '';
  }

  async conductResearch(
    question: string,
    options?: {
      maxSources?: number;
      timeout?: number;
    }
  ): Promise<{
    session: AthenaSession;
    threads: AthenaThread[];
    narrative: string;
  }> {
    // Create session
    const session = await this.createSession(question);

    // Poll for completion
    const timeout = options?.timeout || 120000; // 2 minutes default
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      const status = await this.getSession(session.id);

      if (status.status === 'completed' || status.status === 'synthesized') {
        const [threads, narrative] = await Promise.all([
          this.getThreads(session.id),
          this.getNarrative(session.id),
        ]);

        return { session: status, threads, narrative };
      }

      if (status.status === 'failed' || status.status === 'error') {
        throw new Error(`Research failed: ${status.status}`);
      }

      // Wait before polling again
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }

    throw new Error('Research timed out');
  }
}

// =============================================================================
// Web Search Tool
// =============================================================================

export const webSearchDefinition: ToolDefinition = {
  id: 'web_search',
  displayName: 'Web Search',
  modelDescription: `Search the web for current information on any topic.

Use this for:
- Finding up-to-date documentation
- Researching technologies
- Checking current best practices
- Verifying facts

Returns search results with titles, URLs, and snippets.`,
  userDescription: 'Search the web for information',
  category: 'web',
  parameters: [
    {
      name: 'query',
      type: 'string',
      description: 'The search query',
      required: true,
    },
    {
      name: 'maxResults',
      type: 'number',
      description: 'Maximum number of results (default: 10)',
      required: false,
      default: 10,
    },
  ],
  isReadOnly: true,
  requiresConfirmation: false,
  icon: '🔍',
  tags: ['web', 'search', 'research'],
};

export class WebSearchTool implements ToolImplementation {
  private athenaClient = AthenaClient.getInstance();

  async execute(
    params: { query: string; maxResults?: number },
    context: ToolInvocationContext
  ): Promise<ToolResult> {
    const startTime = performance.now();

    try {
      // Use Athena's source harvester for web search
      const response = await fetch(
        `${this.getAthenaUrl()}/v1/sources/search?q=${encodeURIComponent(params.query)}&limit=${params.maxResults || 10}`
      );

      if (!response.ok) {
        // Fallback to simulated search results for now
        return this.simulatedSearch(params.query, startTime);
      }

      const sources = await response.json();

      const results = sources.map((source: any) => ({
        title: source.title,
        url: source.url,
        snippet: source.excerpt || source.description,
        source: source.connector_type,
      }));

      return {
        success: true,
        content: JSON.stringify(results, null, 2),
        executionTimeMs: performance.now() - startTime,
      };
    } catch (error) {
      // Fallback to simulated search
      return this.simulatedSearch(params.query, startTime);
    }
  }

  private getAthenaUrl(): string {
    const config = vscode.workspace.getConfiguration('logos');
    return config.get('athena.baseUrl') || 'https://athena.bravozero.ai';
  }

  private simulatedSearch(query: string, startTime: number): ToolResult {
    // Provide helpful response when Athena is not available
    return {
      success: true,
      content: JSON.stringify(
        [
          {
            title: `Search results for: ${query}`,
            url: `https://www.google.com/search?q=${encodeURIComponent(query)}`,
            snippet: `Web search functionality requires Athena service. Configure logos.athena.baseUrl in settings.`,
            note: 'Connect to Athena for full web search capabilities',
          },
        ],
        null,
        2
      ),
      executionTimeMs: performance.now() - startTime,
    };
  }

  validate(params: Record<string, any>): { valid: boolean; error?: string } {
    if (!params.query || typeof params.query !== 'string') {
      return { valid: false, error: 'query is required and must be a string' };
    }
    if (params.query.length < 2) {
      return { valid: false, error: 'query must be at least 2 characters' };
    }
    return { valid: true };
  }
}

// =============================================================================
// Fetch URL Tool
// =============================================================================

export const fetchUrlDefinition: ToolDefinition = {
  id: 'fetch_url',
  displayName: 'Fetch URL',
  modelDescription: `Fetch the content of a URL and extract its text.

Use this for:
- Reading documentation pages
- Extracting content from web pages
- Fetching API responses
- Reading README files from GitHub`,
  userDescription: 'Fetch and extract content from a URL',
  category: 'web',
  parameters: [
    {
      name: 'url',
      type: 'string',
      description: 'The URL to fetch',
      required: true,
    },
    {
      name: 'extractText',
      type: 'boolean',
      description: 'Extract readable text from HTML (default: true)',
      required: false,
      default: true,
    },
  ],
  isReadOnly: true,
  requiresConfirmation: false,
  icon: '🌐',
  tags: ['web', 'fetch', 'read'],
};

export class FetchUrlTool implements ToolImplementation {
  async execute(
    params: { url: string; extractText?: boolean },
    context: ToolInvocationContext
  ): Promise<ToolResult> {
    const startTime = performance.now();

    try {
      const response = await fetch(params.url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; LogosIDE/1.0; +https://logos.bravozero.ai)',
        },
      });

      if (!response.ok) {
        return {
          success: false,
          content: '',
          error: `Failed to fetch URL: ${response.status} ${response.statusText}`,
          executionTimeMs: performance.now() - startTime,
        };
      }

      const contentType = response.headers.get('content-type') || '';
      let content: string;

      if (contentType.includes('application/json')) {
        const json = await response.json();
        content = JSON.stringify(json, null, 2);
      } else {
        const html = await response.text();

        if (params.extractText !== false && contentType.includes('text/html')) {
          content = this.extractTextFromHtml(html);
        } else {
          content = html;
        }
      }

      // Truncate if too long
      const maxLength = 50000;
      if (content.length > maxLength) {
        content = content.slice(0, maxLength) + '\n\n... (truncated)';
      }

      return {
        success: true,
        content,
        artifacts: [
          {
            type: 'file',
            path: params.url,
            metadata: {
              contentType,
              length: content.length,
            },
          },
        ],
        executionTimeMs: performance.now() - startTime,
      };
    } catch (error) {
      return {
        success: false,
        content: '',
        error: error instanceof Error ? error.message : String(error),
        executionTimeMs: performance.now() - startTime,
      };
    }
  }

  private extractTextFromHtml(html: string): string {
    // Simple HTML to text extraction
    let text = html
      // Remove script and style tags
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      // Remove HTML comments
      .replace(/<!--[\s\S]*?-->/g, '')
      // Replace block elements with newlines
      .replace(/<\/(p|div|h[1-6]|li|tr|br)>/gi, '\n')
      // Remove remaining tags
      .replace(/<[^>]+>/g, '')
      // Decode HTML entities
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      // Clean up whitespace
      .replace(/\n\s*\n/g, '\n\n')
      .replace(/[ \t]+/g, ' ')
      .trim();

    return text;
  }

  validate(params: Record<string, any>): { valid: boolean; error?: string } {
    if (!params.url || typeof params.url !== 'string') {
      return { valid: false, error: 'url is required and must be a string' };
    }
    try {
      new URL(params.url);
    } catch {
      return { valid: false, error: 'url must be a valid URL' };
    }
    return { valid: true };
  }
}

// =============================================================================
// Athena Research Tool
// =============================================================================

export const athenaResearchDefinition: ToolDefinition = {
  id: 'athena_research',
  displayName: 'Athena Deep Research',
  modelDescription: `Conduct deep research on a topic using Athena's research pipeline.

This performs comprehensive research including:
- Multi-source gathering from web, documentation, and internal sources
- Cross-validation of claims
- Evidence chain tracking
- Narrative synthesis with citations

Use for complex research questions that need thorough investigation.`,
  userDescription: 'Conduct deep research via Athena',
  category: 'web',
  parameters: [
    {
      name: 'question',
      type: 'string',
      description: 'The research question to investigate',
      required: true,
    },
    {
      name: 'timeout',
      type: 'number',
      description: 'Maximum time to wait for results in seconds (default: 120)',
      required: false,
      default: 120,
    },
  ],
  isReadOnly: true,
  requiresConfirmation: false,
  icon: '🔬',
  tags: ['research', 'athena', 'deep'],
};

export class AthenaResearchTool implements ToolImplementation {
  private athenaClient = AthenaClient.getInstance();

  async execute(
    params: { question: string; timeout?: number },
    context: ToolInvocationContext
  ): Promise<ToolResult> {
    const startTime = performance.now();

    try {
      const result = await this.athenaClient.conductResearch(params.question, {
        timeout: (params.timeout || 120) * 1000,
      });

      const output = {
        sessionId: result.session.id,
        question: params.question,
        status: result.session.status,
        narrative: result.narrative,
        threadCount: result.threads.length,
        threads: result.threads.map((t) => ({
          name: t.name,
          status: t.status,
          sourceCount: t.sources?.length || 0,
          propositionCount: t.propositions?.length || 0,
        })),
      };

      return {
        success: true,
        content: JSON.stringify(output, null, 2),
        executionTimeMs: performance.now() - startTime,
      };
    } catch (error) {
      return {
        success: false,
        content: '',
        error: error instanceof Error ? error.message : String(error),
        executionTimeMs: performance.now() - startTime,
      };
    }
  }

  validate(params: Record<string, any>): { valid: boolean; error?: string } {
    if (!params.question || typeof params.question !== 'string') {
      return { valid: false, error: 'question is required and must be a string' };
    }
    if (params.question.length < 10) {
      return { valid: false, error: 'question should be at least 10 characters' };
    }
    return { valid: true };
  }
}

// =============================================================================
// Citation Tool
// =============================================================================

export const createCitationDefinition: ToolDefinition = {
  id: 'create_citation',
  displayName: 'Create Citation',
  modelDescription: `Create a properly formatted citation for a source.

Supports various citation styles (APA, MLA, Chicago, etc.)`,
  userDescription: 'Create a citation',
  category: 'web',
  parameters: [
    {
      name: 'url',
      type: 'string',
      description: 'URL of the source',
      required: true,
    },
    {
      name: 'title',
      type: 'string',
      description: 'Title of the source',
      required: true,
    },
    {
      name: 'author',
      type: 'string',
      description: 'Author name(s)',
      required: false,
    },
    {
      name: 'date',
      type: 'string',
      description: 'Publication date (YYYY-MM-DD)',
      required: false,
    },
    {
      name: 'style',
      type: 'string',
      description: 'Citation style (apa, mla, chicago)',
      required: false,
      default: 'apa',
      enum: ['apa', 'mla', 'chicago'],
    },
  ],
  isReadOnly: true,
  requiresConfirmation: false,
  icon: '📚',
  tags: ['citation', 'reference'],
};

export class CreateCitationTool implements ToolImplementation {
  async execute(
    params: {
      url: string;
      title: string;
      author?: string;
      date?: string;
      style?: string;
    },
    context: ToolInvocationContext
  ): Promise<ToolResult> {
    const startTime = performance.now();

    const style = params.style || 'apa';
    const accessDate = new Date().toISOString().split('T')[0];
    const pubDate = params.date ? new Date(params.date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }) : 'n.d.';
    const author = params.author || 'Unknown Author';

    let citation: string;

    switch (style) {
      case 'mla':
        citation = `${author}. "${params.title}." Web. ${accessDate}. <${params.url}>.`;
        break;
      case 'chicago':
        citation = `${author}. "${params.title}." Accessed ${accessDate}. ${params.url}.`;
        break;
      case 'apa':
      default:
        citation = `${author}. (${pubDate}). ${params.title}. Retrieved from ${params.url}`;
        break;
    }

    return {
      success: true,
      content: JSON.stringify(
        {
          citation,
          style,
          metadata: {
            url: params.url,
            title: params.title,
            author: params.author,
            date: params.date,
            accessDate,
          },
        },
        null,
        2
      ),
      executionTimeMs: performance.now() - startTime,
    };
  }

  validate(params: Record<string, any>): { valid: boolean; error?: string } {
    if (!params.url) return { valid: false, error: 'url is required' };
    if (!params.title) return { valid: false, error: 'title is required' };
    return { valid: true };
  }
}

// =============================================================================
// Register all research tools
// =============================================================================

import { AriaToolRegistry } from '../AriaToolRegistry';

export function registerResearchTools(registry: AriaToolRegistry): void {
  registry.registerTool(webSearchDefinition, new WebSearchTool());
  registry.registerTool(fetchUrlDefinition, new FetchUrlTool());
  registry.registerTool(athenaResearchDefinition, new AthenaResearchTool());
  registry.registerTool(createCitationDefinition, new CreateCitationTool());
}

