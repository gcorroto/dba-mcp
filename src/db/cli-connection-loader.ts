import { DatabaseConnection } from '../types.js';
import oracledb from 'oracledb';
import pg from 'pg';
import mysql from 'mysql2/promise';
import { Connection } from 'tedious';
import Database from 'better-sqlite3';
import { URL } from 'url';

export class CliConnectionLoader {
  constructor(private args: string[] = []) {}

  async loadConnections(): Promise<DatabaseConnection[]> {
    const connections: DatabaseConnection[] = [];
    
    for (let i = 0; i < this.args.length; i++) {
        const arg = this.args[i];
        if (arg.startsWith('--') && i + 1 < this.args.length) {
            const id = arg.substring(2);
            const connectionString = this.args[i+1];
            
            if (connectionString.startsWith('--')) continue;

            console.error(`Attempting to connect to ${id}...`);

            try {
                const conn = await this.createConnection(id, connectionString);
                connections.push(conn);
                console.error(`✅ Connected to ${id} (${conn.vendor})`);
                i++; // Skip value
            } catch (err: any) {
                console.error(`❌ Failed to connect to '${id}': ${err.message}`);
            }
        }
    }
    return connections;
  }

  public async createConnection(id: string, uri: string): Promise<DatabaseConnection> {
    let url: URL;
    try {
        url = new URL(uri);
    } catch (e) {
        if (uri.endsWith('.db') || uri.endsWith('.sqlite')) {
            url = new URL(`sqlite://${uri}`);
        } else {
            throw e;
        }
    }

    const protocol = url.protocol.replace(':', '');

    switch (protocol) {
      case 'oracle':
        return this.createOracleConnection(id, url);
      case 'postgres':
      case 'postgresql':
        return this.createPostgresConnection(id, url, uri);
      case 'mysql':
        return this.createMysqlConnection(id, uri);
      case 'sqlserver':
      case 'mssql':
        return this.createSqlServerConnection(id, url);
      case 'sqlite':
      case 'file':
        return this.createSqliteConnection(id, url);
      default:
         throw new Error(`Unsupported protocol: ${protocol}`);
    }
  }

  private async createOracleConnection(id: string, url: URL): Promise<DatabaseConnection> {
    const user = decodeURIComponent(url.username);
    const password = decodeURIComponent(url.password);
    const connectString = `${url.hostname}:${url.port || 1521}/${url.pathname.substring(1)}`;
    
    if (process.env.ORACLE_CLIENT_LIB_DIR) {
        try { oracledb.initOracleClient({ libDir: process.env.ORACLE_CLIENT_LIB_DIR }); } catch(e) {}
    }

    const pool = await oracledb.createPool({
      user,
      password,
      connectString
    });

    return {
      id,
      vendor: 'oracle',
      pool,
      connectionString: url.toString(),
      config: {
        schema: user.toUpperCase(),
        database: url.pathname.substring(1)
      }
    };
  }

  private async createPostgresConnection(id: string, url: URL, rawUri: string): Promise<DatabaseConnection> {
    const pool = new pg.Pool({ connectionString: rawUri });
    const client = await pool.connect();
    client.release();
    
    return {
      id,
      vendor: 'postgresql',
      pool,
      connectionString: rawUri,
      config: {
        schema: 'public',
        database: url.pathname.substring(1)
      }
    };
  }

  private async createMysqlConnection(id: string, uri: string): Promise<DatabaseConnection> {
    const pool = mysql.createPool(uri);
    const conn = await pool.getConnection();
    conn.release();

    let database = undefined;
    try {
        const url = new URL(uri);
        database = url.pathname.substring(1);
    } catch (e) {}

    return {
      id,
      vendor: 'mysql',
      pool,
      connectionString: uri,
      config: {
        database: database
      }
    };
  }

  private async createSqlServerConnection(id: string, url: URL): Promise<DatabaseConnection> {
    const config: any = {
      server: url.hostname,
      authentication: {
        type: 'default',
        options: {
          userName: decodeURIComponent(url.username),
          password: decodeURIComponent(url.password)
        }
      },
      options: {
        port: Number(url.port) || 1433,
        database: url.pathname.substring(1),
        encrypt: true, 
        trustServerCertificate: true 
      }
    };
    
    const connection = new Connection(config);
    
    await new Promise<void>((resolve, reject) => {
       connection.on('connect', (err) => {
           if (err) reject(err);
           else resolve();
       });
       connection.connect();
    });

    return {
      id,
      vendor: 'sqlserver',
      pool: connection,
      connectionString: url.toString(),
      config: {
        database: config.options.database,
        schema: 'dbo'
      }
    };
  }

  private async createSqliteConnection(id: string, url: URL): Promise<DatabaseConnection> {
    let path = url.pathname;
    if (process.platform === 'win32' && /^\/[a-zA-Z]:/.test(path)) {
        path = path.substring(1);
    }
    path = decodeURIComponent(path);

    const db = new Database(path);
    return {
        id,
        vendor: 'sqlite',
        pool: db,
        connectionString: url.toString(),
        config: {
          database: path
        }
    };
  }
}
