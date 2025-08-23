import { VariablesResult } from 'vscode';

export class VariableResultCache {
    private cache = new Map<string, VariablesResult[]>();

    private executionCount = 0;

    getResults(executionCount: number, cacheKey: string): VariablesResult[] | undefined {
        if (this.executionCount !== executionCount) {
            this.cache.clear();
            this.executionCount = executionCount;
        }

        return this.cache.get(cacheKey);
    }

    setResults(executionCount: number, cacheKey: string, results: VariablesResult[]): void {
        if (this.executionCount < executionCount) {
            this.cache.clear();
            this.executionCount = executionCount;
        } else if (this.executionCount > executionCount) {
            // old results, don't cache
            return;
        }

        this.cache.set(cacheKey, results);
    }
}
