import * as vscode from 'vscode';
import type { SessionManager } from './sessionManager';
import type { OutputDetector } from './outputDetector';
import type { WorkflowPlan, PlanTask, OrchestratorState } from './types';
import { WORKFLOW_TEMPLATES, getWorkflowTemplate } from './workflows';
import { sendToSession } from './messageRouter';

const ORCHESTRATOR_SYSTEM_PROMPT = `You are the Main Orchestrator agent in Autothropic IDE. The user will describe features, bugs, or goals they want to accomplish.

Your job:
1. Understand the user's request fully — ask clarifying questions if needed
2. Propose a plan with clear task breakdown and suggest a workflow type
3. When the user confirms, output a deployment plan as a fenced JSON block

When outputting a deployment plan, use EXACTLY this format (fenced json block with these exact keys):
- workflowId: one of feature-dev, production-pipeline, quick-fix, full-team
- tasks: array of objects each with title, description, and assignTo (role name)

Available roles: developer, tester, bug-finder, reviewer, architect

Workflow types:
- feature-dev: Developer then Tester with review loop (2 retries). Best for single features.
- production-pipeline: Developer then Tester then Bug Finder then Reviewer (human approves). Best for production code.
- quick-fix: Single developer only. Best for small fixes.
- full-team: Architect then Developer then Tester then Bug Finder then Reviewer. Best for large features.

Guidelines:
- For simple bug fixes, suggest quick-fix
- For normal features, suggest feature-dev
- For production-critical work, suggest production-pipeline
- For complex multi-component features, suggest full-team
- Each task flows through the pipeline automatically
- When the user says go, do it, confirmed, yes, or deploy — output the fenced JSON deployment plan
- You can suggest improvements to the plan before the user confirms
- Keep tasks focused — 1 to 4 tasks is ideal, max 6
- IMPORTANT: Only output the fenced JSON plan AFTER the user has described their goal AND confirmed they want to proceed`;

/** Regex to detect WORKFLOW_PLAN JSON blocks in orchestrator output. */
const PLAN_REGEX = /```json\s*\n?\s*(\{[\s\S]*?"workflowId"[\s\S]*?\})\s*\n?\s*```/;

/** Patterns that indicate an agent needs human input. */
const HUMAN_INPUT_PATTERNS = [
  /HUMAN_INPUT_NEEDED/i,
  /\bwaiting for (?:your |human )?(?:input|decision|response|answer)\b/i,
  /\bI need your (?:input|decision|help|guidance)\b/i,
  /\bplease (?:choose|decide|tell me|let me know|confirm)\b/i,
  /\bwhich (?:option|approach|method|way) (?:should|do you|would you)\b/i,
];

export class OrchestratorAgent {
  private orchestratorSessionId: string | undefined;
  private activePlan: WorkflowPlan | undefined;
  private workerSessionIds: string[] = [];
  private taskQueue: PlanTask[] = [];
  private currentTaskIndex = 0;
  private currentStage = 'idle';
  private disposables: vscode.Disposable[] = [];
  /** Completion count for orchestrator — skip first few (startup noise). */
  private orchestratorCompletionCount = 0;

  private readonly _onPlanDetected = new vscode.EventEmitter<{ plan: WorkflowPlan; summary: string }>();
  readonly onPlanDetected = this._onPlanDetected.event;

  private readonly _onHumanInputNeeded = new vscode.EventEmitter<{ sessionId: string; summary: string }>();
  readonly onHumanInputNeeded = this._onHumanInputNeeded.event;

  private readonly _onStateChanged = new vscode.EventEmitter<void>();
  readonly onStateChanged = this._onStateChanged.event;

  constructor(
    private readonly sessionManager: SessionManager,
    private readonly outputDetector: OutputDetector,
  ) {}

  /**
   * Spawn the Main Orchestrator agent if it doesn't already exist.
   * Returns the session ID.
   */
  ensureOrchestrator(): string {
    // Check if orchestrator already exists
    if (this.orchestratorSessionId) {
      const existing = this.sessionManager.getSession(this.orchestratorSessionId);
      if (existing && existing.status !== 'exited') {
        return this.orchestratorSessionId;
      }
    }

    // Check if any session is already marked as orchestrator
    for (const s of this.sessionManager.getSessions()) {
      if (s.isOrchestrator) {
        this.orchestratorSessionId = s.id;
        return s.id;
      }
    }

    // Create the orchestrator session
    const session = this.sessionManager.createSession(
      'Main Agent',
      ORCHESTRATOR_SYSTEM_PROMPT,
      { showTerminal: false },
    );
    session.isOrchestrator = true;
    session.color = '#9d4edd'; // Purple for orchestrator
    this.orchestratorSessionId = session.id;
    this.sessionManager.setSessionColor(session.id, '#9d4edd');
    this._onStateChanged.fire();
    return session.id;
  }

