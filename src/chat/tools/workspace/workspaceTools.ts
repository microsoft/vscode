/**
 * Workspace Tools - Tools for analyzing workspace structure and content
 *
 * Provides agents with the ability to:
 * - Analyze workspace structure
 * - Generate project summaries
 * - Detect technologies and frameworks
 * - Find dependencies
 */

import * as vscode from 'vscode';
import type {
  ToolDefinition,
  ToolImplementation,
  ToolInvocationContext,
  ToolResult,
} from '../AriaToolRegistry';

// =============================================================================
// Technology Detection Patterns
// =============================================================================

interface TechPattern {
  name: string;
  category: string;
  files: string[];
  packagePatterns?: string[];
}

const TECH_PATTERNS: TechPattern[] = [
  // JavaScript/TypeScript
  { name: 'TypeScript', category: 'language', files: ['tsconfig.json', '*.ts', '*.tsx'] },
  { name: 'JavaScript', category: 'language', files: ['*.js', '*.jsx', '*.mjs'] },
  { name: 'React', category: 'framework', files: [], packagePatterns: ['react', 'react-dom'] },
  { name: 'Vue', category: 'framework', files: ['*.vue'], packagePatterns: ['vue'] },
  { name: 'Angular', category: 'framework', files: ['angular.json'], packagePatterns: ['@angular/core'] },
  { name: 'Next.js', category: 'framework', files: ['next.config.js', 'next.config.mjs'], packagePatterns: ['next'] },
  { name: 'Node.js', category: 'runtime', files: ['package.json'] },
  { name: 'Express', category: 'framework', files: [], packagePatterns: ['express'] },
  { name: 'Vite', category: 'build', files: ['vite.config.ts', 'vite.config.js'], packagePatterns: ['vite'] },
  { name: 'Webpack', category: 'build', files: ['webpack.config.js'], packagePatterns: ['webpack'] },

  // Python
  { name: 'Python', category: 'language', files: ['*.py', 'requirements.txt', 'pyproject.toml', 'setup.py'] },
  { name: 'FastAPI', category: 'framework', files: [], packagePatterns: ['fastapi'] },
  { name: 'Django', category: 'framework', files: ['manage.py'], packagePatterns: ['django'] },
  { name: 'Flask', category: 'framework', files: [], packagePatterns: ['flask'] },

  // Go
  { name: 'Go', category: 'language', files: ['go.mod', 'go.sum', '*.go'] },
  { name: 'Gin', category: 'framework', files: [], packagePatterns: ['github.com/gin-gonic/gin'] },

  // Rust
  { name: 'Rust', category: 'language', files: ['Cargo.toml', 'Cargo.lock', '*.rs'] },

  // Infrastructure
  { name: 'Docker', category: 'container', files: ['Dockerfile', 'docker-compose.yml', 'docker-compose.yaml'] },
  { name: 'Kubernetes', category: 'orchestration', files: ['*.yaml', '*.yml'], packagePatterns: ['kustomize'] },
  { name: 'Terraform', category: 'iac', files: ['*.tf', '*.tfvars'] },
  { name: 'Helm', category: 'package', files: ['Chart.yaml', 'values.yaml'] },

  // Testing
  { name: 'Jest', category: 'testing', files: ['jest.config.js', 'jest.config.ts'], packagePatterns: ['jest'] },
  { name: 'Vitest', category: 'testing', files: ['vitest.config.ts'], packagePatterns: ['vitest'] },
  { name: 'Pytest', category: 'testing', files: ['pytest.ini', 'conftest.py'], packagePatterns: ['pytest'] },

  // CI/CD
  { name: 'GitHub Actions', category: 'ci', files: ['.github/workflows/*.yml', '.github/workflows/*.yaml'] },
  { name: 'GitLab CI', category: 'ci', files: ['.gitlab-ci.yml'] },

  // Database
  { name: 'PostgreSQL', category: 'database', files: [], packagePatterns: ['pg', 'psycopg2', 'asyncpg'] },
  { name: 'MongoDB', category: 'database', files: [], packagePatterns: ['mongodb', 'mongoose', 'pymongo'] },
  { name: 'Redis', category: 'database', files: [], packagePatterns: ['redis', 'ioredis'] },
  { name: 'Prisma', category: 'orm', files: ['prisma/schema.prisma'], packagePatterns: ['@prisma/client'] },
];

// =============================================================================
// Workspace Analysis Tool
// =============================================================================

