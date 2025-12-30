/**
 * DocGenerator - Auto-generates documentation from project analysis
 */

import type { ProjectModel } from './WorkspaceCA';

export class DocGenerator {
  private ca: any; // WorkspaceCA

  constructor(ca: any) {
    this.ca = ca;
  }

  /**
   * Generate a Mermaid architecture diagram
   */
  generateMermaidDiagram(model: ProjectModel): string {
    const lines: string[] = ['```mermaid', 'flowchart TB'];

    // Group modules by directory
    const groups = this.groupModulesByDirectory(model.modules);

    // Generate subgraphs for each directory
    for (const [dir, modules] of Object.entries(groups)) {
      const sanitizedDir = dir.replace(/[^a-zA-Z0-9]/g, '_');
      lines.push(`    subgraph ${sanitizedDir}[${dir}]`);
      for (const mod of modules as any[]) {
        const nodeId = mod.name.replace(/[^a-zA-Z0-9]/g, '_');
        lines.push(`        ${nodeId}[${mod.name}]`);
      }
      lines.push('    end');
    }

    // Add dependency arrows
    for (const [from, tos] of model.dependencies.entries()) {
      const fromId = this.getModuleId(from);
      for (const to of tos) {
        if (this.isInternalModule(to, model)) {
          const toId = this.getModuleId(to);
          lines.push(`    ${fromId} --> ${toId}`);
        }
      }
    }

    lines.push('```');
    return lines.join('\n');
  }

  /**
   * Generate README.md
   */
  async generateREADME(model: ProjectModel): Promise<string> {
    const sections: string[] = [];

    // Title and description
    sections.push(`# ${model.name}`);
    sections.push('');
    if (model.description) {
      sections.push(model.description);
      sections.push('');
    }

    // Badges
    const badges = this.generateBadges(model);
    if (badges) {
      sections.push(badges);
      sections.push('');
    }

    // Installation
    sections.push('## Installation');
    sections.push('');
    sections.push(this.generateInstallSection(model));
    sections.push('');

    // Usage
    sections.push('## Usage');
    sections.push('');
    sections.push(this.generateUsageSection(model));
    sections.push('');

    // Architecture
    sections.push('## Architecture');
    sections.push('');
    sections.push(this.generateMermaidDiagram(model));
    sections.push('');

    // API Reference (if applicable)
    const apiRef = await this.generateAPIReference(model);
    if (apiRef) {
      sections.push('## API Reference');
      sections.push('');
      sections.push(apiRef);
      sections.push('');
    }

    // Contributing
    sections.push('## Contributing');
    sections.push('');
    sections.push(this.generateContributingSection(model));
    sections.push('');

    // License
    sections.push('## License');
    sections.push('');
    sections.push('See [LICENSE](LICENSE) for details.');

    return sections.join('\n');
  }

  /**
   * Generate an onboarding guide
   */
  async generateOnboardingGuide(model: ProjectModel): Promise<string> {
    const sections: string[] = [];

    sections.push(`# Welcome to ${model.name}`);
    sections.push('');
    sections.push(`This is a ${model.languages.join('/')} project using ${model.frameworks.join(', ') || 'no specific framework'}.`);
    sections.push('');

    // Project structure
    sections.push('## Project Structure');
    sections.push('');
    sections.push(this.generateStructureExplanation(model));
    sections.push('');

    // Key components
    sections.push('## Key Components');
    sections.push('');
    sections.push(this.generateKeyComponentsExplanation(model));
    sections.push('');

    // Getting started
    sections.push('## Getting Started');
    sections.push('');
    sections.push('1. Clone the repository');
    sections.push(`2. Install dependencies: \`${this.getInstallCommand(model)}\``);
    sections.push(`3. Run the project: \`${this.getRunCommand(model)}\``);
    sections.push('');

    // Architecture overview
    sections.push('## Architecture Overview');
    sections.push('');
    sections.push(this.generateMermaidDiagram(model));
    sections.push('');

    // Common tasks
    sections.push('## Common Tasks');
    sections.push('');
    sections.push(this.generateCommonTasks(model));
    sections.push('');

    // Conventions
    if (model.conventions.length > 0) {
      sections.push('## Project Conventions');
      sections.push('');
      for (const convention of model.conventions) {
        sections.push(`- **${convention.type}**: ${convention.description}`);
      }
      sections.push('');
    }

    return sections.join('\n');
  }

  // Helper methods

  private groupModulesByDirectory(modules: any[]): Record<string, any[]> {
    const groups: Record<string, any[]> = {};

    for (const module of modules) {
      const parts = module.path.split('/');
      const dir = parts.length > 1 ? parts.slice(0, -1).join('/') : 'root';

      if (!groups[dir]) {
        groups[dir] = [];
      }
      groups[dir].push(module);
    }

    return groups;
  }