  getOrchestratorSessionId(): string | undefined {
    return this.orchestratorSessionId;
  }

  /**
   * Start listening for orchestrator output to detect plans and input needs.
   */
  start(): void {
    this.disposables.push(
      this.outputDetector.onCompletion((event) => {
        this.handleOutput(event.sessionId, event.response);
      })
    );
  }

  /**
   * Scan output from any session for plan blocks or human input requests.
   */
  private handleOutput(sessionId: string, response: string): void {
    // Check orchestrator output for WORKFLOW_PLAN
    if (sessionId === this.orchestratorSessionId) {
      this.orchestratorCompletionCount++;
      // Skip first 2 completions — startup noise (system prompt echo, initial greeting)
      if (this.orchestratorCompletionCount > 2) {
        const planMatch = PLAN_REGEX.exec(response);
        if (planMatch) {
          try {
            const plan = JSON.parse(planMatch[1]) as WorkflowPlan;
            // Strict validation: must have valid workflowId AND meaningful tasks
            const validWorkflow = getWorkflowTemplate(plan.workflowId);
            const hasMeaningfulTasks = Array.isArray(plan.tasks) &&
              plan.tasks.length > 0 &&
              plan.tasks.every(t =>
                t.title && t.title.length > 3 &&
                t.description && t.description.length > 10 &&
                t.assignTo
              );
            if (validWorkflow && hasMeaningfulTasks) {
              const summary = `${validWorkflow.label} with ${plan.tasks.length} task(s): ${plan.tasks.map(t => t.title).join(', ')}`;
              this._onPlanDetected.fire({ plan, summary });
            }
          } catch {
            // Invalid JSON — ignore
          }
        }
      }
    }

    // Check all sessions for human input requests
    const session = this.sessionManager.getSession(sessionId);
    if (session && !session.isOrchestrator) {
      for (const pattern of HUMAN_INPUT_PATTERNS) {
        if (pattern.test(response)) {
          const lines = response.split('\n').filter(l => l.trim().length > 0);
          const summary = lines.slice(-3).join(' ').slice(0, 200);
          session.needsInput = true;
          this._onHumanInputNeeded.fire({ sessionId, summary });
          this._onStateChanged.fire();
          break;
        }
      }
    }
  }

  /**
   * Execute a confirmed workflow plan: spawn workers, wire edges, dispatch tasks.
   */
  async executePlan(plan: WorkflowPlan): Promise<void> {
    const workflow = getWorkflowTemplate(plan.workflowId);
    if (!workflow) {
      vscode.window.showErrorMessage(`Unknown workflow: ${plan.workflowId}`);
      return;
    }

    this.activePlan = plan;
    this.taskQueue = [...plan.tasks];
    this.currentTaskIndex = 0;
    this.currentStage = 'deploying';
    this._onStateChanged.fire();

    // Spawn worker sessions from workflow template
    this.workerSessionIds = [];
    const baseX = 200;
    const baseY = 350; // Below the orchestrator

    for (const node of workflow.nodes) {
      const session = this.sessionManager.createSession(
        node.name,
        node.systemPrompt,
        { showTerminal: false },
      );
      session.graphPosition = {
        x: baseX + node.relativePos.x,
        y: baseY + node.relativePos.y,
      };
      if (node.humanInLoop) {
        this.sessionManager.setSessionHITL(session.id, true);
      }
      this.workerSessionIds.push(session.id);
    }

    // Wire edges between workers
    for (const edge of workflow.edges) {
      const fromId = this.workerSessionIds[edge.from];
      const toId = this.workerSessionIds[edge.to];
      if (fromId && toId) {
        this.sessionManager.addEdge(fromId, toId, edge.condition, edge.maxIterations ?? 0);
      }
    }

    // Wire last worker back to orchestrator so results flow back
    if (this.workerSessionIds.length > 0 && this.orchestratorSessionId) {
      const lastWorkerId = this.workerSessionIds[this.workerSessionIds.length - 1];
      this.sessionManager.addEdge(lastWorkerId, this.orchestratorSessionId, 'summary-only');
    }

    // Dispatch first task
    this.currentStage = 'working';
    this._onStateChanged.fire();
    this.dispatchNextTask();

    vscode.window.showInformationMessage(
      `Deployed ${workflow.label}: ${workflow.nodes.length} agent(s), ${plan.tasks.length} task(s)`
    );
  }

