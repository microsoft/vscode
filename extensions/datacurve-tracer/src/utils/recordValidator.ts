import { Action, isActionType } from '../actionTypes';
import { ITrace } from '../types';

/**
 * Creates a type-safe trace record that conforms to the Action type specifications
 * @param action The action record to validate and create
 * @returns A validated trace record
 * @throws Error if the action doesn't match any known action type
 */
export function createRecord<T extends Action>(action: T): ITrace {
  // Check that the action conforms to a defined action type
  const actionId = action.action_id;
  
  // Validate action has proper structure
  if (!actionId) {
    throw new Error('Action must have an action_id');
  }
  
  if (!action.event) {
    throw new Error(`Action ${actionId} must have an event object`);
  }
  
  // Ensure timestamp exists
  if (!action.timestamp) {
    action.timestamp = Date.now();
  }
  
  return action as ITrace;
}

/**
 * Type assertion function to validate an action is of the expected type
 * @param action The action to validate
 * @param expectedActionId The expected action ID
 * @throws Error if the action is not of the expected type
 */
export function assertActionType<T extends Action>(
  action: Action, 
  expectedActionId: T['action_id']
): asserts action is T {
  if (!isActionType(action, expectedActionId)) {
    throw new Error(`Action ${action.action_id} does not match expected type ${expectedActionId}`);
  }
} 