  private getModuleId(path: string): string {
    return path.replace(/[^a-zA-Z0-9]/g, '_');
  }

  private isInternalModule(importPath: string, model: ProjectModel): boolean {
    // Check if import is internal (not from node_modules, etc.)
    return importPath.startsWith('./') || importPath.startsWith('../');
  }

  private generateBadges(model: ProjectModel): string {
    const badges: string[] = [];

    // Language badges
    for (const lang of model.languages) {
      badges.push(`![${lang}](https://img.shields.io/badge/-${lang}-blue)`);
    }

    // Framework badges
    for (const fw of model.frameworks) {
      badges.push(`![${fw}](https://img.shields.io/badge/-${fw}-green)`);
    }

    return badges.join(' ');
  }

  private generateInstallSection(model: ProjectModel): string {
    return '```bash\n' + this.getInstallCommand(model) + '\n```';
  }

  private generateUsageSection(model: ProjectModel): string {
    return '```bash\n' + this.getRunCommand(model) + '\n```';
  }

  private async generateAPIReference(model: ProjectModel): Promise<string | null> {
    // Generate API docs from entry points
    return null;
  }

  private generateContributingSection(model: ProjectModel): string {
    return `1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run tests: \`${this.getTestCommand(model)}\`
5. Submit a pull request`;
  }

  private generateStructureExplanation(model: ProjectModel): string {
    const dirs = new Set<string>();
    for (const module of model.modules) {
      const parts = module.path.split('/');
      if (parts.length > 1) {
        dirs.add(parts[0]);
      }
    }

    const explanations: string[] = [];
    for (const dir of dirs) {
      explanations.push(`- \`${dir}/\` - ${this.guessDirectoryPurpose(dir)}`);
    }

    return explanations.join('\n');
  }

  private generateKeyComponentsExplanation(model: ProjectModel): string {
    const components: string[] = [];

    for (const entry of model.entryPoints.slice(0, 5)) {
      components.push(`- **${entry}** - Entry point`);
    }

    return components.join('\n');
  }

  private generateCommonTasks(model: ProjectModel): string {
    return `- **Run tests**: \`${this.getTestCommand(model)}\`
- **Build**: \`${this.getBuildCommand(model)}\`
- **Lint**: \`${this.getLintCommand(model)}\``;
  }

  private getInstallCommand(model: ProjectModel): string {
    if (model.languages.includes('TypeScript') || model.languages.includes('JavaScript')) {
      return 'npm install';
    }
    if (model.languages.includes('Python')) {
      return 'pip install -e .';
    }
    if (model.languages.includes('Rust')) {
      return 'cargo build';
    }
    return '# Install dependencies';
  }

  private getRunCommand(model: ProjectModel): string {
    if (model.languages.includes('TypeScript') || model.languages.includes('JavaScript')) {
      return 'npm start';
    }
    if (model.languages.includes('Python')) {
      return 'python -m ' + model.name;
    }
    if (model.languages.includes('Rust')) {
      return 'cargo run';
    }
    return '# Run the project';
  }

  private getTestCommand(model: ProjectModel): string {
    if (model.languages.includes('TypeScript') || model.languages.includes('JavaScript')) {
      return 'npm test';
    }
    if (model.languages.includes('Python')) {
      return 'pytest';
    }
    if (model.languages.includes('Rust')) {
      return 'cargo test';
    }
    return '# Run tests';
  }

  private getBuildCommand(model: ProjectModel): string {
    if (model.languages.includes('TypeScript') || model.languages.includes('JavaScript')) {
      return 'npm run build';
    }
    if (model.languages.includes('Rust')) {
      return 'cargo build --release';
    }
    return '# Build the project';
  }

  private getLintCommand(model: ProjectModel): string {
    if (model.languages.includes('TypeScript') || model.languages.includes('JavaScript')) {
      return 'npm run lint';
    }
    if (model.languages.includes('Python')) {
      return 'ruff check .';
    }
    if (model.languages.includes('Rust')) {
      return 'cargo clippy';
    }
    return '# Run linter';
  }

  private guessDirectoryPurpose(dir: string): string {
    const purposes: Record<string, string> = {
      src: 'Source code',
      lib: 'Library modules',
      test: 'Test files',
      tests: 'Test files',
      docs: 'Documentation',
      api: 'API endpoints',
      components: 'UI components',
      utils: 'Utility functions',
      helpers: 'Helper functions',
      models: 'Data models',
      services: 'Business logic services',
      hooks: 'React hooks',
      types: 'TypeScript types',
      config: 'Configuration files',
    };

    return purposes[dir.toLowerCase()] || 'Module directory';
  }
}

export default DocGenerator;


