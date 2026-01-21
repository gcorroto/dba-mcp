import { DatabaseConnection, QueryResult, TableInfo, ColumnInfo, HealthCheckResult } from '../types.js';

export class DatabaseService {
  constructor(private connection: DatabaseConnection) {}

  async executeQuery(sql: string, maxRows: number = 100): Promise<QueryResult> {
    const startTime = Date.now();
    const { vendor, pool } = this.connection;

    try {
      switch (vendor) {
        case 'oracle':
          return await this.executeOracleQuery(pool, sql, maxRows);
        case 'postgresql':
          return await this.executePostgresQuery(pool, sql, maxRows);
        case 'mysql':
        case 'mariadb':
          return await this.executeMySqlQuery(pool, sql, maxRows);
        case 'sqlserver':
          return await this.executeSqlServerQuery(pool, sql, maxRows);
        case 'sqlite':
          return await this.executeSqliteQuery(pool, sql, maxRows);
        default:
          throw new Error(`Vendor no soportado: ${vendor}`);
      }
    } catch (error: any) {
      throw new Error(`Error ejecutando query: ${error.message}`);
    } finally {
      const executionTime = Date.now() - startTime;
      console.log(`⏱️ Query ejecutado en ${executionTime}ms`);
    }
  }

  private async executeOracleQuery(pool: any, sql: string, maxRows: number): Promise<QueryResult> {
    const connection = await pool.getConnection();
    try {
      const result = await connection.execute(sql, [], { maxRows, outFormat: 4002 }); // OBJECT format
      return {
        columns: result.metaData?.map((col: any) => col.name) || [],
        rows: result.rows || [],
        rowCount: result.rows?.length || 0,
        executionTime: 0
      };
    } finally {
      await connection.close();
    }
  }

  private async executePostgresQuery(pool: any, sql: string, maxRows: number): Promise<QueryResult> {
    const result = await pool.query(`${sql} LIMIT ${maxRows}`);
    return {
      columns: result.fields.map((field: any) => field.name),
      rows: result.rows,
      rowCount: result.rowCount || 0,
      executionTime: 0
    };
  }

  private async executeMySqlQuery(pool: any, sql: string, maxRows: number): Promise<QueryResult> {
    const [rows, fields] = await pool.query(`${sql} LIMIT ${maxRows}`);
    return {
      columns: fields.map((field: any) => field.name),
      rows: rows as any[],
      rowCount: (rows as any[]).length,
      executionTime: 0
    };
  }

  private async executeSqlServerQuery(pool: any, sql: string, maxRows: number): Promise<QueryResult> {
    // SQL Server con Tedious es más complejo
    return new Promise((resolve, reject) => {
      const rows: any[] = [];
      let columns: string[] = [];

      const request = pool.request();
      request.on('columnMetadata', (columnsMetadata: any) => {
        columns = columnsMetadata.map((col: any) => col.colName);
      });

      request.on('row', (rowData: any) => {
        if (rows.length < maxRows) {
          const row: any = {};
          rowData.forEach((col: any) => {
            row[col.metadata.colName] = col.value;
          });
          rows.push(row);
        }
      });

      request.on('requestCompleted', () => {
        resolve({
          columns,
          rows,
          rowCount: rows.length,
          executionTime: 0
        });
      });

      request.on('error', reject);
      request.query(sql);
    });
  }

  private async executeSqliteQuery(pool: any, sql: string, maxRows: number): Promise<QueryResult> {
    // SQLite con better-sqlite3 es síncrono
    const stmt = pool.prepare(`${sql} LIMIT ${maxRows}`);
    const rows = stmt.all();
    
    const columns = rows.length > 0 ? Object.keys(rows[0]) : [];
    
    return {
      columns,
      rows,
      rowCount: rows.length,
      executionTime: 0
    };
  }

  async listTables(): Promise<TableInfo[]> {
    const { vendor, pool, config } = this.connection;

    switch (vendor) {
      case 'oracle':
        return await this.listOracleTables(pool, config.schema);
      case 'postgresql':
        return await this.listPostgresTables(pool, config.schema);
      case 'mysql':
      case 'mariadb':
        if (!config.database) throw new Error('Database name required for MySQL');
        return await this.listMySqlTables(pool, config.database);
      case 'sqlserver':
        return await this.listSqlServerTables(pool, config.schema);
      case 'sqlite':
        return await this.listSqliteTables(pool);
      default:
        throw new Error(`Vendor no soportado: ${vendor}`);
    }
  }

