import fs from 'fs/promises';
import path from 'path';
import { existsSync, mkdirSync } from 'fs';
export class ContextService {
    contextsDir;
    constructor(baseDir) {
        // Use process.cwd() as base, or provided dir
        // Default to ./contexts/ in the current working directory (where the server is running)
        this.contextsDir = path.join(baseDir || process.cwd(), 'contexts');
        this.ensureDir();
    }
    ensureDir() {
        if (!existsSync(this.contextsDir)) {
            mkdirSync(this.contextsDir, { recursive: true });
        }
    }
    getFilePath(connectionId) {
        // Sanitize ID to avoid path traversal
        const safeId = connectionId.replace(/[^a-zA-Z0-9_\-\.]/g, '_');
        return path.join(this.contextsDir, `${safeId}.md`);
    }
    async saveContext(connectionId, content) {
        const filePath = this.getFilePath(connectionId);
        await fs.writeFile(filePath, content, 'utf-8');
    }
    async getContext(connectionId) {
        const filePath = this.getFilePath(connectionId);
        try {
            return await fs.readFile(filePath, 'utf-8');
        }
        catch (error) {
            if (error.code === 'ENOENT') {
                return null;
            }
            throw error;
        }
    }
    async hasContext(connectionId) {
        const filePath = this.getFilePath(connectionId);
        try {
            await fs.access(filePath);
            return true;
        }
        catch {
            return false;
        }
    }
    async listContexts() {
        try {
            const files = await fs.readdir(this.contextsDir);
            return files
                .filter(f => f.endsWith('.md'))
                .map(f => f.replace('.md', ''));
        }
        catch {
            return [];
        }
    }
}
