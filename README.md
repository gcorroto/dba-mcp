# DBA MCP Server 🚀

**Multi-vendor Database Tool for DevOps & Migrations**

`dba-mcp` is a Model Context Protocol (MCP) server designed to enable LLMs (like Claude, ChatGPT, or local models) to interact with, manage, and migrate SQL databases directly. It operates over `stdio`, making it ideal for integration with tools like Claude Desktop, Cursor, or any MCP client.

It focuses on "Infrastructure as Code" and heavy-lifting tasks like schema comparison and bulk data migration, without requiring a graphical interface.

---

## 🌟 Features

*   **Multi-Vendor Support**: Connect to Oracle, PostgreSQL, MySQL/MariaDB, SQL Server, and SQLite simultaneously.
*   **Infrastructure-as-Code**: Configuration is injected via CLI arguments, keeping the server stateless and secure.
*   **Schema Intelligence**:
    *   Compare schemas between different engines (e.g., Oracle vs. Postgres).
    *   Generate DDL scripts (`CREATE`, `ALTER`) to synchronize structures.
*   **Data Migration**:
    *   `migrate_data`: Move data between connections with optimized bulk inserts.
    *   `replicate_database`: **Auto-Magic** cloning of an entire database (Schema + Data) from Source to Target.
*   **DevOps Ready**: Docker support and standardized NPM scripts.

---

## 📦 Installation

### Via NPX (Recommended)
You can run it directly without installing:

```bash
npx dba-mcp --local sqlite://data.db --prod postgres://user:pass@host/db
```

### Local Installation
```bash
git clone https://github.com/grecoLab/mcp-dba.git
cd mcp-dba
npm install
npm run build
```

---

## 🛠️ Configuration & Usage

Connections are configured via command-line arguments. You define an ID for each connection and provide its connection string.

**Format:** `--[id] [connection_string]`

### Example Configuration (Claude Desktop)

Add this to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "dba-tools": {
      "command": "npx",
      "args": [
        "-y",
        "dba-mcp",
        "--dev", "sqlite://./dev.db",
        "--staging", "mysql://root:pass@localhost:3306/staging_db",
        "--prod", "postgres://admin:secure@prod-host:5432/main_db",
        "--legacy", "oracle://system:manager@oracle-host:1521/XEPDB1"
      ]
    }
  }
}
```

### Supported Connection Strings
- **SQLite**: `sqlite://path/to/file.db`
- **PostgreSQL**: `postgres://user:pass@host:5432/db`
- **MySQL**: `mysql://user:pass@host:3306/db`
- **Oracle**: `oracle://user:pass@host:1521/service`
- **SQL Server**: `sqlserver://user:pass@host:1433/db`

---

## 🧰 Available Tools for LLMs

Once connected, the LLM will have access to these tools:

| Tool | Description |
|------|-------------|
| **`list_connections`** | Lists all configured database connections and their status. |
| **`inspect_schema`** | Explore the database structure. Pass `tableName` to see columns/PKs, or empty to list all tables. |
| **`sql_query`** | Execute a read-only SQL query on a specific connection. |
| **`generate_migration_ddl`** | Compares two schemas (Source -> Target) and generates the SQL DDL commands to make Target match Source. |
| **`migrate_data`** | Migrates specific tables from Source to Target using bulk inserts. |
| **`replicate_database`** | **🔥 Power Tool**: Clones an ENTIRE database. Scans source, creates tables in target, and migrates all data automatically. |

---

## 💻 Development

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