  private async listOracleTables(pool: any, schema?: string): Promise<TableInfo[]> {
    const connection = await pool.getConnection();
    try {
      let sql: string;
      let binds: any;

      if (schema) {
        // Si se especifica schema, buscar en ALL_TABLES
        sql = `
          SELECT table_name, owner, num_rows, last_analyzed
          FROM all_tables 
          WHERE owner = :schema
          ORDER BY table_name
        `;
        binds = { schema: schema.toUpperCase() };
      } else {
        // Sin schema, obtener el schema actual del usuario y buscar sus tablas
        sql = `
          SELECT table_name, owner, num_rows, last_analyzed
          FROM user_tables
          ORDER BY table_name
        `;
        binds = [];
      }

      console.log(`🔍 Oracle SQL: ${sql.trim().replace(/\s+/g, ' ')}`);
      console.log(`📊 Schema: ${schema || 'USER (current user)'}`);

      const result = await connection.execute(sql, binds, { outFormat: 4002 });
      
      console.log(`✅ Tablas encontradas: ${result.rows.length}`);
      
      if (result.rows.length === 0) {
        // Intentar con el esquema del usuario actual
        const schemaCheckSql = `SELECT SYS_CONTEXT('USERENV', 'CURRENT_SCHEMA') as current_schema FROM DUAL`;
        const schemaResult = await connection.execute(schemaCheckSql, [], { outFormat: 4002 });
        const currentSchema = schemaResult.rows[0]?.CURRENT_SCHEMA;
        
        console.log(`ℹ️  Schema actual del usuario: ${currentSchema}`);
        console.log(`⚠️  No se encontraron tablas en el schema especificado`);
        
        // Si es el schema del usuario y no hay tablas, buscar en todos los schemas accesibles
        if (!schema || schema.toUpperCase() === currentSchema) {
          console.log(`🔎 Intentando buscar en TODOS los schemas accesibles...`);
          const allTablesSql = `
            SELECT table_name, owner, num_rows, last_analyzed
            FROM all_tables
            WHERE owner IN (
              SELECT username FROM all_users 
              WHERE username NOT IN ('SYS', 'SYSTEM', 'OUTLN', 'DIP', 'ORACLE_OCM', 'DBSNMP', 'APPQOSSYS', 'WMSYS', 'EXFSYS', 'CTXSYS', 'XDB', 'ANONYMOUS', 'ORDSYS', 'ORDDATA', 'MDSYS', 'LBACSYS', 'DVSYS', 'DVF', 'GSMADMIN_INTERNAL', 'OJVMSYS', 'OLAPSYS')
            )
            ORDER BY owner, table_name
          `;
          const allTablesResult = await connection.execute(allTablesSql, [], { outFormat: 4002 });
          console.log(`✅ Tablas encontradas en TODOS los schemas: ${allTablesResult.rows.length}`);
          
          return allTablesResult.rows.map((row: any) => ({
            name: row.TABLE_NAME,
            type: 'TABLE' as const,
            schema: row.OWNER
          }));
        }
      }

      return result.rows.map((row: any) => ({
        name: row.TABLE_NAME,
        type: 'TABLE' as const,
        schema: row.OWNER
      }));
    } finally {
      await connection.close();
    }
  }

  private async listPostgresTables(pool: any, schema: string = 'public'): Promise<TableInfo[]> {
    const result = await pool.query(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = $1 AND table_type = 'BASE TABLE'`,
      [schema]
    );
    return result.rows.map((row: any) => ({
      name: row.table_name,
      type: 'TABLE' as const
    }));
  }

  private async listMySqlTables(pool: any, database: string): Promise<TableInfo[]> {
    const [rows] = await pool.query(`SHOW TABLES FROM \`${database}\``);
    return (rows as any[]).map((row: any) => ({
      name: Object.values(row)[0] as string,
      type: 'TABLE' as const
    }));
  }

  private async listSqlServerTables(pool: any, schema: string = 'dbo'): Promise<TableInfo[]> {
    return new Promise((resolve, reject) => {
      const tables: TableInfo[] = [];
      const request = pool.request();

      request.on('row', (columns: any) => {
        tables.push({
          name: columns[0].value,
          type: 'TABLE' as const
        });
      });

      request.on('requestCompleted', () => resolve(tables));
      request.on('error', reject);

      request.query(`SELECT table_name FROM information_schema.tables WHERE table_schema = '${schema}'`);
    });
  }

