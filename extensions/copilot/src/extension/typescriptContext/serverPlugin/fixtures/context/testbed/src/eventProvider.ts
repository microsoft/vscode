import type { Employee } from './employee';
import type { Event } from './events';

export interface EventProvider {
	onEmployeeAdded: Event<Employee>;
}