#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema, } from "@modelcontextprotocol/sdk/types.js";
import { CliConnectionLoader } from "./db/cli-connection-loader.js";
import { DatabaseService } from "./services/database-service.js";
import { SchemaCompareService } from "./services/schema-compare-service.js";
import { DataMigrationService } from "./services/data-migration-service.js";
import { StorageService } from "./services/storage-service.js";
let connections = [];
const storageService = new StorageService();
// Helper to get connection or throw
function getConnection(id) {
    const conn = connections.find(c => c.id === id);
    if (!conn)
        throw new Error(`Connection '${id}' not found`);
    return conn;
}
const server = new Server({
    name: "dba-mcp",
    version: "0.1.0",
}, {
    capabilities: {
        tools: {},
    },
});
server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
        tools: [
            {
                name: "list_connections",
                description: "List configured database connections and their status",
                inputSchema: { type: "object", properties: {} },
            },
            {
                name: "save_connection",
                description: "Save a new database connection persistently.",
                inputSchema: {
                    type: "object",
                    properties: {
                        id: { type: "string" },
                        vendor: { type: "string", enum: ["oracle", "postgresql", "mysql", "mariadb", "sqlserver", "sqlite"] },
                        connectionString: { type: "string" }
                    },
                    required: ["id", "vendor", "connectionString"]
                }
            },
            {
                name: "remove_connection",
                description: "Remove a stored database connection.",
                inputSchema: {
                    type: "object",
                    properties: {
                        id: { type: "string" }
                    },
                    required: ["id"]
                }
            },
            {
                name: "inspect_schema",
                description: "Get schema information. Lists tables if tableName not provided, or describes table.",
                inputSchema: {
                    type: "object",
                    properties: {
                        connectionId: { type: "string" },
                        tableName: { type: "string", description: "Optional: Describe specific table" }
                    },
                    required: ["connectionId"]
                }
            },
            {
                name: "sql_query",
                description: "Execute a SQL query",
                inputSchema: {
                    type: "object",
                    properties: {
                        connectionId: { type: "string" },
                        query: { type: "string" }
                    },
                    required: ["connectionId", "query"]
                }
            },
            {
                name: "generate_migration_ddl",
                description: "Compare schemas and generate DDL to migrate from Source to Target",
                inputSchema: {
                    type: "object",
                    properties: {
                        sourceId: { type: "string" },
                        targetId: { type: "string" }
                    },
                    required: ["sourceId", "targetId"]
                }
            },
            {
                name: "migrate_data",
                description: "Migrate data between databases. Warning: Experimental.",
                inputSchema: {
                    type: "object",
                    properties: {
                        sourceId: { type: "string" },
                        targetId: { type: "string" },
                        tables: { type: "array", items: { type: "string" } },
                        truncateTarget: { type: "boolean" }
                    },
                    required: ["sourceId", "targetId", "tables"]
                }
            },
            {
                name: "replicate_database",
                description: "AUTO-MAGIC: Clone ALL tables and data from Source DB to Target DB. Target should be empty.",
                inputSchema: {
                    type: "object",
                    properties: {
                        sourceId: { type: "string" },
                        targetId: { type: "string" }
                    },
                    required: ["sourceId", "targetId"]
                }
            },
            {
                name: "save_database_context",
                description: "Save AI-generated knowledge/context about a database (e.g. governance, business rules, schema explanation).",
                inputSchema: {
                    type: "object",
                    properties: {
                        connectionId: { type: "string" },
                        content: { type: "string", description: "Markdown content describing the database context" }
                    },
                    required: ["connectionId", "content"]
                }
            },
            {
                name: "get_database_context",
                description: "Retrieve stored knowledge/context about a database.",
                inputSchema: {
                    type: "object",
                    properties: {
                        connectionId: { type: "string" }
                    },
                    required: ["connectionId"]
                }
            }
        ],
    };
});
server.setRequestHandler(CallToolRequestSchema, async (request) => {
    try {
        switch (request.params.name) {
            case "list_connections": {
                const texts = await Promise.all(connections.map(async (c) => {
                    const hasCtx = storageService.hasContext(c.id);
                    const ctxIcon = hasCtx ? " 📝(Context Available)" : "";
                    const isStored = (storageService.getConnections().find(sc => sc.id === c.id));
                    const sourceIcon = isStored ? "💾" : "🖥️";
                    return `- **${c.id}**: ${c.vendor} (${c.connectionString}) ${sourceIcon}${ctxIcon}`;
                }));
                return {
                    content: [{
                            type: "text",
                            text: texts.length > 0
                                ? `Legends: 💾=Persisted, 🖥️=CLI-only, 📝=Has Context\n\n${texts.join('\n')}`
                                : "No connections configured. Use --[id] [connection_string] args."
                        }]
                };
            }
            case "inspect_schema": {
                const { connectionId, tableName } = request.params.arguments;
                const conn = getConnection(connectionId);
                const db = new DatabaseService(conn);
                if (tableName) {
                    const cols = await db.describeTable(tableName);
                    const pks = await db.listPrimaryKeys(tableName);
                    const fks = await db.listForeignKeys(tableName);
                    let text = `### Table: ${tableName}\n\n`;
                    text += `#### Columns\n| Name | Type | Nullable | PK |\n|---|---|---|---|\n`;
                    text += cols.map(c => `| ${c.name} | ${c.dataType} | ${c.nullable} | ${c.isPrimaryKey} |`).join('\n');
                    if (fks.length > 0) {
                        text += `\n\n#### Foreign Keys\n| Column | Ref Table | Ref Column |\n|---|---|---|\n`;
                        text += fks.map(fk => `| ${fk.column} | ${fk.refTable} | ${fk.refColumn} |`).join('\n');
                    }
                    return { content: [{ type: "text", text }] };
                }
                else {
                    const tables = await db.listTables();
                    const text = tables.map(t => `- [${t.type}] ${t.schema ? t.schema + '.' : ''}${t.name}`).join('\n');
                    return { content: [{ type: "text", text: `### Tables in ${connectionId}\n\n${text}` }] };
                }
            }
            case "sql_query": {
                const { connectionId, query } = request.params.arguments;
                const conn = getConnection(connectionId);
                const db = new DatabaseService(conn);
                const result = await db.executeQuery(query); // Defaults to 100 rows
                return { content: [{ type: "text", text: JSON.stringify(result.rows, null, 2) }] };
            }
            case "generate_migration_ddl": {
                const { sourceId, targetId } = request.params.arguments;
                const source = new DatabaseService(getConnection(sourceId));
                const target = new DatabaseService(getConnection(targetId));
                const comparator = new SchemaCompareService(source, target);
                const diff = await comparator.compare();
                const ddl = await comparator.generateDDL(diff);
                return { content: [{ type: "text", text: ddl }] };
            }
            case "migrate_data": {
                const { sourceId, targetId, tables, truncateTarget } = request.params.arguments;
                const source = new DatabaseService(getConnection(sourceId));
                const target = new DatabaseService(getConnection(targetId));
                const migrator = new DataMigrationService(source, target);
                const result = await migrator.migrateData(tables, truncateTarget);
                return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
            }
            case "replicate_database": {
                const { sourceId, targetId } = request.params.arguments;
                const source = new DatabaseService(getConnection(sourceId));
                const target = new DatabaseService(getConnection(targetId));
                const comparator = new SchemaCompareService(source, target);
                const migrator = new DataMigrationService(source, target);
                // 1. List all source tables
                const tables = await source.listTables();
                const report = [];
                for (const table of tables) {
                    if (table.type === 'VIEW')
                        continue; // Skip views for now
                    try {
                        report.push(`Processing table: ${table.name}...`);
                        // 2. Formulate CREATE TABLE
                        const columns = await source.describeTable(table.name);
                        const pks = await source.listPrimaryKeys(table.name);
                        const ddl = comparator.generateCreateTable(table.name, columns, pks);
                        // 3. Exec DDL (Ignore error if exists, or use try/catch)
                        try {
                            await target.executeQuery(ddl);
                            report.push(`  - Created table schema.`);
                        }
                        catch (e) {
                            report.push(`  - Table creation skipped/failed: ${e.message}`);
                        }
                        // 4. Migrate Data
                        const res = await migrator.migrateTable(table.name);
                        report.push(`  - Migrated ${res.rows} rows in ${res.time}ms.`);
                    }
                    catch (e) {
                        report.push(`  - ❌ Error processing table ${table.name}: ${e.message}`);
                    }
                }
                return { content: [{ type: "text", text: report.join('\n') }] };
            }
            case "save_connection": {
                const { id, vendor, connectionString } = request.params.arguments;
                const loader = new CliConnectionLoader();
                try {
                    // Verify connection (throws if invalid)
                    const conn = await loader.createConnection(id, connectionString);
                    storageService.saveConnection({ id, vendor, connectionString });
                    // Update active list
                    const existingIndex = connections.findIndex(c => c.id === id);
                    if (existingIndex >= 0) {
                        // Close old pool if possible (not implemented in types generally but good practice)
                        connections[existingIndex] = conn;
                    }
                    else {
                        connections.push(conn);
                    }
                    return { content: [{ type: "text", text: `Connection '${id}' saved and activated.` }] };
                }
                catch (e) {
                    return { isError: true, content: [{ type: "text", text: `Failed to connect: ${e.message}` }] };
                }
            }
            case "remove_connection": {
                const { id } = request.params.arguments;
                storageService.removeConnection(id);
                connections = connections.filter(c => c.id !== id);
                return { content: [{ type: "text", text: `Connection '${id}' removed.` }] };
            }
            case "save_database_context": {
                const { connectionId, content } = request.params.arguments;
                storageService.saveContext(connectionId, content);
                return { content: [{ type: "text", text: `Context saved for connection '${connectionId}'` }] };
            }
            case "get_database_context": {
                const { connectionId } = request.params.arguments;
                const context = storageService.getContext(connectionId);
                if (!context) {
                    return { content: [{ type: "text", text: `No context found for connection '${connectionId}'` }] };
                }
                return { content: [{ type: "text", text: context }] };
            }
            default:
                throw new Error("Unknown tool");
        }
    }
    catch (err) {
        return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true };
    }
});
async function main() {
    try {
        const loader = new CliConnectionLoader(process.argv.slice(2));
        const cliConnections = await loader.loadConnections();
        // Load stored connections
        const storedConfigs = storageService.getConnections();
        const storedConnections = [];
        for (const config of storedConfigs) {
            // Skip if defined in CLI (CLI overrides)
            if (cliConnections.find(c => c.id === config.id))
                continue;
            try {
                console.error(`Loading stored connection '${config.id}'...`);
                // We use loader.createConnection as a factory
                const conn = await loader.createConnection(config.id, config.connectionString);
                storedConnections.push(conn);
            }
            catch (e) {
                console.error(`Failed to load stored connection '${config.id}':`, e.message);
            }
        }
        connections = [...cliConnections, ...storedConnections];
    }
    catch (error) {
        console.error("Error loading connections:", error);
    }
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("DBA MCP Server running on stdio");
    console.error("Active connections:", connections.map(c => c.id).join(', '));
}
main().catch((error) => {
    console.error("Server error:", error);
    process.exit(1);
});