  private async listSqliteTables(pool: any): Promise<TableInfo[]> {
    const stmt = pool.prepare(`
      SELECT name, type 
      FROM sqlite_master 
      WHERE type IN ('table', 'view') 
        AND name NOT LIKE 'sqlite_%'
      ORDER BY name
    `);
    const rows = stmt.all();
    
    return rows.map((row: any) => ({
      name: row.name,
      type: row.type.toUpperCase() === 'TABLE' ? 'TABLE' as const : 'VIEW' as const
    }));
  }

  async describeTable(tableName: string): Promise<ColumnInfo[]> {
    const { vendor, pool, config } = this.connection;

    switch (vendor) {
      case 'oracle':
        return await this.describeOracleTable(pool, tableName, config.schema);
      case 'postgresql':
        return await this.describePostgresTable(pool, tableName, config.schema);
      case 'mysql':
      case 'mariadb':
        return await this.describeMySqlTable(pool, tableName);
      case 'sqlserver':
        return await this.describeSqlServerTable(pool, tableName);
      case 'sqlite':
        return await this.describeSqliteTable(pool, tableName);
      default:
        throw new Error(`Vendor no soportado: ${vendor}`);
    }
  }

  private async describeOracleTable(pool: any, tableName: string, schema?: string): Promise<ColumnInfo[]> {
    const connection = await pool.getConnection();
    try {
      const sql = schema
        ? `SELECT column_name, data_type, nullable FROM all_tab_columns WHERE table_name = :tableName AND owner = :schema`
        : `SELECT column_name, data_type, nullable FROM user_tab_columns WHERE table_name = :tableName`;

      const result = await connection.execute(
        sql,
        schema ? { tableName, schema } : { tableName },
        { outFormat: 4002 }
      );

      return result.rows.map((row: any) => ({
        name: row.COLUMN_NAME,
        dataType: row.DATA_TYPE,
        nullable: row.NULLABLE === 'Y',
        isPrimaryKey: false
      }));
    } finally {
      await connection.close();
    }
  }

  private async describePostgresTable(pool: any, tableName: string, schema: string = 'public'): Promise<ColumnInfo[]> {
    const result = await pool.query(
      `SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name = $1 AND table_schema = $2`,
      [tableName, schema]
    );

    return result.rows.map((row: any) => ({
      name: row.column_name,
      dataType: row.data_type,
      nullable: row.is_nullable === 'YES',
      isPrimaryKey: false
    }));
  }

  private async describeMySqlTable(pool: any, tableName: string): Promise<ColumnInfo[]> {
    const [rows] = await pool.query(`DESCRIBE \`${tableName}\``);
    return (rows as any[]).map((row: any) => ({
      name: row.Field,
      dataType: row.Type,
      nullable: row.Null === 'YES',
      isPrimaryKey: row.Key === 'PRI'
    }));
  }

  private async describeSqlServerTable(pool: any, tableName: string): Promise<ColumnInfo[]> {
    return new Promise((resolve, reject) => {
      const columns: ColumnInfo[] = [];
      const request = pool.request();

      request.on('row', (row: any) => {
        columns.push({
          name: row[0].value,
          dataType: row[1].value,
          nullable: row[2].value === 'YES',
          isPrimaryKey: false
        });
      });

      request.on('requestCompleted', () => resolve(columns));
      request.on('error', reject);

      request.query(`SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name = '${tableName}'`);
    });
  }

  private async describeSqliteTable(pool: any, tableName: string): Promise<ColumnInfo[]> {
    // Obtener información de columnas
    const stmt = pool.prepare(`PRAGMA table_info(${tableName})`);
    const rows = stmt.all();
    
    return rows.map((row: any) => ({
      name: row.name,
      dataType: row.type,
      nullable: row.notnull === 0,
      isPrimaryKey: row.pk === 1
    }));
  }

  async listPrimaryKeys(tableName: string): Promise<string[]> {
    const { vendor, pool, config } = this.connection;

    switch (vendor) {
      case 'oracle':
        return await this.listOraclePrimaryKeys(pool, tableName, config.schema);
      case 'postgresql':
        return await this.listPostgresPrimaryKeys(pool, tableName, config.schema);
      case 'mysql':
      case 'mariadb':
        return await this.listMySqlPrimaryKeys(pool, tableName);
      case 'sqlserver':
        return await this.listSqlServerPrimaryKeys(pool, tableName);
      case 'sqlite':
        return await this.listSqlitePrimaryKeys(pool, tableName);
      default:
        throw new Error(`Vendor no soportado: ${vendor}`);
    }
  }

