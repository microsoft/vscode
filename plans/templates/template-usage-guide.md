# Plan Template Usage Guide

## Template Selection

### Feature Implementation Template
**Use when**: Adding new functionality, endpoints, services, or modules
**File**: `feature-implementation-template.md`
**Size**: Medium to large scope changes

### Bug Fix Template  
**Use when**: Fixing specific issues, errors, or broken functionality
**File**: `bug-fix-template.md`
**Size**: Small to medium scope changes

### Refactoring Template
**Use when**: Improving code structure, performance, or maintainability without changing functionality
**File**: `refactor-template.md` 
**Size**: Medium to large scope changes

## Context Management Best Practices

### Keep Plans Focused
- **Executive Summary**: Max 3 sentences
- **Context Links**: Reference files, don't include full content
- **Tasks**: Max 10 per phase
- **Context Tokens**: Target <200 words for summaries

### Template Adaptation
1. Copy the appropriate template to `plans/YYMMDD-feature-name-plan.md`
2. Replace bracketed placeholders with actual content
3. Remove sections not relevant to your specific use case
4. Keep the core structure intact for consistency

### Cross-References Instead of Duplication
- Link to existing documentation in `./docs/`
- Reference other plans without copying content
- Use file paths instead of code blocks where possible
- Focus on "what" and "why", not detailed "how"

## Quality Checklist

Before finalizing any plan:
- [ ] Executive summary is clear and concise
- [ ] Tasks are specific and actionable
- [ ] File paths are included for implementation tasks
- [ ] Success criteria are measurable
- [ ] Context links are used instead of full content
- [ ] TODO checklist is complete and realistic

## Context Refresh Triggers

Use these templates when:
- Starting a new development phase
- Switching between different types of work (feature → bugfix)
- After major context accumulation (>8000 tokens)
- When agent handoffs occur

This ensures each plan starts with fresh, focused context optimized for the specific task type.