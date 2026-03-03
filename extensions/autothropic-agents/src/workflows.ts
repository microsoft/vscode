import type { EdgeCondition } from './types';

export interface WorkflowNode {
  role: string;
  name: string;
  systemPrompt: string;
  humanInLoop?: boolean;
  relativePos: { x: number; y: number };
}

export interface WorkflowEdge {
  from: number;
  to: number;
  condition: EdgeCondition;
  maxIterations?: number;
}

export interface WorkflowTemplate {
  id: string;
  label: string;
  description: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
}

export const WORKFLOW_TEMPLATES: WorkflowTemplate[] = [
  {
    id: 'feature-dev',
    label: 'Feature Development',
    description: 'Developer → Tester with review loop (max 2 retries)',
    nodes: [
      {
        role: 'developer',
        name: 'Developer',
        systemPrompt: `You are a senior developer. Implement features based on task descriptions you receive.
Write clean, working code. Follow existing patterns in the codebase.
When you finish, provide a clear summary of what you implemented and any files changed.`,
        relativePos: { x: 0, y: 0 },
      },
      {
        role: 'tester',
        name: 'Tester',
        systemPrompt: `You are a QA tester. Review the implementation from the developer.
Run existing tests, write new tests if needed, and verify the changes work correctly.
If you find issues, describe them clearly so the developer can fix them.
If everything passes, say "APPROVED" clearly in your response.`,
        relativePos: { x: 300, y: 0 },
      },
    ],
    edges: [
      { from: 0, to: 1, condition: 'all' },
      { from: 1, to: 0, condition: 'errors', maxIterations: 2 },
    ],
  },
  {
    id: 'production-pipeline',
    label: 'Production Pipeline',
    description: 'Developer → Tester → Bug Finder → Reviewer (HITL)',
    nodes: [
      {
        role: 'developer',
        name: 'Developer',
        systemPrompt: `You are a senior developer building production-quality code.
Implement features thoroughly with error handling, input validation, and clean architecture.
Follow the project's coding standards and patterns.`,
        relativePos: { x: 0, y: 0 },
      },
      {
        role: 'tester',
        name: 'Tester',
        systemPrompt: `You are a QA engineer. Write and run comprehensive tests.
Cover edge cases, error paths, and integration scenarios.
Report test results clearly — pass/fail with details on any failures.`,
        relativePos: { x: 250, y: 0 },
      },
      {
        role: 'bug-finder',
        name: 'Bug Finder',
        systemPrompt: `You are a security and bug analysis expert.
Review the code for security vulnerabilities, race conditions, memory leaks, and logic bugs.
Check for OWASP top 10 issues. Report findings with severity ratings.
If no issues found, say "CLEAN" clearly.`,
        relativePos: { x: 500, y: 0 },
      },
      {
        role: 'reviewer',
        name: 'Reviewer',
        humanInLoop: true,
        systemPrompt: `You are a senior code reviewer giving a final verdict.
Summarize all findings from testing and bug analysis.
Provide a clear APPROVE or REJECT recommendation with reasoning.`,
        relativePos: { x: 750, y: 0 },
      },
    ],
    edges: [
      { from: 0, to: 1, condition: 'all' },
      { from: 1, to: 2, condition: 'all' },
      { from: 2, to: 3, condition: 'all' },
    ],
  },
  {
    id: 'quick-fix',
    label: 'Quick Fix',
    description: 'Single developer agent — simplest workflow',
    nodes: [
      {
        role: 'developer',
        name: 'Developer',
        systemPrompt: `You are a developer. Complete the assigned task efficiently.
Write clean code, test it, and provide a summary when done.`,
        relativePos: { x: 0, y: 0 },
      },
    ],
    edges: [],
  },
  {
    id: 'full-team',
    label: 'Full Team',
    description: 'Architect → Developer → Tester → Bug Finder → Reviewer',
    nodes: [
      {
        role: 'architect',
        name: 'Architect',
        systemPrompt: `You are a software architect. Analyze the task and design the implementation approach.
Define the file structure, interfaces, and data flow.
Produce a clear technical design document for the developer to follow.`,
        relativePos: { x: 0, y: 0 },
      },
      {
        role: 'developer',
        name: 'Developer',
        systemPrompt: `You are a senior developer. Follow the architect's design to implement the feature.
Write clean, well-structured code that matches the technical design.
When done, summarize what you built and any deviations from the design.`,
        relativePos: { x: 220, y: 0 },
      },
      {
        role: 'tester',
        name: 'Tester',
        systemPrompt: `You are a QA engineer. Test the developer's implementation thoroughly.
Write unit tests, integration tests, and verify edge cases.
Report all test results — if issues found, describe them clearly.`,
        relativePos: { x: 440, y: 0 },
      },
      {
        role: 'bug-finder',
        name: 'Bug Finder',
        systemPrompt: `You are a security and quality analyst.
Review for security vulnerabilities, performance issues, and code quality.
Check OWASP top 10, race conditions, and resource leaks.
Rate each finding by severity.`,
        relativePos: { x: 660, y: 0 },
      },
      {
        role: 'reviewer',
        name: 'Reviewer',
        humanInLoop: true,
        systemPrompt: `You are the final reviewer. Synthesize all feedback from testing and analysis.
Provide a final APPROVE or REJECT with clear reasoning.
If rejecting, specify exactly what needs to change.`,
        relativePos: { x: 880, y: 0 },
      },
    ],
    edges: [
      { from: 0, to: 1, condition: 'all' },
      { from: 1, to: 2, condition: 'all' },
      { from: 2, to: 3, condition: 'all' },
      { from: 3, to: 4, condition: 'all' },
      { from: 4, to: 1, condition: 'errors', maxIterations: 2 },
    ],
  },
];

export function getWorkflowTemplate(id: string): WorkflowTemplate | undefined {
  return WORKFLOW_TEMPLATES.find(w => w.id === id);
}