  private async listOraclePrimaryKeys(pool: any, tableName: string, schema?: string): Promise<string[]> {
    const connection = await pool.getConnection();
    try {
      const sql = schema
        ? `SELECT cols.column_name
           FROM all_constraints cons
           JOIN all_cons_columns cols ON cons.constraint_name = cols.constraint_name AND cons.owner = cols.owner
           WHERE cons.constraint_type = 'P'
             AND cons.table_name = :tableName
             AND cons.owner = :schema
           ORDER BY cols.position`
        : `SELECT cols.column_name
           FROM user_constraints cons
           JOIN user_cons_columns cols ON cons.constraint_name = cols.constraint_name
           WHERE cons.constraint_type = 'P'
             AND cons.table_name = :tableName
           ORDER BY cols.position`;

      const result = await connection.execute(
        sql,
        schema ? { tableName, schema } : { tableName },
        { outFormat: 4002 }
      );

      return result.rows.map((row: any) => row.COLUMN_NAME);
    } finally {
      await connection.close();
    }
  }

  private async listPostgresPrimaryKeys(pool: any, tableName: string, schema: string = 'public'): Promise<string[]> {
    const result = await pool.query(
      `SELECT a.attname
       FROM pg_index i
       JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
       WHERE i.indrelid = $1::regclass AND i.indisprimary
       ORDER BY a.attnum`,
      [`${schema}.${tableName}`]
    );

    return result.rows.map((row: any) => row.attname);
  }

  private async listMySqlPrimaryKeys(pool: any, tableName: string): Promise<string[]> {
    const [rows] = await pool.query(`SHOW KEYS FROM \`${tableName}\` WHERE Key_name = 'PRIMARY'`);
    return (rows as any[]).map((row: any) => row.Column_name);
  }

  private async listSqlServerPrimaryKeys(pool: any, tableName: string): Promise<string[]> {
    return new Promise((resolve, reject) => {
      const keys: string[] = [];
      const request = pool.request();

      request.on('row', (row: any) => {
        keys.push(row[0].value);
      });

      request.on('requestCompleted', () => resolve(keys));
      request.on('error', reject);

      request.query(`
        SELECT c.name
        FROM sys.indexes i
        JOIN sys.index_columns ic ON i.object_id = ic.object_id AND i.index_id = ic.index_id
        JOIN sys.columns c ON ic.object_id = c.object_id AND ic.column_id = c.column_id
        WHERE i.is_primary_key = 1 AND OBJECT_NAME(i.object_id) = '${tableName}'
      `);
    });
  }

  private async listSqlitePrimaryKeys(pool: any, tableName: string): Promise<string[]> {
    const stmt = pool.prepare(`PRAGMA table_info(${tableName})`);
    const rows = stmt.all();
    
    return rows
      .filter((row: any) => row.pk > 0)
      .sort((a: any, b: any) => a.pk - b.pk)
      .map((row: any) => row.name);
  }

  async listForeignKeys(tableName: string): Promise<Array<{ column: string; refTable: string; refColumn: string }>> {
    const { vendor, pool, config } = this.connection;

    switch (vendor) {
      case 'oracle':
        return await this.listOracleForeignKeys(pool, tableName, config.schema);
      case 'postgresql':
        return await this.listPostgresForeignKeys(pool, tableName, config.schema);
      case 'mysql':
      case 'mariadb':
        return await this.listMySqlForeignKeys(pool, tableName);
      case 'sqlserver':
        return await this.listSqlServerForeignKeys(pool, tableName);
      case 'sqlite':
        return await this.listSqliteForeignKeys(pool, tableName);
      default:
        throw new Error(`Vendor no soportado: ${vendor}`);
    }
  }

  private async listOracleForeignKeys(pool: any, tableName: string, schema?: string): Promise<Array<{ column: string; refTable: string; refColumn: string }>> {
    const connection = await pool.getConnection();
    try {
      const sql = schema
        ? `SELECT 
             a.column_name, 
             c_pk.table_name as r_table_name, 
             b.column_name as r_column_name
           FROM all_cons_columns a
           JOIN all_constraints c ON a.owner = c.owner AND a.constraint_name = c.constraint_name
           JOIN all_constraints c_pk ON c.r_owner = c_pk.owner AND c.r_constraint_name = c_pk.constraint_name
           JOIN all_cons_columns b ON c_pk.owner = b.owner AND c_pk.constraint_name = b.constraint_name AND b.position = a.position
           WHERE c.constraint_type = 'R'
             AND a.table_name = :tableName
             AND a.owner = :schema
           ORDER BY c.constraint_name, a.position`
        : `SELECT 
             a.column_name, 
             c_pk.table_name as r_table_name, 
             b.column_name as r_column_name
           FROM user_cons_columns a
           JOIN user_constraints c ON a.constraint_name = c.constraint_name
           JOIN user_constraints c_pk ON c.r_constraint_name = c_pk.constraint_name
           JOIN user_cons_columns b ON c_pk.constraint_name = b.constraint_name AND b.position = a.position
           WHERE c.constraint_type = 'R'
             AND a.table_name = :tableName
           ORDER BY c.constraint_name, a.position`;

      const result = await connection.execute(
        sql,
        schema ? { tableName, schema } : { tableName },
        { outFormat: 4002 }
      );

      return result.rows.map((row: any) => ({
        column: row.COLUMN_NAME,
        refTable: row.R_TABLE_NAME,
        refColumn: row.R_COLUMN_NAME
      }));
    } finally {
      await connection.close();
    }
  }

