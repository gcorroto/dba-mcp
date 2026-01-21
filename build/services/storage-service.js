import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
export class StorageService {
    db;
    constructor(dataDir) {
        const dir = dataDir || process.cwd();
        // Ensure directory exists
        if (!fs.existsSync(dir)) {
            // For safety, we only create the .mcp folder if explicitly needed, 
            // but here we likely just want a file in root or a specific folder.
            // Let's assume root is safe, or create a .dba-mcp folder.
        }
        // Let's put it in a hidden folder to be clean
        const storageDir = path.join(dir, '.dba-mcp');
        if (!fs.existsSync(storageDir)) {
            fs.mkdirSync(storageDir, { recursive: true });
        }
        this.db = new Database(path.join(storageDir, 'storage.db'));
        this.init();
    }
    init() {
        // Table for Connection Configs
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS connections (
                id TEXT PRIMARY KEY,
                vendor TEXT NOT NULL,
                connection_string TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);
        // Table for Database Contexts (Markdown)
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS contexts (
                connection_id TEXT PRIMARY KEY,
                content TEXT NOT NULL,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);
    }
    // --- Connections ---
    saveConnection(conn) {
        const stmt = this.db.prepare(`
            INSERT OR REPLACE INTO connections (id, vendor, connection_string)
            VALUES (?, ?, ?)
        `);
        stmt.run(conn.id, conn.vendor, conn.connectionString);
    }
    getConnections() {
        return this.db.prepare('SELECT id, vendor, connection_string FROM connections').all().map((row) => ({
            id: row.id,
            vendor: row.vendor,
            connectionString: row.connection_string
        }));
    }
    close() {
        this.db.close();
    }
    removeConnection(id) {
        this.db.prepare('DELETE FROM connections WHERE id = ?').run(id);
    }
    // --- Contexts ---
    saveContext(connectionId, content) {
        const stmt = this.db.prepare(`
            INSERT OR REPLACE INTO contexts (connection_id, content, updated_at)
            VALUES (?, ?, CURRENT_TIMESTAMP)
        `);
        stmt.run(connectionId, content);
    }
    getContext(connectionId) {
        const row = this.db.prepare('SELECT content FROM contexts WHERE connection_id = ?').get(connectionId);
        return row ? row.content : null;
    }
    hasContext(connectionId) {
        const row = this.db.prepare('SELECT 1 FROM contexts WHERE connection_id = ?').get(connectionId);
        return !!row;
    }
}
