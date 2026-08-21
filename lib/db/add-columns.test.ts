import { describe, it, expect } from 'vitest';
import { addColumnsIfMissing, type SqliteLike } from './add-columns';

/** A stand-in whose pragma view can lag behind what exec() has already applied. */
function fakeDb(options: { reported: string[]; alreadyApplied?: string[] }) {
  const applied = new Set(options.alreadyApplied ?? options.reported);
  const attempted: string[] = [];
  const sqlite: SqliteLike = {
    pragma: () => options.reported.map((name) => ({ name })),
    exec: (sql: string) => {
      const column = sql.split('ADD COLUMN ')[1].split(' ')[0];
      attempted.push(column);
      if (applied.has(column)) throw new Error(`duplicate column name: ${column}`);
      applied.add(column);
    },
  };
  return { sqlite, attempted };
}

const COLUMNS = [
  { name: 'work_hours', ddl: 'work_hours REAL' },
  { name: 'hourly_rate', ddl: 'hourly_rate REAL' },
];

describe('addColumnsIfMissing', () => {
  it('skips columns the table already has', () => {
    const { sqlite, attempted } = fakeDb({ reported: ['id', 'work_hours'] });
    addColumnsIfMissing(sqlite, 'payslips', COLUMNS);
    expect(attempted).toEqual(['hourly_rate']);
  });

  it('leaves a table that does not exist alone', () => {
    const { sqlite, attempted } = fakeDb({ reported: [] });
    addColumnsIfMissing(sqlite, 'payslips', COLUMNS);
    expect(attempted).toEqual([]);
  });

  it('treats a column another process added first as already applied', () => {
    // Next.js build workers share the SQLite file: this one read table_info
    // before the other had run its ALTER, so both try to add the same column.
    const { sqlite, attempted } = fakeDb({
      reported: ['id'],
      alreadyApplied: ['work_hours', 'hourly_rate'],
    });
    expect(() => addColumnsIfMissing(sqlite, 'payslips', COLUMNS)).not.toThrow();
    expect(attempted).toEqual(['work_hours', 'hourly_rate']);
  });

  it('still throws on any other SQLite error', () => {
    const sqlite: SqliteLike = {
      pragma: () => [{ name: 'id' }],
      exec: () => {
        throw new Error('database is locked');
      },
    };
    expect(() => addColumnsIfMissing(sqlite, 'payslips', COLUMNS)).toThrow('database is locked');
  });
});