  private async listPostgresForeignKeys(pool: any, tableName: string, schema: string = 'public'): Promise<Array<{ column: string; refTable: string; refColumn: string }>> {
    const result = await pool.query(
      `SELECT
         kcu.column_name,
         ccu.table_name AS foreign_table_name,
         ccu.column_name AS foreign_column_name
       FROM information_schema.table_constraints AS tc
       JOIN information_schema.key_column_usage AS kcu
         ON tc.constraint_name = kcu.constraint_name
         AND tc.table_schema = kcu.table_schema
       JOIN information_schema.constraint_column_usage AS ccu
         ON ccu.constraint_name = tc.constraint_name
         AND ccu.table_schema = tc.table_schema
       WHERE tc.constraint_type = 'FOREIGN KEY'
         AND tc.table_name = $1
         AND tc.table_schema = $2`,
      [tableName, schema]
    );

    return result.rows.map((row: any) => ({
      column: row.column_name,
      refTable: row.foreign_table_name,
      refColumn: row.foreign_column_name
    }));
  }

  private async listMySqlForeignKeys(pool: any, tableName: string): Promise<Array<{ column: string; refTable: string; refColumn: string }>> {
    const [rows] = await pool.query(`
      SELECT 
        COLUMN_NAME as column_name,
        REFERENCED_TABLE_NAME as foreign_table_name,
        REFERENCED_COLUMN_NAME as foreign_column_name
      FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
      WHERE TABLE_NAME = ? AND REFERENCED_TABLE_NAME IS NOT NULL
    `, [tableName]);

    return (rows as any[]).map((row: any) => ({
      column: row.column_name,
      refTable: row.foreign_table_name,
      refColumn: row.foreign_column_name
    }));
  }

  private async listSqlServerForeignKeys(pool: any, tableName: string): Promise<Array<{ column: string; refTable: string; refColumn: string }>> {
    return new Promise((resolve, reject) => {
      const fks: Array<{ column: string; refTable: string; refColumn: string }> = [];
      const request = pool.request();

      request.on('row', (row: any) => {
        fks.push({
          column: row[0].value,
          refTable: row[1].value,
          refColumn: row[2].value
        });
      });

      request.on('requestCompleted', () => resolve(fks));
      request.on('error', reject);

      request.query(`
        SELECT 
          COL_NAME(fc.parent_object_id, fc.parent_column_id) as column_name,
          OBJECT_NAME(fc.referenced_object_id) as foreign_table_name,
          COL_NAME(fc.referenced_object_id, fc.referenced_column_id) as foreign_column_name
        FROM sys.foreign_key_columns fc
        WHERE OBJECT_NAME(fc.parent_object_id) = '${tableName}'
      `);
    });
  }

  private async listSqliteForeignKeys(pool: any, tableName: string): Promise<Array<{ column: string; refTable: string; refColumn: string }>> {
    const stmt = pool.prepare(`PRAGMA foreign_key_list(${tableName})`);
    const rows = stmt.all();
    
    return rows.map((row: any) => ({
      column: row.from,
      refTable: row.table,
      refColumn: row.to
    }));
  }

