import * as vscode from 'vscode';
import * as cp from 'child_process';
import * as path from 'path';
import type { SessionManager } from './sessionManager';
import type { Goal, AgentTask } from './types';
import { sendToSession } from './messageRouter';

const PLANNER_SYSTEM_PROMPT = `You are a task planner for a coding project. Given a goal, break it into 2-6 independent sub-tasks.
Each task should be completable by a single Claude Code agent working in an isolated git worktree.
Return ONLY a valid JSON array with no other text: [{"title": "short-kebab-title", "description": "Detailed description of what to implement", "dependencies": []}]
Rules:
- "title" must be a short kebab-case identifier (e.g. "add-auth-middleware", "write-tests")
- "description" should be detailed enough for an agent to implement without further context
- "dependencies" is an array of other task titles from this list that must complete first
- Keep tasks focused and independent where possible
- Maximum 6 tasks`;

function generateId(): string {
  return `goal-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function sanitizeBranchName(name: string): string {
  return name.replace(/[^a-zA-Z0-9\-_]/g, '-').replace(/-+/g, '-').slice(0, 40);
}

export class GoalManager {
  private goals = new Map<string, Goal>();
  private readonly _onGoalChanged = new vscode.EventEmitter<void>();
  readonly onGoalChanged = this._onGoalChanged.event;

  constructor(
    private readonly sessionManager: SessionManager,
    private readonly context: vscode.ExtensionContext,
  ) {
    this.loadState();
  }

  getActiveGoal(): Goal | undefined {
    for (const goal of this.goals.values()) {
      if (goal.status === 'planning' || goal.status === 'running') {
        return goal;
      }
    }
    return undefined;
  }

  getGoal(id: string): Goal | undefined {
    return this.goals.get(id);
  }

  getGoalState(): Goal | null {
    return this.getActiveGoal() ?? null;
  }

  /**
   * Start a new goal: plan tasks via `claude -p`, then spawn agents.
   */
  async startGoal(prompt: string): Promise<Goal> {
    // Only one goal at a time
    const existing = this.getActiveGoal();
    if (existing) {
      vscode.window.showWarningMessage('A goal is already active. Cancel it first.');
      return existing;
    }

    const goalId = generateId();
    const goal: Goal = {
      id: goalId,
      prompt,
      tasks: [],
      status: 'planning',
      createdAt: Date.now(),
    };
    this.goals.set(goalId, goal);
    this.saveState();
    this._onGoalChanged.fire();

    try {
      const tasks = await this.planTasks(goalId, prompt);
      goal.tasks = tasks;
      goal.status = 'running';
      this.saveState();
      this._onGoalChanged.fire();

      await this.spawnReadyTasks(goalId);
    } catch (err: any) {
      // Remove the failed goal so UI clears
      this.goals.delete(goalId);
      this.saveState();
      this._onGoalChanged.fire();
      vscode.window.showErrorMessage(`Goal planning failed: ${err.message}`);
    }

    return goal;
  }

  /**
   * Run `claude -p` to decompose the goal into tasks.
   */
  private async planTasks(goalId: string, prompt: string): Promise<AgentTask[]> {
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspaceRoot) {
      throw new Error('No workspace folder open');
    }

    const fullPrompt = `Goal: ${prompt}\n\nAnalyze the codebase and break this goal into concrete sub-tasks.`;

    return new Promise<AgentTask[]>((resolve, reject) => {
      const args = [
        '-p', fullPrompt,
        '--append-system-prompt', PLANNER_SYSTEM_PROMPT,
        '--output-format', 'json',
      ];

      const env = { ...process.env };
      delete env.CLAUDECODE;
      delete env.CLAUDE_CODE_ENTRYPOINT;

      const proc = cp.spawn('claude', args, {
        cwd: workspaceRoot,
        shell: true,
        env,
      });

      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (data: Buffer) => { stdout += data.toString(); });
      proc.stderr.on('data', (data: Buffer) => { stderr += data.toString(); });

      proc.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`claude exited with code ${code}: ${stderr}`));
          return;
        }

        try {
          const parsed = this.parseTasksFromOutput(stdout, goalId);
          resolve(parsed);
        } catch (e: any) {
          reject(new Error(`Failed to parse planner output: ${e.message}\nOutput: ${stdout.slice(0, 500)}`));
        }
      });

      proc.on('error', (err) => {
        reject(new Error(`Failed to run claude: ${err.message}`));
      });

      // Timeout after 120s
      setTimeout(() => {
        proc.kill();
        reject(new Error('Planner timed out after 120s'));
      }, 120_000);
    });
  }

  private parseTasksFromOutput(output: string, goalId: string): AgentTask[] {
    // The output might be wrapped in a JSON object with a "result" field
    // or it might be raw JSON array. Try both.
    let parsed: any;

    try {
      parsed = JSON.parse(output);
    } catch {
      // Try to extract JSON array from the output
      const match = output.match(/\[[\s\S]*\]/);
      if (match) {
        parsed = JSON.parse(match[0]);
      } else {
        throw new Error('No JSON array found in output');
      }
    }

    // If it's a wrapped response (e.g. { result: [...] })
    if (parsed && !Array.isArray(parsed)) {
      if (parsed.result && Array.isArray(parsed.result)) {
        parsed = parsed.result;
      } else {
        // Try to find an array property
        for (const key of Object.keys(parsed)) {
          if (Array.isArray(parsed[key])) {
            parsed = parsed[key];
            break;
          }
        }
      }
    }

    if (!Array.isArray(parsed)) {
      throw new Error('Output is not an array');
    }

    // Build a title→id map for dependency resolution
    const titleToId = new Map<string, string>();
    const tasks: AgentTask[] = [];

    for (const item of parsed) {
      const id = `task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      titleToId.set(item.title, id);
      tasks.push({
        id,
        goalId,
        title: item.title || 'untitled',
        description: item.description || '',
        status: 'pending',
        createdAt: Date.now(),
        dependencies: [], // resolved below
      });
    }

    // Resolve dependencies by title
    for (let i = 0; i < parsed.length; i++) {
      const deps = parsed[i].dependencies || [];
      tasks[i].dependencies = deps
        .map((dep: string) => titleToId.get(dep))
        .filter(Boolean) as string[];
    }

    return tasks;
  }

  /**
   * Spawn agents for all tasks that have no unmet dependencies.
   */
  private async spawnReadyTasks(goalId: string): Promise<void> {
    const goal = this.goals.get(goalId);
    if (!goal || goal.status !== 'running') { return; }

    const doneTasks = new Set(
      goal.tasks.filter(t => t.status === 'done' || t.status === 'merged').map(t => t.id)
    );

    for (const task of goal.tasks) {
      if (task.status !== 'pending') { continue; }

      // Check if all dependencies are met
      const depsReady = task.dependencies.every(depId => doneTasks.has(depId));
      if (!depsReady) { continue; }

      await this.spawnTaskAgent(goal, task);
    }
  }

  private async spawnTaskAgent(goal: Goal, task: AgentTask): Promise<void> {
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspaceRoot) { return; }

    const branchName = `goal/${sanitizeBranchName(goal.id.slice(5, 15))}/${sanitizeBranchName(task.title)}`;
    const worktreePath = path.join(workspaceRoot, '.claude', 'worktrees', sanitizeBranchName(task.title));

    // Create git worktree
    try {
      await this.execGit(workspaceRoot, ['worktree', 'add', worktreePath, '-b', branchName]);
      task.worktreeBranch = branchName;
      task.worktreePath = worktreePath;
    } catch (err: any) {
      // Worktree might already exist or branch exists — try without -b
      try {
        await this.execGit(workspaceRoot, ['worktree', 'add', worktreePath]);
        task.worktreePath = worktreePath;
      } catch {
        // Fall back to working in main workspace
        vscode.window.showWarningMessage(`Worktree creation failed for "${task.title}", using main workspace`);
      }
    }

    const taskPrompt = `You are working on a specific task as part of a larger goal.

GOAL: ${goal.prompt}

YOUR TASK: ${task.title}
${task.description}

Complete this task thoroughly. When done, provide a clear summary of what you implemented.`;

    const cwd = task.worktreePath || undefined;
    const session = this.sessionManager.createSession(
      task.title,
      taskPrompt,
      { showTerminal: false, cwd },
    );

    // Link session to goal/task
    session.goalId = goal.id;
    session.taskId = task.id;
    task.assignedTo = session.id;
    task.status = 'assigned';

    this.saveState();
    this._onGoalChanged.fire();

    // Send the task description as initial user message after Claude starts
    setTimeout(() => {
      sendToSession(this.sessionManager, session.id, task.description);
      this.sessionManager.setSessionStatus(session.id, 'running');
    }, 5000);
  }

  /**
   * Called by OrchestrationEngine when a goal-linked agent completes.
   */
  handleTaskCompletion(sessionId: string, response: string): void {
    for (const goal of this.goals.values()) {
      const task = goal.tasks.find(t => t.assignedTo === sessionId);
      if (!task) { continue; }

      task.status = 'done';
      task.completedAt = Date.now();
      task.result = response.slice(0, 2000); // cap stored result

      this.saveState();
      this._onGoalChanged.fire();

      // Check if all tasks done
      const allDone = goal.tasks.every(t => t.status === 'done' || t.status === 'merged');
      if (allDone) {
        goal.status = 'done';
        goal.completedAt = Date.now();
        this.saveState();
        this._onGoalChanged.fire();
        vscode.window.showInformationMessage(
          `Goal complete! All ${goal.tasks.length} tasks finished.`,
          'Merge All',
        ).then(choice => {
          if (choice === 'Merge All') {
            this.mergeAll(goal.id);
          }
        });
        return;
      }

      // Spawn newly unblocked tasks
      this.spawnReadyTasks(goal.id);
      return;
    }
  }

  /**
   * Handle a goal-linked agent reporting its task is running.
   */
  handleTaskRunning(sessionId: string): void {
    for (const goal of this.goals.values()) {
      const task = goal.tasks.find(t => t.assignedTo === sessionId);
      if (task && task.status === 'assigned') {
        task.status = 'running';
        this.saveState();
        this._onGoalChanged.fire();
        return;
      }
    }
  }

  /**
   * Merge a single completed task's branch into main.
   */
  async mergeTask(taskId: string): Promise<void> {
    const { goal, task } = this.findTask(taskId);
    if (!goal || !task) { return; }
    if (task.status !== 'done') {
      vscode.window.showWarningMessage(`Task "${task.title}" is not done yet`);
      return;
    }

    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspaceRoot || !task.worktreeBranch) { return; }

    try {
      await this.execGit(workspaceRoot, ['merge', '--no-ff', task.worktreeBranch, '-m', `Merge: ${task.title}`]);
      if (task.worktreePath) {
        await this.execGit(workspaceRoot, ['worktree', 'remove', task.worktreePath, '--force']);
      }
      await this.execGit(workspaceRoot, ['branch', '-d', task.worktreeBranch]);
      task.status = 'merged';
      this.saveState();
      this._onGoalChanged.fire();
      vscode.window.showInformationMessage(`Merged: ${task.title}`);
    } catch (err: any) {
      vscode.window.showErrorMessage(`Merge failed for "${task.title}": ${err.message}`);
    }
  }

  /**
   * Merge all completed tasks.
   */
  async mergeAll(goalId: string): Promise<void> {
    const goal = this.goals.get(goalId);
    if (!goal) { return; }

    const doneTasks = goal.tasks.filter(t => t.status === 'done');
    for (const task of doneTasks) {
      await this.mergeTask(task.id);
    }
  }

  /**
   * Cancel an active goal: remove agents, clean up worktrees.
   */
  async cancelGoal(goalId: string): Promise<void> {
    const goal = this.goals.get(goalId);
    if (!goal) { return; }

    // Remove all sessions linked to this goal
    for (const task of goal.tasks) {
      if (task.assignedTo) {
        this.sessionManager.removeSession(task.assignedTo);
      }
    }

    // Clean up worktrees
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (workspaceRoot) {
      for (const task of goal.tasks) {
        if (task.worktreePath) {
          try {
            await this.execGit(workspaceRoot, ['worktree', 'remove', task.worktreePath, '--force']);
          } catch { /* ignore cleanup errors */ }
        }
        if (task.worktreeBranch) {
          try {
            await this.execGit(workspaceRoot, ['branch', '-D', task.worktreeBranch]);
          } catch { /* ignore */ }
        }
      }
    }

    goal.status = 'failed';
    goal.completedAt = Date.now();
    this.saveState();
    this._onGoalChanged.fire();
    vscode.window.showInformationMessage('Goal cancelled');
  }

  private findTask(taskId: string): { goal?: Goal; task?: AgentTask } {
    for (const goal of this.goals.values()) {
      const task = goal.tasks.find(t => t.id === taskId);
      if (task) { return { goal, task }; }
    }
    return {};
  }

  private execGit(cwd: string, args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
      cp.execFile('git', args, { cwd }, (err, stdout, stderr) => {
        if (err) { reject(new Error(stderr || err.message)); }
        else { resolve(stdout.trim()); }
      });
    });
  }

  // --- Persistence ---

  private saveState(): void {
    const serialized: Goal[] = [];
    for (const goal of this.goals.values()) {
      serialized.push({ ...goal });
    }
    this.context.globalState.update('goals', serialized);
  }

  private loadState(): void {
    const saved = this.context.globalState.get<Goal[]>('goals');
    if (saved) {
      for (const goal of saved) {
        // Don't restore stale planning/running goals — they can't resume without terminals
        if (goal.status === 'done' || goal.status === 'failed') {
          this.goals.set(goal.id, goal);
        }
      }
    }
  }

  dispose(): void {
    this._onGoalChanged.dispose();
  }
}
