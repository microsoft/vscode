/**
 * SuggestionEngine - Generates proactive suggestions from project analysis
 */

import type { Suggestion, FileChangeEvent, WorkspaceCA } from './WorkspaceCA';

export class SuggestionEngine {
  private ca: WorkspaceCA;
  private suggestions: Map<string, Suggestion> = new Map();
  private dismissedIds: Set<string> = new Set();

  constructor(ca: WorkspaceCA) {
    this.ca = ca;
  }

  /**
   * Analyze a file change and generate suggestions
   */
  async analyze(event: FileChangeEvent): Promise<Suggestion[]> {
    const newSuggestions: Suggestion[] = [];

    // Check for documentation gaps
    const docSuggestions = await this.checkDocumentationGaps(event);
    newSuggestions.push(...docSuggestions);

    // Check for test coverage
    const testSuggestions = await this.checkTestCoverage(event);
    newSuggestions.push(...testSuggestions);

    // Check for refactoring opportunities
    const refactorSuggestions = await this.checkRefactoringOpportunities(event);
    newSuggestions.push(...refactorSuggestions);

    // Check for architecture drift
    const archSuggestions = await this.checkArchitectureDrift(event);
    newSuggestions.push(...archSuggestions);

    // Filter out dismissed suggestions and add to store
    const filtered = newSuggestions.filter(
      (s) => !this.dismissedIds.has(s.id) && !this.suggestions.has(s.id)
    );

    for (const suggestion of filtered) {
      this.suggestions.set(suggestion.id, suggestion);
    }

    return filtered;
  }

  /**
   * Get all active suggestions
   */
  getAll(): Suggestion[] {
    return Array.from(this.suggestions.values());
  }

  /**
   * Dismiss a suggestion
   */
  dismiss(suggestionId: string): void {
    this.suggestions.delete(suggestionId);
    this.dismissedIds.add(suggestionId);
  }

  /**
   * Check for documentation gaps
   */
  private async checkDocumentationGaps(event: FileChangeEvent): Promise<Suggestion[]> {
    const suggestions: Suggestion[] = [];

    if (event.type === 'create' || event.type === 'change') {
      // Check if file exports public API without docs
      const isPublicAPI = this.isPublicAPI(event.path);
      if (isPublicAPI) {
        const hasDocumentation = await this.hasDocumentation(event.path);
        if (!hasDocumentation) {
          suggestions.push({
            id: `doc-gap-${event.path}`,
            type: 'documentation_gap',
            severity: 'info',
            title: 'Missing documentation',
            description: `${event.path} exports a public API without documentation. Consider adding JSDoc/docstrings.`,
            affectedFiles: [event.path],
            confidence: 0.8,
          });
        }
      }
    }

    return suggestions;
  }

  /**
   * Check for test coverage issues
   */
  private async checkTestCoverage(event: FileChangeEvent): Promise<Suggestion[]> {
    const suggestions: Suggestion[] = [];

    if (event.type === 'create' || event.type === 'change') {
      // Check if source file has corresponding test
      if (this.isSourceFile(event.path) && !this.isTestFile(event.path)) {
        const hasTests = await this.hasCorrespondingTests(event.path);
        if (!hasTests) {
          suggestions.push({
            id: `test-coverage-${event.path}`,
            type: 'test_coverage',
            severity: 'warning',
            title: 'Missing tests',
            description: `${event.path} has no corresponding test file. Consider adding tests.`,
            affectedFiles: [event.path],
            confidence: 0.7,
          });
        }
      }
    }

    return suggestions;
  }

  /**
   * Check for refactoring opportunities
   */
  private async checkRefactoringOpportunities(event: FileChangeEvent): Promise<Suggestion[]> {
    const suggestions: Suggestion[] = [];

    if (event.type === 'change') {
      // Check for duplicate code
      const duplicates = await this.findDuplicateCode(event.path);
      for (const dup of duplicates) {
        suggestions.push({
          id: `refactor-dup-${event.path}-${dup.otherFile}`,
          type: 'refactoring_opportunity',
          severity: 'info',
          title: 'Duplicate code detected',
          description: `Similar code found in ${event.path} and ${dup.otherFile}. Consider extracting to a shared module.`,
          affectedFiles: [event.path, dup.otherFile],
          confidence: dup.similarity,
        });
      }

      // Check for complex functions
      const complexFunctions = await this.findComplexFunctions(event.path);
      for (const fn of complexFunctions) {
        suggestions.push({
          id: `refactor-complex-${event.path}-${fn.name}`,
          type: 'refactoring_opportunity',
          severity: 'info',
          title: 'High complexity function',
          description: `Function ${fn.name} in ${event.path} has high cyclomatic complexity (${fn.complexity}). Consider breaking it down.`,
          affectedFiles: [event.path],
          confidence: 0.75,
        });
      }
    }

    return suggestions;
  }

  /**
   * Check for architecture drift
   */
  private async checkArchitectureDrift(event: FileChangeEvent): Promise<Suggestion[]> {
    const suggestions: Suggestion[] = [];
    const projectModel = this.ca.getProjectModel();

    if (!projectModel) return suggestions;

    if (event.type === 'create' || event.type === 'change') {
      // Check if file follows project conventions
      for (const convention of projectModel.conventions) {
        const violates = await this.violatesConvention(event.path, convention);
        if (violates) {
          suggestions.push({
            id: `arch-drift-${event.path}-${convention.id}`,
            type: 'architecture_drift',
            severity: 'warning',
            title: `Convention violation: ${convention.type}`,
            description: `${event.path} violates project convention: ${convention.description}`,
            affectedFiles: [event.path],
            confidence: 0.7,
          });
        }
      }
    }

    return suggestions;
  }

  // Helper methods

  private isPublicAPI(path: string): boolean {
    // Check if file exports public symbols
    return path.includes('/api/') || path.includes('/lib/') || path.endsWith('index.ts');
  }

  private async hasDocumentation(path: string): Promise<boolean> {
    // Check for JSDoc/docstrings
    return false;
  }

  private isSourceFile(path: string): boolean {
    return /\.(ts|tsx|js|jsx|py|rs|go)$/.test(path);
  }

  private isTestFile(path: string): boolean {
    return /\.(test|spec)\.[jt]sx?$/.test(path) || path.includes('__tests__') || path.includes('test_');
  }

  private async hasCorrespondingTests(path: string): Promise<boolean> {
    // Look for test file
    return false;
  }

  private async findDuplicateCode(path: string): Promise<Array<{ otherFile: string; similarity: number }>> {
    // Use LSH or AST comparison to find duplicates
    return [];
  }

  private async findComplexFunctions(path: string): Promise<Array<{ name: string; complexity: number }>> {
    // Calculate cyclomatic complexity
    return [];
  }

  private async violatesConvention(path: string, convention: { id: string; type: string }): Promise<boolean> {
    // Check convention rules
    return false;
  }
}

export default SuggestionEngine;