  async healthCheck(): Promise<HealthCheckResult> {
    const { vendor, pool, config } = this.connection;

    try {
      let version = 'unknown';
      let activeConnections = 0;

      switch (vendor) {
        case 'oracle':
          const oracleConn = await pool.getConnection();
          const result = await oracleConn.execute('SELECT * FROM v$version WHERE banner LIKE \'Oracle%\'');
          version = result.rows[0]?.[0] || 'unknown';
          activeConnections = pool.connectionsInUse || 0;
          await oracleConn.close();
          break;

        case 'postgresql':
          const pgResult = await pool.query('SELECT version()');
          version = pgResult.rows[0].version;
          activeConnections = pool.totalCount || 0;
          break;

        case 'mysql':
        case 'mariadb':
          const [mysqlResult] = await pool.query('SELECT VERSION() as version');
          version = (mysqlResult as any)[0].version;
          break;

        case 'sqlserver':
          // SQL Server health check es más simple
          version = 'SQL Server';
          break;

        case 'sqlite':
          const sqliteResult = pool.prepare('SELECT sqlite_version() as version').get();
          version = `SQLite ${sqliteResult.version}`;
          activeConnections = 1; // SQLite es de un solo usuario
          break;
      }

      return {
        status: 'healthy',
        vendor,
        version,
        uptime: 0,
        activeConnections,
        poolStats: {
          total: config.maxPoolSize || 10,
          active: activeConnections,
          idle: (config.maxPoolSize || 10) - activeConnections
        }
      };
    } catch (error: any) {
      return {
        status: 'unhealthy',
        vendor,
        version: 'error',
        uptime: 0,
        activeConnections: 0
      };
    }
  }

  /**
   * Lista todos los packages de Oracle en el esquema actual
   */
  async listOraclePackages(): Promise<Array<{ name: string; type: string; status: string }>> {
    if (this.connection.vendor !== 'oracle') {
      throw new Error('Esta función solo está disponible para Oracle');
    }

    const sql = `
      SELECT 
        OBJECT_NAME as name,
        OBJECT_TYPE as type,
        STATUS as status
      FROM USER_OBJECTS
      WHERE OBJECT_TYPE IN ('PACKAGE', 'PACKAGE BODY')
      ORDER BY OBJECT_NAME, OBJECT_TYPE
    `;

    const result = await this.executeQuery(sql, 1000);
    return result.rows.map((row: any) => ({
      name: row.NAME || row.name,
      type: row.TYPE || row.type,
      status: row.STATUS || row.status
    }));
  }

  /**
   * Obtiene los errores de compilación de un objeto Oracle
   */
  async getOracleErrors(objectName: string, objectType: 'PACKAGE' | 'PACKAGE BODY' | 'PROCEDURE' | 'FUNCTION'): Promise<Array<{ line: number; position: number; text: string; attribute: string }>> {
    if (this.connection.vendor !== 'oracle') {
      throw new Error('Esta función solo está disponible para Oracle');
    }

    try {
      const sql = `
        SELECT 
          LINE as line,
          POSITION as position,
          TEXT as text,
          ATTRIBUTE as attribute
        FROM USER_ERRORS
        WHERE NAME = '${objectName.toUpperCase()}'
          AND TYPE = '${objectType}'
        ORDER BY SEQUENCE
      `;

      const result = await this.executeQuery(sql, 100);
      return result.rows.map((row: any) => ({
        line: row.LINE || row.line,
        position: row.POSITION || row.position,
        text: row.TEXT || row.text,
        attribute: row.ATTRIBUTE || row.attribute
      }));
    } catch (error: any) {
      console.warn(`⚠️ No se pudieron obtener errores para ${objectName}: ${error.message}`);
      // Si hay error de permisos o no existen errores, devolver array vacío
      return [];
    }
  }

  /**
   * Lista todos los procedimientos y funciones de un package específico
   */
  async listPackageProcedures(packageName: string): Promise<Array<{ name: string; type: string; overload: string | null; status?: string }>> {
    if (this.connection.vendor !== 'oracle') {
      throw new Error('Esta función solo está disponible para Oracle');
    }

    const sql = `
      SELECT 
        p.PROCEDURE_NAME as proc_name,
        p.OBJECT_TYPE as type,
        p.OVERLOAD as overload,
        o.STATUS as status
      FROM USER_PROCEDURES p
      LEFT JOIN USER_OBJECTS o ON p.PROCEDURE_NAME = o.OBJECT_NAME 
        AND p.OBJECT_TYPE = o.OBJECT_TYPE
      WHERE p.OBJECT_NAME = :packageName
        AND p.PROCEDURE_NAME IS NOT NULL
      ORDER BY p.PROCEDURE_NAME, p.OVERLOAD
    `;

    // Oracle requiere bind variables, usamos el formato de cadena por simplicidad
    const safeSql = sql.replace(':packageName', `'${packageName.toUpperCase()}'`);
    const result = await this.executeQuery(safeSql, 1000);
    
    return result.rows
      .filter((row: any) => row.PROC_NAME || row.proc_name) // Filtrar nulls por seguridad
      .map((row: any) => ({
        name: row.PROC_NAME || row.proc_name,
        type: row.TYPE || row.type,
        overload: row.OVERLOAD || row.overload || null,
        status: row.STATUS || row.status || 'UNKNOWN'
      }));
  }

