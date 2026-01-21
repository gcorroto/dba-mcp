import { DatabaseService } from './database-service.js';
import { DatabaseConnection } from '../types.js';

export class DataMigrationService {
  constructor(
    private source: DatabaseService,
    private target: DatabaseService
  ) {}

  async migrateTable(tableName: string, targetTableName?: string, batchSize: number = 1000): Promise<{ rows: number, time: number }> {
    const start = Date.now();
    const targetName = targetTableName || tableName;
    
    // 1. Describe source to know columns
    const columns = await this.source.describeTable(tableName);
    const colNames = columns.map(c => c.name);
    
    // 2. Read data (Simulated stream via simple query for MVP)
    // In production, this should be a true stream/cursor.
    // Here we fetch up to 10000 rows.
    const sql = `SELECT ${colNames.join(', ')} FROM ${tableName}`;
    
    // Using a large limit for MVP migration
    const result = await this.source.executeQuery(sql, 100000);
    const rows = result.rows;
    
    if (rows.length === 0) {
        return { rows: 0, time: Date.now() - start };
    }

    // 3. Insert in batches
    let totalInserted = 0;
    for (let i = 0; i < rows.length; i += batchSize) {
        const batch = rows.slice(i, i + batchSize);
        // Basic Type Transformation (Mapping dates etc if needed)
        // Currently insertBatch in DatabaseService handles basic insertion logic
        
        await this.target.insertBatch(targetName, batch);
        totalInserted += batch.length;
    }

    return {
        rows: totalInserted,
        time: Date.now() - start
    };
  }
  
  async migrateData(tables: string[], truncateTarget: boolean = false): Promise<any> {
      const results: any[] = [];
      
      for (const table of tables) {
          if (truncateTarget) {
              // TODO: Implement truncate in DatabaseService
              // await this.target.truncateTable(table);
          }
          
          try {
              const res = await this.migrateTable(table);
              results.push({ table, status: 'success', rows: res.rows, time: res.time });
          } catch(e: any) {
              results.push({ table, status: 'error', error: e.message });
          }
      }
      return results;
  }
}
