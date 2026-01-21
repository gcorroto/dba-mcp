# DBA MCP Server 🚀

**Multi-vendor Database Tool for DevOps, Migrations & Knowledge Management**

`dba-mcp` is a Model Context Protocol (MCP) server designed to enable LLMs (like Claude, ChatGPT, or local models) to interact with, manage, and migrate SQL databases directly. It operates over `stdio`, making it ideal for integration with tools like Claude Desktop, Cursor, or any MCP client.

It combines "Infrastructure as Code" principles with persistent knowledge management, allowing AI agents to save specific context about databases (Governance, Business Rules, Schema Explanations) and recall it on demand.

---

## 🌟 Features

*   **Multi-Vendor Support**: Connect to Oracle, PostgreSQL, MySQL/MariaDB, SQL Server, and SQLite simultaneously.
*   **Hybrid Configuration**:
    *   **Stateless**: Inject connections via CLI arguments (`--[id] [connection_string]`).
    *   **Persistent**: Save connections permanently using the `save_connection` tool (stored in local SQLite).
*   **Context & Knowledge Management** 🧠:
    *   Save AI-generated context (Markdown) about a database (e.g., "This endpoint creates users based on table X").
    *   Recall context automatically to answer complex questions about specific databases.
*   **Schema Intelligence**:
    *   Compare schemas between different engines.
    *   Generate DDL scripts (`CREATE`, `ALTER`) to synchronize structures.
*   **Data Migration**:
    *   `migrate_data`: Move data between connections with optimized bulk inserts.
    *   `replicate_database`: **Auto-Magic** cloning of an entire database (Schema + Data).

---

## 📦 Installation

### Via NPX (Recommended)
You can run it directly without installing. Connections defined in CLI are loaded alongside any persistent connections saved previously.

```bash
npx @grec0/dba-mcp --local sqlite://data.db --prod postgres://user:pass@host/db
```

### Local Installation
```bash
git clone https://github.com/grecoLab/mcp-dba.git
cd mcp-dba
npm install
npm run build
```

---

## 🛠️ Configuration & Persistence

### 1. CLI Arguments (Ephemeral/Stateless)
Ideal for CI/CD or temporary sessions.
Format: `--[id] [connection_string]`

```json
/* claude_desktop_config.json */
{
  "mcpServers": {
    "dba-tools": {
      "command": "npx",
      "args": [
        "-y",
        "@grec0/dba-mcp",
        "--staging", "mysql://root:pass@localhost:3306/staging_db"
      ]
    }
  }
}
```

### 2. Persistent Storage (Stateful)
You can use tools to save connections. They are stored in an internal SQLite database (`.dba-mcp/storage.db`) within the running directory.

*   **Save**: `save_connection`
*   **Remove**: `remove_connection`
*   **List**: `list_connections` (Shows source: 💾=Saved, 🖥️=CLI)

---

## 🧰 Available Tools for LLMs

Once connected, the LLM will have access to these tools:

### Connection & Context Management
| Tool | Description |
|------|-------------|
| **`list_connections`** | Lists all active connections. Icons indicate status: <br>💾 Saved to Disk <br>🖥️ From CLI Args <br>📝 Context Available |
| **`save_connection`** | Saves a new connection URL permanently. |
| **`remove_connection`** | Removes a stored connection. |
| **`save_database_context`** | Saves AI-generated markdown documentation for a specific connection (Governance, Business Logic). |
| **`get_database_context`** | Retrieves the stored markdown context for a connection. |

### Database Operations
| Tool | Description |
|------|-------------|
| **`inspect_schema`** | Explore the database structure. Pass `tableName` to see columns/PKs, or empty to list all tables. |
| **`sql_query`** | Execute a read-only SQL query on a specific connection. |
| **`generate_migration_ddl`** | Compares two schemas (Source -> Target) and generates the SQL DDL commands to make Target match Source. |
| **`migrate_data`** | Migrates specific tables from Source to Target using bulk inserts. |
| **`replicate_database`** | **🔥 Power Tool**: Clones an ENTIRE database. Scans source, creates tables in target, and migrates all data automatically. |

---

## 🧠 Supported Connection Strings
- **SQLite**: `sqlite://path/to/file.db`
- **PostgreSQL**: `postgres://user:pass@host:5432/db`
- **MySQL**: `mysql://user:pass@host:3306/db`
- **Oracle**: `oracle://user:pass@host:1521/service`
- **SQL Server**: `sqlserver://user:pass@host:1433/db`

---

## 💻 Development & Release

### Build
```bash
npm run build
```
This runs TypeScript compiler and ensures the binary is executable (`shx chmod +x`).

### Release
To version and publish (follows Semantic Versioning):
```bash
npm run release:patch  # 0.0.1 -> 0.0.2
npm run release:minor  # 0.1.0 -> 0.2.0
npm run release:major  # 1.0.0 -> 2.0.0
```
*Note: These scripts automatically push to Git and publish to NPM.*

### Inspector
To debug the MCP server communication visually:
```bash
npm run inspector -- --local sqlite://test.db
```

---

## 🐳 Docker

A multi-stage `Dockerfile` is included for containerized deployments.

```bash
docker build -t dba-mcp .
docker run -i dba-mcp --prod postgres://...
```

---

## License
MIT