  /**
   * Obtiene el código fuente completo de un package o procedimiento
   */
  async getOracleSource(objectName: string, objectType: 'PACKAGE' | 'PACKAGE BODY' | 'PROCEDURE' | 'FUNCTION'): Promise<string> {
    if (this.connection.vendor !== 'oracle') {
      throw new Error('Esta función solo está disponible para Oracle');
    }

    const sql = `
      SELECT TEXT
      FROM USER_SOURCE
      WHERE NAME = '${objectName.toUpperCase()}'
        AND TYPE = '${objectType}'
      ORDER BY LINE
    `;

    const result = await this.executeQuery(sql, 10000);
    return result.rows.map((row: any) => row.TEXT || row.text).join('');
  }

  async insertBatch(tableName: string, rows: any[]): Promise<number> {
    if (rows.length === 0) return 0;
    const { vendor, pool } = this.connection;
    const distinctColumns = Object.keys(rows[0]);

    // Sanitization & Quoting
    const quote = (id: string) => vendor === 'mysql' || vendor === 'mariadb' ? `\`${id}\`` : `"${id}"`;
    const colNames = distinctColumns.map(quote).join(', ');

    try {
        if (vendor === 'oracle') {
            const conn = await pool.getConnection();
            try {
                // Oracle executeMany
                const sql = `INSERT INTO ${quote(tableName)} (${colNames}) VALUES (${distinctColumns.map((_, i) => `:${i}`).join(', ')})`;
                // Need to convert object rows to array of arrays for array binding (or object binding if driver supports)
                // oracledb supports explicit bind by name or position. Let's use position for simplicity with array of values
                const binds = rows.map(r => distinctColumns.map(c => r[c]));
                
                const result = await conn.executeMany(sql, binds, { autoCommit: true });
                return result.rowsAffected || rows.length;
            } finally {
                await conn.close();
            }
        } 
        else if (vendor === 'sqlite') {
            const placeholders = `(${distinctColumns.map(() => '?').join(', ')})`;
            const sql = `INSERT INTO ${quote(tableName)} (${colNames}) VALUES ${placeholders}`;
            
            // SQLite is synchronous, better wrap in transaction
            const insert = pool.prepare(sql);
            const insertMany = pool.transaction((data: any[]) => {
                let count = 0;
                for (const row of data) {
                    const values = distinctColumns.map(k => row[k]);
                    insert.run(values);
                    count++;
                }
                return count;
            });
            return insertMany(rows);
        }
        else if (vendor === 'postgresql') {
             // Multi-row insert: INSERT INTO t (c1, c2) VALUES ($1, $2), ($3, $4)...
             // Note: PG has a parameter limit (around 65535). Batch size passed to this should respect that.
             // If batchSize * cols > 65535, we should split, but let's assume caller handles reasonable batch sizes (e.g. 1000)
             
             const values: any[] = [];
             const rowPlaceholders: string[] = [];
             
             let paramIndex = 1;
             rows.forEach(row => {
                 const rowParams: string[] = [];
                 distinctColumns.forEach(col => {
                     rowParams.push(`$${paramIndex++}`);
                     values.push(row[col]);
                 });
                 rowPlaceholders.push(`(${rowParams.join(', ')})`);
             });
             
             const sql = `INSERT INTO ${quote(tableName)} (${colNames}) VALUES ${rowPlaceholders.join(', ')}`;
             const result = await pool.query(sql, values);
             return result.rowCount || 0;
        }
        else if (vendor === 'mysql' || vendor === 'mariadb') {
             // Multi-row insert: INSERT INTO t VALUES (?,?), (?,?)
             const values: any[] = [];
             const rowPlaceholders: string[] = [];
             
             rows.forEach(row => {
                 const rowParams: string[] = [];
                 distinctColumns.forEach(col => {
                     rowParams.push('?');
                     values.push(row[col]);
                 });
                 rowPlaceholders.push(`(${rowParams.join(', ')})`);
             });
             
             const sql = `INSERT INTO ${quote(tableName)} (${colNames}) VALUES ${rowPlaceholders.join(', ')}`;
             const [result] = await pool.query(sql, values);
             return (result as any).affectedRows || rows.length;
        }
        
        return 0;
    } catch (e: any) {
        console.error(`Error inserting batch into ${tableName}: ${e.message}`);
        throw e; // Propagate error so Migrator knows
    }
  }

