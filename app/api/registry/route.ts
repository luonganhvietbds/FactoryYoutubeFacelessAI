import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { PromptPackManifest, SystemPromptData } from '@/lib/types';

// Define explicit path to data directory
const DATA_DIR = path.join(process.cwd(), 'data/prompt-packs');

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { packId, stepId, name, content } = body;

        if (!packId || !stepId || !name) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        // 1. Find Pack Directory
        if (!fs.existsSync(DATA_DIR)) return NextResponse.json({ error: 'Data dir missing' }, { status: 500 });
        const packDirs = fs.readdirSync(DATA_DIR);
        const targetDirName = packDirs.find(dir => {
            const p = path.join(DATA_DIR, dir, 'manifest.json');
            if (fs.existsSync(p)) {
                const m = JSON.parse(fs.readFileSync(p, 'utf8'));
                return m.id === packId;
            }
            return false;
        });

        if (!targetDirName) return NextResponse.json({ error: 'Pack not found' }, { status: 404 });

        const packPath = path.join(DATA_DIR, targetDirName);
        const manifestPath = path.join(packPath, 'manifest.json');

        // 2. Generate Filename and ID
        const safeName = name.toLowerCase().replace(/[^a-z0-9]/g, '-');
        const fileName = `step-${stepId}-${safeName}.txt`;
        const filePath = path.join(packPath, fileName);
        const promptId = `${packId}_S${stepId}_${safeName}`.toUpperCase().replace(/-/g, '_');

        // 3. Write File
        fs.writeFileSync(filePath, content || '');

        // 4. Update Manifest
        const manifest: PromptPackManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
        if (!manifest.prompts) manifest.prompts = [];

        // Remove existing entry for this step if exists (overwrite logic)
        manifest.prompts = manifest.prompts.filter(p => p.stepId !== stepId);

        manifest.prompts.push({
            id: promptId,
            name: name,
            stepId: stepId,
            file: fileName
        });

        // Re-sort prompts by stepId
        manifest.prompts.sort((a, b) => a.stepId - b.stepId);

        fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

        return NextResponse.json({ success: true, promptId });

    } catch (error) {
        console.error('[Registry Create] Error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

export async function GET() {
    try {
        // 1. Check if directory exists
        if (!fs.existsSync(DATA_DIR)) {
            console.warn(`[Registry] Data directory not found: ${DATA_DIR}`);
            return NextResponse.json({ prompts: [], packs: [] });
        }

        // 2. Scan for pack directories
        const packDirs = fs.readdirSync(DATA_DIR).filter(file => {
            const fullPath = path.join(DATA_DIR, file);
            return fs.statSync(fullPath).isDirectory();
        });

        const allPrompts: SystemPromptData[] = [];
        const allPacks: PromptPackManifest[] = [];

        // 3. Process each pack
        for (const packDir of packDirs) {
            const manifestPath = path.join(DATA_DIR, packDir, 'manifest.json');

            if (!fs.existsSync(manifestPath)) {
                console.warn(`[Registry] Missing manifest for pack: ${packDir}`);
                continue;
            }

            try {
                const manifestContent = fs.readFileSync(manifestPath, 'utf8');
                const manifest: PromptPackManifest = JSON.parse(manifestContent);

                // --- VALIDATION: Check for 6 Steps Completeness ---
                const requiredSteps = [1, 2, 3, 4, 5, 6];
                const foundSteps = manifest.prompts ? manifest.prompts.map(p => p.stepId) : [];
                manifest.missingSteps = requiredSteps.filter(s => !foundSteps.includes(s));
                manifest.isValid = manifest.missingSteps.length === 0;

                allPacks.push(manifest);

                // Process prompts in manifest
                if (manifest.prompts && Array.isArray(manifest.prompts)) {
                    for (const promptAsset of manifest.prompts) {
                        const promptFilePath = path.join(DATA_DIR, packDir, promptAsset.file);

                        if (fs.existsSync(promptFilePath)) {
                            const content = fs.readFileSync(promptFilePath, 'utf8');

                            // Convert to Legacy SystemPromptData format for compatibility
                            const systemPrompt: SystemPromptData = {
                                id: promptAsset.id,     // Use legacy ID for compatibility
                                name: promptAsset.name,
                                stepId: promptAsset.stepId,
                                content: content,
                                packId: manifest.id
                            };

                            allPrompts.push(systemPrompt);
                        } else {
                            console.warn(`[Registry] Missing prompt file: ${promptAsset.file} in pack ${packDir}`);
                        }
                    }
                }
            } catch (err) {
                console.error(`[Registry] Error reading pack ${packDir}:`, err);
            }
        }

        // 4. Return aggregated list and packs
        return NextResponse.json({ prompts: allPrompts, packs: allPacks });

    } catch (error) {
        console.error('[Registry] Fatal error:', error);
        return NextResponse.json({ error: 'Failed to load registry' }, { status: 500 });
    }
}
