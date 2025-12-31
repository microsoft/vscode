/**
 * SWE Agent Tools
 *
 * Tool definitions and registry for SWE Agent operations.
 */

import { SWEAgentClient } from './sweAgent';

/**
 * Tool parameter definition
 */
export interface ToolParameter {
    name: string;
    type: 'string' | 'number' | 'boolean' | 'array' | 'object';
    description: string;
    required: boolean;
    default?: any;
}

/**
 * Tool definition
 */
export interface ToolDefinition {
    name: string;
    description: string;
    parameters: ToolParameter[];
    model: string;
    category: 'code' | 'debug' | 'test' | 'review' | 'docs' | 'devops';
}

/**
 * Tool execution result
 */
export interface ToolResult {
    success: boolean;
    output?: string;
    error?: string;
    modelUsed?: string;
    latencyMs?: number;
}

/**
 * Registry of all SWE tools
 */
export class ToolRegistry {
    private client: SWEAgentClient;
    private tools: Map<string, ToolDefinition>;

    constructor(client: SWEAgentClient) {
        this.client = client;
        this.tools = new Map();

        this.registerBuiltinTools();
    }

    /**
     * Register builtin tools
     */
    private registerBuiltinTools() {
        // Code generation tools
        this.register({
            name: 'generate_code',
            description: 'Generate code from a natural language description',
            parameters: [
                {
                    name: 'prompt',
                    type: 'string',
                    description: 'Description of the code to generate',
                    required: true,
                },
                {
                    name: 'language',
                    type: 'string',
                    description: 'Target programming language',
                    required: false,
                    default: 'auto',
                },
            ],
            model: 'codex-01',
            category: 'code',
        });

        this.register({
            name: 'complete_code',
            description: 'Complete code at the current cursor position',
            parameters: [
                {
                    name: 'prefix',
                    type: 'string',
                    description: 'Code before the cursor',
                    required: true,
                },
                {
                    name: 'suffix',
                    type: 'string',
                    description: 'Code after the cursor',
                    required: false,
                },
            ],
            model: 'codex-01',
            category: 'code',
        });

        // Debug tools
        this.register({
            name: 'diagnose_error',
            description: 'Diagnose an error or bug in code',
            parameters: [
                {
                    name: 'code',
                    type: 'string',
                    description: 'Code with the error',
                    required: true,
                },
                {
                    name: 'error_message',
                    type: 'string',
                    description: 'Error message or stack trace',
                    required: false,
                },
            ],
            model: 'debug-01',
            category: 'debug',
        });

        this.register({
            name: 'fix_bug',
            description: 'Fix a bug in code',
            parameters: [
                {
                    name: 'code',
                    type: 'string',
                    description: 'Code with the bug',
                    required: true,
                },
                {
                    name: 'description',
                    type: 'string',
                    description: 'Description of the bug',
                    required: false,
                },
            ],
            model: 'debug-01',
            category: 'debug',
        });

        // Test tools
        this.register({
            name: 'generate_tests',
            description: 'Generate unit tests for code',
            parameters: [
                {
                    name: 'code',
                    type: 'string',
                    description: 'Code to test',
                    required: true,
                },
                {
                    name: 'framework',
                    type: 'string',
                    description: 'Test framework (pytest, jest, go test, etc.)',
                    required: false,
                    default: 'auto',
                },
            ],
            model: 'test-01',
            category: 'test',
        });

        this.register({
            name: 'analyze_coverage',
            description: 'Analyze test coverage and suggest missing tests',
            parameters: [
                {
                    name: 'code',
                    type: 'string',
                    description: 'Code to analyze',
                    required: true,
                },
                {
                    name: 'existing_tests',
                    type: 'string',
                    description: 'Existing test code',
                    required: false,
                },
            ],
            model: 'test-01',
            category: 'test',
        });

        // Review tools
        this.register({
            name: 'review_code',
            description: 'Review code for issues and improvements',
            parameters: [
                {
                    name: 'code',
                    type: 'string',
                    description: 'Code to review',
                    required: true,
                },
                {
                    name: 'focus',
                    type: 'string',
                    description: 'Focus area (security, performance, style)',
                    required: false,
                },
            ],
            model: 'review-01',
            category: 'review',
        });

        this.register({
            name: 'security_scan',
            description: 'Scan code for security vulnerabilities',
            parameters: [
                {
                    name: 'code',
                    type: 'string',
                    description: 'Code to scan',
                    required: true,
                },
            ],
            model: 'review-01',
            category: 'review',
        });

        // Documentation tools
        this.register({
            name: 'generate_docstring',
            description: 'Generate docstrings for functions/classes',
            parameters: [
                {
                    name: 'code',
                    type: 'string',
                    description: 'Code to document',
                    required: true,
                },
                {
                    name: 'style',
                    type: 'string',
                    description: 'Documentation style (google, numpy, jsdoc)',
                    required: false,
                    default: 'google',
                },
            ],
            model: 'docs-01',
            category: 'docs',
        });

        this.register({
            name: 'explain_code',
            description: 'Explain what code does in plain language',
            parameters: [
                {
                    name: 'code',
                    type: 'string',
                    description: 'Code to explain',
                    required: true,
                },
                {
                    name: 'audience',
                    type: 'string',
                    description: 'Target audience (beginner, intermediate, expert)',
                    required: false,
                    default: 'intermediate',
                },
            ],
            model: 'docs-01',
            category: 'docs',
        });

        // DevOps tools
        this.register({
            name: 'generate_sql',
            description: 'Generate SQL query from natural language',
            parameters: [
                {
                    name: 'question',
                    type: 'string',
                    description: 'Question to answer with SQL',
                    required: true,
                },
                {
                    name: 'schema',
                    type: 'string',
                    description: 'Database schema',
                    required: false,
                },
                {
                    name: 'dialect',
                    type: 'string',
                    description: 'SQL dialect (postgresql, mysql, sqlite)',
                    required: false,
                    default: 'postgresql',
                },
            ],
            model: 'sql-01',
            category: 'devops',
        });

        this.register({
            name: 'generate_shell',
            description: 'Generate shell command from description',
            parameters: [
                {
                    name: 'description',
                    type: 'string',
                    description: 'What the command should do',
                    required: true,
                },
                {
                    name: 'shell',
                    type: 'string',
                    description: 'Shell type (bash, zsh, powershell)',
                    required: false,
                    default: 'bash',
                },
            ],
            model: 'shell-01',
            category: 'devops',
        });

        this.register({
            name: 'generate_commit_message',
            description: 'Generate commit message from diff',
            parameters: [
                {
                    name: 'diff',
                    type: 'string',
                    description: 'Git diff to summarize',
                    required: true,
                },
                {
                    name: 'style',
                    type: 'string',
                    description: 'Commit style (conventional, angular)',
                    required: false,
                    default: 'conventional',
                },
            ],
            model: 'git-01',
            category: 'devops',
        });
    }

