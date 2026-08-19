import type { Migration } from '../migrations.types';
import { sql } from 'drizzle-orm';

export const documentViewsShowOnHomePageMigration = {
  name: 'document-views-show-on-home-page',

  up: async ({ db }) => {
    const tableInfo = await db.run(sql`PRAGMA table_info(document_views)`);
    const existingColumns = tableInfo.rows.map((row) => row.name);

    if (!existingColumns.includes('show_on_home_page')) {
      await db.run(sql`ALTER TABLE document_views ADD COLUMN show_on_home_page INTEGER NOT NULL DEFAULT 0`);
    }
  },

  down: async ({ db }) => {
    await db.run(sql`ALTER TABLE document_views DROP COLUMN show_on_home_page`);
  },
} satisfies Migration;
