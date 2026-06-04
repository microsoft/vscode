import { readFileSync } from 'fs';
import { join } from 'path';

// A constant config object
const CONFIG = {
	retries: 3,
	timeout: 5000,
	label: 'theme-test',
};

export type Status = 'idle' | 'running' | 'done';

export interface Task {
	id: number;
	name: string;
	status: Status;
}

export function loadTasks(dir: string): Task[] {
	const raw = readFileSync(join(dir, 'tasks.json'), 'utf8');
	const parsed = JSON.parse(raw) as Task[];
	return parsed.filter(t => t.status !== 'done');
}

class Scheduler {
	private tasks: Task[] = [];

	add(task: Task): void {
		this.tasks.push(task);
	}

	run(): number {
		let count = 0;
		for (const task of this.tasks) {
			console.log(`running ${task.name}`);
			count++;
		}
		return count;
	}
}

const scheduler = new Scheduler();
scheduler.add({ id: 1, name: 'build', status: 'idle' });
