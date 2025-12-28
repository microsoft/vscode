/**
 * Setup verification test
 * Ensures Vitest is configured correctly
 */

import { describe, it, expect } from 'vitest';

describe('Vitest Setup', () => {
    it('should run tests correctly', () => {
        expect(true).toBe(true);
    });

    it('should have access to globals', () => {
        expect(typeof describe).toBe('function');
        expect(typeof it).toBe('function');
        expect(typeof expect).toBe('function');
    });
});