export const workspaceAnalysisDefinition: ToolDefinition = {
  id: 'workspace_analysis',
  displayName: 'Workspace Analysis',
  modelDescription: `Analyze the workspace structure and detect technologies.

Returns:
- Project structure overview
- Detected languages and frameworks
- Dependencies
- Configuration files
- Directory statistics`,
  userDescription: 'Analyze workspace structure',
  category: 'workspace',
  parameters: [
    {
      name: 'includeStats',
      type: 'boolean',
      description: 'Include file statistics (default: true)',
      required: false,
      default: true,
    },
    {
      name: 'detectDeps',
      type: 'boolean',
      description: 'Detect dependencies from package files (default: true)',
      required: false,
      default: true,
    },
    {
      name: 'maxDepth',
      type: 'number',
      description: 'Maximum directory depth to analyze (default: 4)',
      required: false,
      default: 4,
    },
  ],
  isReadOnly: true,
  requiresConfirmation: false,
  icon: '🏗️',
  tags: ['workspace', 'analysis', 'structure'],
};

export class WorkspaceAnalysisTool implements ToolImplementation {
  async execute(
    params: { includeStats?: boolean; detectDeps?: boolean; maxDepth?: number },
    context: ToolInvocationContext
  ): Promise<ToolResult> {
    const startTime = performance.now();

    try {
      const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri;
      if (!workspaceRoot) {
        return {
          success: false,
          content: '',
          error: 'No workspace folder open',
          executionTimeMs: performance.now() - startTime,
        };
      }

      // Gather analysis data in parallel
      const [structure, technologies, dependencies, stats] = await Promise.all([
        this.analyzeStructure(workspaceRoot, params.maxDepth || 4),
        this.detectTechnologies(workspaceRoot),
        params.detectDeps !== false ? this.analyzeDependencies(workspaceRoot) : null,
        params.includeStats !== false ? this.gatherStats(workspaceRoot) : null,
      ]);

      const analysis = {
        workspace: {
          name: workspaceRoot.fsPath.split('/').pop(),
          path: workspaceRoot.fsPath,
        },
        structure,
        technologies,
        dependencies,
        stats,
      };

      return {
        success: true,
        content: JSON.stringify(analysis, null, 2),
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

  private async analyzeStructure(
    root: vscode.Uri,
    maxDepth: number
  ): Promise<any> {
    const importantDirs = ['src', 'lib', 'app', 'pages', 'components', 'api', 'test', 'tests', 'docs', 'scripts'];
    const structure: Record<string, any> = {};

    try {
      const entries = await vscode.workspace.fs.readDirectory(root);

      for (const [name, type] of entries) {
        if (name.startsWith('.') && name !== '.github') continue;
        if (name === 'node_modules' || name === '__pycache__' || name === 'venv') continue;

        if (type === vscode.FileType.Directory) {
          if (importantDirs.includes(name) || maxDepth > 1) {
            const subUri = vscode.Uri.joinPath(root, name);
            structure[name] = await this.analyzeStructure(subUri, maxDepth - 1);
          } else {
            structure[name] = { type: 'directory' };
          }
        } else {
          // Only track important config files at root level
          if (this.isImportantFile(name)) {
            structure[name] = { type: 'file' };
          }
        }
      }
    } catch {
      // Directory not accessible
    }

    return structure;
  }

  private isImportantFile(name: string): boolean {
    const importantFiles = [
      'package.json', 'tsconfig.json', 'vite.config.ts', 'next.config.js',
      'Dockerfile', 'docker-compose.yml', 'docker-compose.yaml',
      'go.mod', 'Cargo.toml', 'pyproject.toml', 'requirements.txt',
      'README.md', 'LICENSE', '.env.example',
    ];
    return importantFiles.includes(name) || name.endsWith('.config.ts') || name.endsWith('.config.js');
  }

  private async detectTechnologies(root: vscode.Uri): Promise<any> {
    const detected: Record<string, string[]> = {};

    for (const pattern of TECH_PATTERNS) {
      const found = await this.checkTechPattern(root, pattern);
      if (found) {
        if (!detected[pattern.category]) {
          detected[pattern.category] = [];
        }
        detected[pattern.category].push(pattern.name);
      }
    }

    return detected;
  }

  private async checkTechPattern(root: vscode.Uri, pattern: TechPattern): Promise<boolean> {
    // Check for file patterns
    for (const file of pattern.files) {
      const files = await vscode.workspace.findFiles(file, '**/node_modules/**', 1);
      if (files.length > 0) {
        return true;
      }
    }

    // Check package.json for dependencies
    if (pattern.packagePatterns?.length) {
      try {
        const packageJson = vscode.Uri.joinPath(root, 'package.json');
        const content = await vscode.workspace.fs.readFile(packageJson);
        const pkg = JSON.parse(Buffer.from(content).toString('utf8'));
        const allDeps = {
          ...pkg.dependencies,
          ...pkg.devDependencies,
        };

        for (const dep of pattern.packagePatterns) {
          if (allDeps[dep]) {
            return true;
          }
        }
      } catch {
        // No package.json
      }
    }

    return false;
  }

  private async analyzeDependencies(root: vscode.Uri): Promise<any> {
    const deps: any = {};

    // Check package.json
    try {
      const packageJson = vscode.Uri.joinPath(root, 'package.json');
      const content = await vscode.workspace.fs.readFile(packageJson);
      const pkg = JSON.parse(Buffer.from(content).toString('utf8'));

      deps.npm = {
        dependencies: Object.keys(pkg.dependencies || {}).length,
        devDependencies: Object.keys(pkg.devDependencies || {}).length,
        scripts: Object.keys(pkg.scripts || {}),
      };
    } catch {
      // No package.json
    }

    // Check requirements.txt
    try {
      const requirements = vscode.Uri.joinPath(root, 'requirements.txt');
      const content = await vscode.workspace.fs.readFile(requirements);
      const lines = Buffer.from(content).toString('utf8').split('\n').filter((l) => l.trim() && !l.startsWith('#'));
      deps.python = { packages: lines.length };
    } catch {
      // No requirements.txt
    }

    // Check go.mod
    try {
      const goMod = vscode.Uri.joinPath(root, 'go.mod');
      const content = await vscode.workspace.fs.readFile(goMod);
      const lines = Buffer.from(content).toString('utf8').split('\n');
      const requireLines = lines.filter((l) => l.trim().startsWith('require') || l.includes('/'));
      deps.go = { modules: requireLines.length };
    } catch {
      // No go.mod
    }

    return Object.keys(deps).length > 0 ? deps : null;
  }

  private async gatherStats(root: vscode.Uri): Promise<any> {
    const stats: Record<string, number> = {};
    const extensions = ['ts', 'tsx', 'js', 'jsx', 'py', 'go', 'rs', 'java', 'rb', 'php'];

    for (const ext of extensions) {
      const files = await vscode.workspace.findFiles(`**/*.${ext}`, '**/node_modules/**', 1000);
      if (files.length > 0) {
        stats[ext] = files.length;
      }
    }

    return stats;
  }
}

// =============================================================================
// Get Project Summary Tool
// =============================================================================

export const getProjectSummaryDefinition: ToolDefinition = {
  id: 'get_project_summary',
  displayName: 'Get Project Summary',
  modelDescription: `Get a concise summary of the project including:
- README content
- Main entry points
- Key configuration
- Architecture overview if available`,
  userDescription: 'Get project summary',
  category: 'workspace',
  parameters: [],
  isReadOnly: true,
  requiresConfirmation: false,
  icon: '📋',
  tags: ['project', 'summary', 'read'],
};

export class GetProjectSummaryTool implements ToolImplementation {
  async execute(
    params: Record<string, never>,
    context: ToolInvocationContext
  ): Promise<ToolResult> {
    const startTime = performance.now();

    try {
      const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri;
      if (!workspaceRoot) {
        return {
          success: false,
          content: '',
          error: 'No workspace folder open',
          executionTimeMs: performance.now() - startTime,
        };
      }

      const summary: any = {
        name: workspaceRoot.fsPath.split('/').pop(),
      };

      // Read README
      try {
        const readmeFiles = ['README.md', 'readme.md', 'README.MD', 'README'];
        for (const readmeFile of readmeFiles) {
          try {
            const readme = vscode.Uri.joinPath(workspaceRoot, readmeFile);
            const content = await vscode.workspace.fs.readFile(readme);
            summary.readme = Buffer.from(content).toString('utf8').slice(0, 3000);
            break;
          } catch {
            // Try next
          }
        }
      } catch {
        // No README
      }

      // Read package.json for project info
      try {
        const packageJson = vscode.Uri.joinPath(workspaceRoot, 'package.json');
        const content = await vscode.workspace.fs.readFile(packageJson);
        const pkg = JSON.parse(Buffer.from(content).toString('utf8'));
        summary.package = {
          name: pkg.name,
          version: pkg.version,
          description: pkg.description,
          main: pkg.main,
          scripts: Object.keys(pkg.scripts || {}),
        };
      } catch {
        // No package.json
      }

      // Check for architecture docs
      try {
        const archDocs = ['docs/architecture.md', 'ARCHITECTURE.md', 'docs/ARCHITECTURE.md'];
        for (const doc of archDocs) {
          try {
            const docUri = vscode.Uri.joinPath(workspaceRoot, doc);
            const content = await vscode.workspace.fs.readFile(docUri);
            summary.architecture = Buffer.from(content).toString('utf8').slice(0, 2000);
            break;
          } catch {
            // Try next
          }
        }
      } catch {
        // No architecture docs
      }

      return {
        success: true,
        content: JSON.stringify(summary, null, 2),
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
}

// =============================================================================
// Register workspace tools
// =============================================================================

import { AriaToolRegistry } from '../AriaToolRegistry';

export function registerWorkspaceTools(registry: AriaToolRegistry): void {
  registry.registerTool(workspaceAnalysisDefinition, new WorkspaceAnalysisTool());
  registry.registerTool(getProjectSummaryDefinition, new GetProjectSummaryTool());
}

