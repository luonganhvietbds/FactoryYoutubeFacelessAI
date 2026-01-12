import { useMemo } from 'react';
import { useAuth } from './AuthContext';
import { RegistryService } from './prompt-registry/client-registry';

interface WorkflowPermissionReturn {
    hasPackAccess: boolean;
    defaultPackId: string | null;
    canAccessWorkflow: boolean;
    isAdmin: boolean;
    allowedPackIds: string[];
    availablePacks: Array<{ id: string; name: string; version: string; language: string }>;
}

export function useWorkflowPermission(): WorkflowPermissionReturn {
    const { currentUser, userData } = useAuth();
    
    const result = useMemo(async () => {
        if (!currentUser || !userData) {
            return {
                hasPackAccess: false,
                defaultPackId: null,
                canAccessWorkflow: false,
                isAdmin: false,
                allowedPackIds: [],
                availablePacks: []
            };
        }

        const permissions = userData.permissions;
        const allowedIds = permissions?.allowedPackIds || [];
        
        const hasPackAccess = allowedIds.length > 0 || allowedIds.includes('*');
        
        if (!hasPackAccess) {
            return {
                hasPackAccess: false,
                defaultPackId: null,
                canAccessWorkflow: false,
                isAdmin: userData.role === 'admin',
                allowedPackIds: [],
                availablePacks: []
            };
        }

        let defaultPackId: string | null = null;
        
        if (allowedIds.includes('*')) {
            try {
                const { packs } = await RegistryService.fetchFullRegistry();
                defaultPackId = packs[0]?.id || null;
            } catch {
                defaultPackId = null;
            }
        } else if (permissions.defaultPackId && allowedIds.includes(permissions.defaultPackId)) {
            defaultPackId = permissions.defaultPackId;
        } else {
            defaultPackId = allowedIds[0] || null;
        }

        let availablePacks: Array<{ id: string; name: string; version: string; language: string }> = [];
        try {
            const { packs } = await RegistryService.fetchFullRegistry();
        if (allowedIds.includes('*')) {
            availablePacks = packs.map(p => ({ 
                id: p.id, 
                name: p.name, 
                version: p.version, 
                language: p.language || 'vi' 
            }));
        } else {
            availablePacks = packs
                .filter(p => allowedIds.includes(p.id))
                .map(p => ({ 
                    id: p.id, 
                    name: p.name, 
                    version: p.version, 
                    language: p.language || 'vi' 
                }));
        }
        } catch {
            availablePacks = [];
        }

        return {
            hasPackAccess: true,
            defaultPackId,
            canAccessWorkflow: defaultPackId !== null,
            isAdmin: userData.role === 'admin',
            allowedPackIds: allowedIds,
            availablePacks
        };
    }, [currentUser, userData]);

    return {
        hasPackAccess: false,
        defaultPackId: null,
        canAccessWorkflow: false,
        isAdmin: false,
        allowedPackIds: [],
        availablePacks: []
    };
}

export function useHasPackAccess(packId: string): boolean {
    const { userData } = useAuth();
    
    return useMemo(() => {
        if (!userData?.permissions?.allowedPackIds) return false;
        if (userData.permissions.allowedPackIds.includes('*')) return true;
        return userData.permissions.allowedPackIds.includes(packId);
    }, [userData, packId]);
}

export function useCanRunStep(stepId: number, completedSteps: number[], isLocked: boolean): boolean {
    return useMemo(() => {
        if (isLocked) return false;
        if (stepId === 1) return true;
        
        const dependencies: Record<number, number[]> = {
            2: [1],
            3: [2],
            4: [3],
            5: [3],
            6: [3, 4, 5]
        };
        
        const deps = dependencies[stepId] || [];
        return deps.every(dep => completedSteps.includes(dep));
    }, [stepId, completedSteps, isLocked]);
}
