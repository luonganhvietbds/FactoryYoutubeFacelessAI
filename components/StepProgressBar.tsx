'use client';

import React from 'react';
import { StepConfig } from '@/lib/types';

interface StepProgressBarProps {
  steps: StepConfig[];
  currentStep: number;
  completedSteps: number[];
  onStepClick: (stepId: number) => void;
}

const StepProgressBar: React.FC<StepProgressBarProps> = ({ steps, currentStep, completedSteps, onStepClick }) => {
  const maxCompletedStep = completedSteps.length > 0 ? Math.max(...completedSteps) : 0;

  return (
    <nav aria-label="Progress">
      <ol role="list" className="space-y-4 md:flex md:space-x-8 md:space-y-0">
        {steps.map((step) => {
          const isStepCompleted = completedSteps.includes(step.id);
          const isCurrent = step.id === currentStep;

          const isReachable = step.id <= maxCompletedStep + 1;

          const activeWorkingStep = maxCompletedStep + 1;
          const shouldLookActive = isStepCompleted || step.id === activeWorkingStep;

          return (
            <li key={step.title} className="md:flex-1">
              <button
                onClick={() => isReachable && onStepClick(step.id)}
                disabled={!isReachable}
                className={`w-full text-left transition-all duration-200 ease-in-out rounded-lg focus:outline-none ${isReachable ? 'cursor-pointer' : 'cursor-not-allowed'} ${isCurrent ? 'ring-2 ring-sky-500 ring-offset-2 ring-offset-slate-900' : ''}`}
                aria-current={isCurrent ? 'step' : undefined}
              >
                <div className={`group flex w-full flex-col border-l-4 py-2 pl-4 transition-colors md:border-l-0 md:border-t-4 md:pb-0 md:pl-0 md:pt-4 ${shouldLookActive ? 'border-sky-600' : 'border-slate-700'}`}>
                  <span className={`text-sm font-medium transition-colors ${shouldLookActive ? 'text-sky-400' : 'text-slate-500'}`}>
                    Bước {step.id}
                  </span>
                  <span className="text-sm font-medium text-slate-200">{step.title.split(': ')[1]}</span>
                </div>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
};

export default StepProgressBar;