  /**
   * Analiza un procedimiento y extrae las tablas que utiliza
   */
  async analyzeProcedureTables(sourceCode: string): Promise<Array<{ table: string; operations: string[] }>> {
    // Expresiones regulares para detectar operaciones SQL
    const patterns = {
      select: /FROM\s+([A-Z_][A-Z0-9_]*)/gi,
      insert: /INSERT\s+INTO\s+([A-Z_][A-Z0-9_]*)/gi,
      update: /UPDATE\s+([A-Z_][A-Z0-9_]*)/gi,
      delete: /DELETE\s+FROM\s+([A-Z_][A-Z0-9_]*)/gi,
      merge: /MERGE\s+INTO\s+([A-Z_][A-Z0-9_]*)/gi
    };

    const tableOps = new Map<string, Set<string>>();

    // Extraer tablas y operaciones
    for (const [operation, pattern] of Object.entries(patterns)) {
      let match;
      while ((match = pattern.exec(sourceCode)) !== null) {
        const tableName = match[1].toUpperCase();
        if (!tableOps.has(tableName)) {
          tableOps.set(tableName, new Set());
        }
        tableOps.get(tableName)!.add(operation.toUpperCase());
      }
    }

    // Convertir a array
    return Array.from(tableOps.entries()).map(([table, ops]) => ({
      table,
      operations: Array.from(ops)
    }));
  }

  /**
   * Divide el código fuente en bloques lógicos para mejor visualización
   */
  parseProcedureBlocks(sourceCode: string): Array<{ type: string; content: string; tables: string[]; lineStart: number; lineEnd: number }> {
    const lines = sourceCode.split('\n');
    const blocks: Array<{ type: string; content: string; tables: string[]; lineStart: number; lineEnd: number }> = [];
    
    let currentBlock: string[] = [];
    let blockStart = 0;
    let blockType = 'declaration';

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim().toUpperCase();
      
      // Detectar inicio de nuevo bloque
      if (line.startsWith('BEGIN')) {
        if (currentBlock.length > 0) {
          blocks.push(this.createBlock(blockType, currentBlock, blockStart, i - 1));
        }
        currentBlock = [lines[i]];
        blockStart = i;
        blockType = 'begin';
      } else if (line.includes('CURSOR')) {
        blockType = 'cursor';
        currentBlock.push(lines[i]);
      } else if (line.includes('SELECT') || line.includes('INSERT') || line.includes('UPDATE') || line.includes('DELETE')) {
        if (blockType !== 'sql') {
          if (currentBlock.length > 0) {
            blocks.push(this.createBlock(blockType, currentBlock, blockStart, i - 1));
          }
          currentBlock = [lines[i]];
          blockStart = i;
          blockType = 'sql';
        } else {
          currentBlock.push(lines[i]);
        }
      } else if (line.startsWith('EXCEPTION')) {
        if (currentBlock.length > 0) {
          blocks.push(this.createBlock(blockType, currentBlock, blockStart, i - 1));
        }
        currentBlock = [lines[i]];
        blockStart = i;
        blockType = 'exception';
      } else if (line.startsWith('END')) {
        currentBlock.push(lines[i]);
        blocks.push(this.createBlock(blockType, currentBlock, blockStart, i));
        currentBlock = [];
        blockType = 'end';
      } else {
        currentBlock.push(lines[i]);
      }
    }

    // Añadir último bloque si existe
    if (currentBlock.length > 0) {
      blocks.push(this.createBlock(blockType, currentBlock, blockStart, lines.length - 1));
    }

    return blocks;
  }

  private createBlock(type: string, lines: string[], start: number, end: number): { type: string; content: string; tables: string[]; lineStart: number; lineEnd: number } {
    const content = lines.join('\n');
    const tables = this.extractTablesFromCode(content);
    
    return {
      type,
      content,
      tables,
      lineStart: start + 1, // Las líneas empiezan en 1
      lineEnd: end + 1
    };
  }

  private extractTablesFromCode(code: string): string[] {
    const tablePattern = /(?:FROM|INTO|UPDATE|JOIN)\s+([A-Z_][A-Z0-9_]*)/gi;
    const tables = new Set<string>();
    let match;
    
    while ((match = tablePattern.exec(code)) !== null) {
      tables.add(match[1].toUpperCase());
    }
    
    return Array.from(tables);
  }
}

