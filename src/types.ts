export interface DatabaseConnection {
  id: string;
  vendor: 'oracle' | 'postgresql' | 'mysql' | 'mariadb' | 'sqlserver' | 'sqlite';
  pool: any;
  connectionString: string;
  config: {
    schema?: string;
    database?: string;
    maxPoolSize?: number;
  };
}

export interface QueryResult {
  columns: string[];
  rows: any[];
  rowCount: number;
  executionTime: number;
}

export interface ColumnInfo {
  name: string;
  dataType: string;
  nullable: boolean;
  isPrimaryKey: boolean;
  defaultValue?: string;
  maxLength?: number;
}

export interface TableInfo {
  schema?: string;
  name: string;
  type?: 'TABLE' | 'VIEW';
  columns?: ColumnInfo[];
  rowCount?: number;
}

export interface HealthCheckResult {
  status: 'healthy' | 'unhealthy';
  latency?: number;
  version?: string;
  error?: string;
  vendor?: string;
  uptime?: number;
  activeConnections?: number;
  poolStats?: {
    total: number;
    active: number;
    idle: number;
  };
}
