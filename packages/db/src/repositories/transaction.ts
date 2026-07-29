import type { Pool, PoolClient, QueryResult, QueryResultRow } from "pg";
const transactionBrand: unique symbol = Symbol("transaction");
export type TransactionContext = PoolClient & {
  readonly [transactionBrand]: true;
};
export async function withTransaction<T>(
  pool: Pool,
  operation: (transaction: TransactionContext) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await operation(client as TransactionContext);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
export async function query<Row extends QueryResultRow>(
  transaction: TransactionContext,
  text: string,
  values: readonly unknown[] = [],
): Promise<QueryResult<Row>> {
  return transaction.query<Row>(text, [...values]);
}