  /**
   * Send the next task in the queue to the first worker in the pipeline.
   */
  private dispatchNextTask(): void {
    if (this.currentTaskIndex >= this.taskQueue.length) {
      this.currentStage = 'done';
      this._onStateChanged.fire();
      vscode.window.showInformationMessage('All tasks completed!');
      return;
    }

    const task = this.taskQueue[this.currentTaskIndex];
    const firstWorkerId = this.workerSessionIds[0];
    if (!firstWorkerId) { return; }

    const message = `[Task ${this.currentTaskIndex + 1}/${this.taskQueue.length}] ${task.title}\n\n${task.description}`;

    // Wait a moment for agents to be ready, then send
    setTimeout(() => {
      sendToSession(this.sessionManager, firstWorkerId, message);
      this.sessionManager.setSessionStatus(firstWorkerId, 'running');
      this.currentStage = this.getStageFromRole(task.assignTo);
      this._onStateChanged.fire();
    }, 3000);
  }

  /**
   * Called when the last worker in the pipeline completes.
   * Advances to the next task or marks the plan as done.
   */
  handlePipelineCompletion(): void {
    if (!this.activePlan) { return; }

    this.currentTaskIndex++;
    if (this.currentTaskIndex >= this.taskQueue.length) {
      this.currentStage = 'done';
      this._onStateChanged.fire();
      return;
    }

    // Short delay between tasks
    setTimeout(() => {
      this.dispatchNextTask();
    }, 2000);
  }

  /**
   * Clear human input needed flag for a session.
   */
  clearInputNeeded(sessionId: string): void {
    const session = this.sessionManager.getSession(sessionId);
    if (session) {
      session.needsInput = false;
      this._onStateChanged.fire();
    }
  }

  /**
   * Send human input to a session that requested it.
   */
  sendInput(sessionId: string, input: string): void {
    this.clearInputNeeded(sessionId);
    sendToSession(this.sessionManager, sessionId, input);
    this.sessionManager.setSessionStatus(sessionId, 'running');
  }

  /**
   * Get current orchestrator state for the graph UI.
   */
  getState(): OrchestratorState {
    const pendingInputCount = this.sessionManager.getSessions()
      .filter(s => s.needsInput).length;

    return {
      planActive: !!this.activePlan,
      workflowId: this.activePlan?.workflowId,
      currentTaskIndex: this.currentTaskIndex,
      totalTasks: this.taskQueue.length,
      currentStage: this.currentStage,
      pendingInputCount,
      tasks: this.taskQueue,
    };
  }

  /**
   * Get available workflow templates for the UI.
   */
  getWorkflowTemplates(): { id: string; label: string; description: string }[] {
    return WORKFLOW_TEMPLATES.map(w => ({
      id: w.id,
      label: w.label,
      description: w.description,
    }));
  }

  /**
   * Check if a session is a worker in the active pipeline.
   */
  isWorkerSession(sessionId: string): boolean {
    return this.workerSessionIds.includes(sessionId);
  }

  /**
   * Check if a session is the last worker (pipeline end).
   */
  isLastWorker(sessionId: string): boolean {
    return this.workerSessionIds.length > 0 &&
      this.workerSessionIds[this.workerSessionIds.length - 1] === sessionId;
  }

  private getStageFromRole(role: string): string {
    switch (role) {
      case 'architect': return 'designing';
      case 'developer': return 'developing';
      case 'tester': return 'testing';
      case 'bug-finder': return 'analyzing';
      case 'reviewer': return 'reviewing';
      default: return 'working';
    }
  }

  dispose(): void {
    this._onPlanDetected.dispose();
    this._onHumanInputNeeded.dispose();
    this._onStateChanged.dispose();
    for (const d of this.disposables) { d.dispose(); }
  }
}
