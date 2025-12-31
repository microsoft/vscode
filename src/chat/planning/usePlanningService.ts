/**
 * usePlanningService - React hook for the planning service
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { PlanningService } from './PlanningService';
import type { Plan, PlanItem, PlanItemStatus, AriaModeId } from '../modes/types';

export interface UsePlanningServiceReturn {
  /** All plans */
  plans: Plan[];

  /** Currently active plan (for current session) */
  activePlan: Plan | undefined;

  /** Create a new plan */
  createPlan: (options: {
    name: string;
    overview: string;
    items?: PlanItem[];
    createdByMode: AriaModeId;
  }) => Plan;

  /** Create plan from agent response */
  createPlanFromResponse: (content: string, createdByMode?: AriaModeId) => Plan;

  /** Get a plan by ID */
  getPlan: (planId: string) => Plan | undefined;

  /** Update a plan */
  updatePlan: (planId: string, updates: Partial<Plan>) => void;

  /** Update item status */
  updateItemStatus: (planId: string, itemId: string, status: PlanItemStatus) => void;

  /** Add item to plan */
  addItem: (planId: string, item: Omit<PlanItem, 'id' | 'createdAt' | 'updatedAt'>) => void;

  /** Delete a plan */
  deletePlan: (planId: string) => void;

  /** Set active plan for session */
  setActivePlan: (planId: string | undefined) => void;

  /** Get plan progress */
  getProgress: (planId: string) => { completed: number; total: number; percentage: number };

  /** Serialize plan to markdown */
  serializePlan: (plan: Plan) => string;
}

/**
 * React hook for interacting with the PlanningService
 */
export function usePlanningService(sessionId?: string): UsePlanningServiceReturn {
  const service = useMemo(() => PlanningService.getInstance(), []);

  const [plans, setPlans] = useState<Plan[]>(() => service.getAllPlans());
  const [activePlanId, setActivePlanId] = useState<string | undefined>(() =>
    sessionId ? service.getPlanForSession(sessionId)?.id : undefined
  );

  // Subscribe to plan changes
  useEffect(() => {
    const handlePlanCreated = (plan: Plan) => {
      setPlans(service.getAllPlans());
      if (plan.sessionId === sessionId) {
        setActivePlanId(plan.id);
      }
    };

    const handlePlanUpdated = () => {
      setPlans(service.getAllPlans());
    };

    const handlePlanDeleted = (planId: string) => {
      setPlans(service.getAllPlans());
      if (planId === activePlanId) {
        setActivePlanId(undefined);
      }
    };

    service.on('planCreated', handlePlanCreated);
    service.on('planUpdated', handlePlanUpdated);
    service.on('planDeleted', handlePlanDeleted);

    return () => {
      service.off('planCreated', handlePlanCreated);
      service.off('planUpdated', handlePlanUpdated);
      service.off('planDeleted', handlePlanDeleted);
    };
  }, [service, sessionId, activePlanId]);

  const activePlan = useMemo(
    () => (activePlanId ? service.getPlan(activePlanId) : undefined),
    [service, activePlanId, plans] // Include plans to trigger re-render on updates
  );

  const createPlan = useCallback(
    (options: {
      name: string;
      overview: string;
      items?: PlanItem[];
      createdByMode: AriaModeId;
    }) => {
      return service.createPlan({
        ...options,
        sessionId,
      });
    },
    [service, sessionId]
  );

  const createPlanFromResponse = useCallback(
    (content: string, createdByMode: AriaModeId = 'plan') => {
      return service.createPlanFromResponse(content, sessionId, createdByMode);
    },
    [service, sessionId]
  );

  const getPlan = useCallback(
    (planId: string) => service.getPlan(planId),
    [service]
  );

  const updatePlan = useCallback(
    (planId: string, updates: Partial<Plan>) => {
      service.updatePlan(planId, updates);
    },
    [service]
  );

  const updateItemStatus = useCallback(
    (planId: string, itemId: string, status: PlanItemStatus) => {
      service.updateItemStatus(planId, itemId, status);
    },
    [service]
  );

  const addItem = useCallback(
    (planId: string, item: Omit<PlanItem, 'id' | 'createdAt' | 'updatedAt'>) => {
      service.addItem(planId, item);
    },
    [service]
  );

  const deletePlan = useCallback(
    (planId: string) => {
      service.deletePlan(planId);
    },
    [service]
  );

  const setActivePlan = useCallback(
    (planId: string | undefined) => {
      setActivePlanId(planId);
      if (planId && sessionId) {
        service.linkToSession(planId, sessionId);
      }
    },
    [service, sessionId]
  );

  const getProgress = useCallback(
    (planId: string) => service.getProgress(planId),
    [service]
  );

  const serializePlan = useCallback(
    (plan: Plan) => service.serializePlan(plan),
    [service]
  );

  return {
    plans,
    activePlan,
    createPlan,
    createPlanFromResponse,
    getPlan,
    updatePlan,
    updateItemStatus,
    addItem,
    deletePlan,
    setActivePlan,
    getProgress,
    serializePlan,
  };
}

export default usePlanningService;


