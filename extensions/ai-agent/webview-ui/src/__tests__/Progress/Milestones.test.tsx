/**
 * Milestones Component Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Milestones } from '../../components/Progress/Milestones';
import { PhaseHistoryEntry } from '../../stores/chatStore';

describe('Milestones', () => {
    beforeEach(() => {
        vi.spyOn(window, 'addEventListener').mockImplementation(() => {});
        vi.spyOn(window, 'removeEventListener').mockImplementation(() => {});
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    const createPhaseHistory = (): PhaseHistoryEntry[] => [
        {
            phase: 'design',
            milestones: [
                { id: 'd1', label: 'Analyze requirements', status: 'complete' },
                { id: 'd2', label: 'Create design spec', status: 'complete' }
            ],
            startedAt: '2024-01-01T00:00:00Z',
            completedAt: '2024-01-01T01:00:00Z'
        },
        {
            phase: 'implementation',
            milestones: [
                { id: 'i1', label: 'Setup project', status: 'complete' },
                { id: 'i2', label: 'Implement feature', status: 'active' },
                { id: 'i3', label: 'Write tests', status: 'pending' }
            ],
            startedAt: '2024-01-01T01:00:00Z'
        }
    ];

    it('should return null when phaseHistory is empty', () => {
        const { container } = render(
            <Milestones
                phaseHistory={[]}
                expandedPhases={[]}
                onTogglePhase={() => {}}
            />
        );
        expect(container.firstChild).toBeNull();
    });

    it('should render milestones container', () => {
        render(
            <Milestones
                phaseHistory={createPhaseHistory()}
                expandedPhases={[]}
                onTogglePhase={() => {}}
            />
        );

        expect(screen.getByTestId('milestones')).toBeInTheDocument();
    });

    it('should render phase headers', () => {
        render(
            <Milestones
                phaseHistory={createPhaseHistory()}
                expandedPhases={[]}
                onTogglePhase={() => {}}
            />
        );

        expect(screen.getByText('Design')).toBeInTheDocument();
        expect(screen.getByText('Implementation')).toBeInTheDocument();
    });

    it('should show completion count for each phase', () => {
        render(
            <Milestones
                phaseHistory={createPhaseHistory()}
                expandedPhases={[]}
                onTogglePhase={() => {}}
            />
        );

        expect(screen.getByText('2/2')).toBeInTheDocument(); // Design
        expect(screen.getByText('1/3')).toBeInTheDocument(); // Implementation
    });

    describe('expansion', () => {
        it('should not show milestones when phase is collapsed', () => {
            render(
                <Milestones
                    phaseHistory={createPhaseHistory()}
                    expandedPhases={[]}
                    onTogglePhase={() => {}}
                />
            );

            expect(screen.queryByText('Analyze requirements')).toBeNull();
        });

        it('should show milestones when phase is expanded', () => {
            render(
                <Milestones
                    phaseHistory={createPhaseHistory()}
                    expandedPhases={['design']}
                    onTogglePhase={() => {}}
                />
            );

            expect(screen.getByText('Analyze requirements')).toBeInTheDocument();
            expect(screen.getByText('Create design spec')).toBeInTheDocument();
        });

        it('should call onTogglePhase when header is clicked', () => {
            const onTogglePhase = vi.fn();
            render(
                <Milestones
                    phaseHistory={createPhaseHistory()}
                    expandedPhases={[]}
                    onTogglePhase={onTogglePhase}
                />
            );

            const designHeader = screen.getByText('Design').closest('button');
            fireEvent.click(designHeader!);

            expect(onTogglePhase).toHaveBeenCalledWith('design');
        });

        it('should support multiple expanded phases', () => {
            render(
                <Milestones
                    phaseHistory={createPhaseHistory()}
                    expandedPhases={['design', 'implementation']}
                    onTogglePhase={() => {}}
                />
            );

            expect(screen.getByText('Analyze requirements')).toBeInTheDocument();
            expect(screen.getByText('Implement feature')).toBeInTheDocument();
        });
    });

    describe('milestone status', () => {
        it('should render complete milestone with correct styling', () => {
            render(
                <Milestones
                    phaseHistory={createPhaseHistory()}
                    expandedPhases={['design']}
                    onTogglePhase={() => {}}
                />
            );

            const milestone = screen.getByTestId('milestone-d1');
            expect(milestone.className).toContain('milestone--complete');
        });

        it('should render active milestone with correct styling', () => {
            render(
                <Milestones
                    phaseHistory={createPhaseHistory()}
                    expandedPhases={['implementation']}
                    onTogglePhase={() => {}}
                />
            );

            const milestone = screen.getByTestId('milestone-i2');
            expect(milestone.className).toContain('milestone--active');
        });

        it('should render pending milestone with correct styling', () => {
            render(
                <Milestones
                    phaseHistory={createPhaseHistory()}
                    expandedPhases={['implementation']}
                    onTogglePhase={() => {}}
                />
            );

            const milestone = screen.getByTestId('milestone-i3');
            expect(milestone.className).toContain('milestone--pending');
        });
    });

    describe('phase completion', () => {
        it('should show complete icon for completed phase', () => {
            render(
                <Milestones
                    phaseHistory={createPhaseHistory()}
                    expandedPhases={[]}
                    onTogglePhase={() => {}}
                />
            );

            const designPhase = screen.getByText('Design').closest('button');
            const icon = designPhase?.querySelector('.milestones__phase-icon');
            expect(icon?.className).toContain('milestones__phase-icon--complete');
        });

        it('should show active icon for in-progress phase', () => {
            render(
                <Milestones
                    phaseHistory={createPhaseHistory()}
                    expandedPhases={[]}
                    onTogglePhase={() => {}}
                />
            );

            const implPhase = screen.getByText('Implementation').closest('button');
            const icon = implPhase?.querySelector('.milestones__phase-icon');
            expect(icon?.className).toContain('milestones__phase-icon--active');
        });
    });

    it('should render milestone duration when provided', () => {
        const historyWithDuration: PhaseHistoryEntry[] = [
            {
                phase: 'design',
                milestones: [
                    { id: 'd1', label: 'Task', status: 'complete', duration: 45 }
                ],
                startedAt: '2024-01-01T00:00:00Z'
            }
        ];

        render(
            <Milestones
                phaseHistory={historyWithDuration}
                expandedPhases={['design']}
                onTogglePhase={() => {}}
            />
        );

        expect(screen.getByText('45s')).toBeInTheDocument();
    });
});
