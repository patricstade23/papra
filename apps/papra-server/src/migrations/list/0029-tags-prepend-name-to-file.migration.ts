import type { Migration } from '../migrations.types';
import { sql } from 'drizzle-orm';

export const tagsPrependNameToFileMigration = {
  name: 'tags-prepend-name-to-file',

  up: async ({ db }) => {
    const tableInfo = await db.run(sql`PRAGMA table_info(tags)`);
    const existingColumns = tableInfo.rows.map((row) => row.name);

    if (!existingColumns.includes('prepend_name_to_file')) {
      await db.run(sql`ALTER TABLE tags ADD COLUMN prepend_name_to_file INTEGER NOT NULL DEFAULT 0`);
    }
  },

  down: async ({ db }) => {
    await db.run(sql`ALTER TABLE tags DROP COLUMN prepend_name_to_file`);
  },
} satisfies Migration;