import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { StorageService } from '../src/services/storage-service.js';
import fs from 'fs';
import path from 'path';

describe('StorageService', () => {
    const testDir = path.join(process.cwd(), 'test-data');
    let service: StorageService | undefined;

    beforeEach(() => {
        if (fs.existsSync(testDir)) {
            fs.rmSync(testDir, { recursive: true, force: true });
        }
        fs.mkdirSync(testDir, { recursive: true });
    });

    afterEach(() => {
        if (service) {
            service.close();
            service = undefined;
        }
        // Give a small delay for file handle release on Windows
        // or just use try-catch for the removal
        try {
            if (fs.existsSync(testDir)) {
                fs.rmSync(testDir, { recursive: true, force: true });
            }
        } catch (e) {
            // Ignore messy cleanup on windows if it happens
        }
    });

    it('should initialize database and tables', () => {
        service = new StorageService(testDir);
        expect(service.getConnections()).toEqual([]);
    });

    it('should save and retrieve connections', () => {
        service = new StorageService(testDir);
        const conn = {
            id: 'test-conn',
            vendor: 'sqlite',
            connectionString: 'sqlite://test.db'
        };

        service.saveConnection(conn);
        const stored = service.getConnections();
        
        expect(stored).toHaveLength(1);
        expect(stored[0]).toEqual(conn);
    });

    it('should update existing connection', () => {
        service = new StorageService(testDir);
        const conn1 = { id: 'test-conn', vendor: 'sqlite', connectionString: 'sqlite://v1.db' };
        const conn2 = { id: 'test-conn', vendor: 'postgres', connectionString: 'postgres://v2' };

        service.saveConnection(conn1);
        service.saveConnection(conn2);
        
        const stored = service.getConnections();
        expect(stored).toHaveLength(1);
        expect(stored[0]).toEqual(conn2);
    });

    it('should remove connection', () => {
        service = new StorageService(testDir);
        const conn = { id: 'one', vendor: 'sqlite', connectionString: 'sqlite://one.db' };
        service.saveConnection(conn);
        
        service.removeConnection('one');
        expect(service.getConnections()).toHaveLength(0);
    });

    it('should save and retrieve context', () => {
        service = new StorageService(testDir);
        const id = 'my-db';
        const content = '# My Context';
        
        service.saveContext(id, content);
        
        expect(service.hasContext(id)).toBe(true);
        expect(service.getContext(id)).toBe(content);
        expect(service.getContext('other')).toBeNull();
    });
});