    /**
     * Register a tool
     */
    register(tool: ToolDefinition) {
        this.tools.set(tool.name, tool);
    }

    /**
     * Get tool by name
     */
    get(name: string): ToolDefinition | undefined {
        return this.tools.get(name);
    }

    /**
     * Get all tools
     */
    getAll(): ToolDefinition[] {
        return Array.from(this.tools.values());
    }

    /**
     * Get tools by category
     */
    getByCategory(category: string): ToolDefinition[] {
        return this.getAll().filter((t) => t.category === category);
    }

    /**
     * Get tools by model
     */
    getByModel(model: string): ToolDefinition[] {
        return this.getAll().filter((t) => t.model === model);
    }

    /**
     * Execute a tool
     */
    async execute(
        name: string,
        params: Record<string, any>
    ): Promise<ToolResult> {
        const tool = this.get(name);
        if (!tool) {
            return {
                success: false,
                error: `Unknown tool: ${name}`,
            };
        }

        // Validate required parameters
        for (const param of tool.parameters) {
            if (param.required && !(param.name in params)) {
                return {
                    success: false,
                    error: `Missing required parameter: ${param.name}`,
                };
            }
        }

        // Apply defaults
        for (const param of tool.parameters) {
            if (!(param.name in params) && param.default !== undefined) {
                params[param.name] = param.default;
            }
        }

        try {
            const startTime = Date.now();

            // Route to appropriate client method
            const output = await this.routeToClient(tool, params);

            return {
                success: true,
                output,
                modelUsed: tool.model,
                latencyMs: Date.now() - startTime,
            };
        } catch (e) {
            return {
                success: false,
                error: `${e}`,
            };
        }
    }

    /**
     * Route tool execution to client method
     */
    private async routeToClient(
        tool: ToolDefinition,
        params: Record<string, any>
    ): Promise<string> {
        switch (tool.name) {
            case 'generate_code':
                return this.client.generate(params.prompt, { language: params.language });

            case 'fix_bug':
            case 'diagnose_error':
                return this.client.fix(
                    params.code,
                    params.description || params.error_message || '',
                    {}
                );

            case 'generate_tests':
            case 'analyze_coverage':
                return this.client.generateTests(params.code, {});

            case 'review_code':
            case 'security_scan':
                return this.client.review(params.code, {});

            case 'generate_docstring':
            case 'explain_code':
                return params.code
                    ? this.client.explain(params.code, {})
                    : this.client.document(params.code, {});

            default:
                return this.client.generate(JSON.stringify(params), {});
        }
    }

    /**
     * Get tool definitions in OpenAI function format
     */
    toOpenAIFormat(): object[] {
        return this.getAll().map((tool) => ({
            type: 'function',
            function: {
                name: tool.name,
                description: tool.description,
                parameters: {
                    type: 'object',
                    properties: Object.fromEntries(
                        tool.parameters.map((p) => [
                            p.name,
                            {
                                type: p.type,
                                description: p.description,
                            },
                        ])
                    ),
                    required: tool.parameters
                        .filter((p) => p.required)
                        .map((p) => p.name),
                },
            },
        }));
    }
}


