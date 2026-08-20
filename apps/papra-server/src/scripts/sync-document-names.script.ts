// oxlint-disable no-console
import type { Database } from '../modules/app/database/database.types';
import type { Config } from '../modules/config/config.types';
import { posix } from 'node:path';
import process from 'node:process';
import { parseArgs } from 'node:util';
import * as p from '@clack/prompts';
import { castError, safely } from '@corentinth/chisels';
import { count, eq } from 'drizzle-orm';
import { createIterator } from '../modules/app/database/database.usecases';
import { documentsTable } from '../modules/documents/documents.table';
import { deriveRenamedStorageKey } from '../modules/documents/documents.models';
import { createDocumentStorageService } from '../modules/documents/storage/documents.storage.services';
import { ensureBooleanArg } from './commons/args.utils';
import { runScriptWithDb } from './commons/run-script';

export async function syncDocumentStorageNames({
  db,
  config,
  isDryRun,
  prompts,
}: {
  db: Database;
  config: Config;
  isDryRun: boolean;
  prompts?: typeof p;
}) {
  const storageService = createDocumentStorageService({
    documentStorageConfig: config.documentsStorage,
  });

  prompts?.intro('Sync Document Storage Names');

  if (isDryRun) {
    prompts?.log.info(
      'This is a dry run, no actual changes will be made.\nJust logging the documents that would be synced.',
    );
  }

  // oxlint-disable-next-line typescript/no-useless-default-assignment -- defensive fallback for empty result set
  const [{ count: documentCount = 0 } = {}] = await db
    .select({ count: count() })
    .from(documentsTable);

  if (documentCount === 0) {
    prompts?.outro('No documents found in the database, nothing to sync');
    return;
  }

  prompts?.log.info(`Found ${documentCount} documents in the database`);

  const query = db
    .select({
      id: documentsTable.id,
      organizationId: documentsTable.organizationId,
      name: documentsTable.name,
      originalName: documentsTable.originalName,
      originalStorageKey: documentsTable.originalStorageKey,
    })
    .from(documentsTable)
    .$dynamic();

  const documentIterator = createIterator({ query });

  const progress = prompts?.progress({
    style: 'heavy',
    max: documentCount,
  });

  progress?.start();

  let syncedCount = 0;
  let skippedCount = 0;

  const syncErrors: {
    document: { id: string; originalName: string; originalStorageKey: string };
    error: unknown;
  }[] = [];

  for await (const document of documentIterator) {
    const { id, name, originalName, originalStorageKey } = document;

    const expectedKey = deriveRenamedStorageKey({
      oldStorageKey: originalStorageKey,
      newDocumentName: name,
    });

    if (expectedKey === originalStorageKey) {
      skippedCount++;
      progress?.advance();
      continue;
    }

    const oldFileName = posix.basename(originalStorageKey);
    const newFileName = posix.basename(expectedKey);

    progress?.message(`"${oldFileName}" → "${newFileName}"`);

    if (isDryRun) {
      prompts?.log.info(`Would rename: "${oldFileName}" → "${newFileName}"`);
      syncedCount++;
      progress?.advance();
      continue;
    }

    try {
      const destinationExists = await storageService.fileExists({ storageKey: expectedKey });

      if (destinationExists) {
        throw new Error(`Destination key already exists: "${expectedKey}"`);
      }

      await storageService.moveFile({
        sourceKey: originalStorageKey,
        destinationKey: expectedKey,
      });

      try {
        await db
          .update(documentsTable)
          .set({ originalStorageKey: expectedKey })
          .where(eq(documentsTable.id, id));

        prompts?.log.success(`Renamed: "${oldFileName}" → "${newFileName}"`);
      } catch (dbError) {
        const [, rollbackError] = await safely(
          storageService.moveFile({
            sourceKey: expectedKey,
            destinationKey: originalStorageKey,
          }),
        );

        if (rollbackError) {
          console.warn(
            `[sync-document-names] File move rollback failed. Manual recovery needed. id=${id} expectedKey=${expectedKey} originalKey=${originalStorageKey}`,
            rollbackError,
          );
        }

        throw dbError;
      }

      syncedCount++;
    } catch (error) {
      syncErrors.push({ document: { id, originalName, originalStorageKey }, error });
    }

    progress?.advance();
  }

  const dryRunLabel = isDryRun ? ' (dry run)' : '';

  progress?.stop(
    `Sync completed${dryRunLabel}: ${syncedCount} synced, ${skippedCount} already in sync, ${syncErrors.length} errors.`,
  );

  if (syncErrors.length > 0) {
    syncErrors.forEach(({ document, error }) => {
      const { id, originalName, originalStorageKey } = document;
      prompts?.log.error(
        `- Document ID: ${id}, Name: ${originalName}, Storage Key: ${originalStorageKey}\n  Error: ${castError(error).message}`,
      );
    });
  }
}

await runScriptWithDb({ scriptName: 'sync-document-names', silent: true }, async ({ db, config, isDryRun }) => {
  const { values } = parseArgs({
    args: process.argv.slice(2),
    options: {
      'dry-run': { type: 'boolean', default: false },
      'help': { type: 'boolean', short: 'h', default: false },
    },
    strict: false,
  });

  if (ensureBooleanArg(values.help)) {
    console.log(`
Usage: sync-document-names [options]

Finds documents whose stored filename does not match the document name in the
database and renames the stored file to match. Useful after enabling
DOCUMENT_RENAME_STORED_FILE_ON_RENAME when documents were already renamed via
the UI while the feature was disabled.

Note: for documents using the legacy storage key system
(DOCUMENT_STORAGE_USE_LEGACY_STORAGE_KEY_DEFINITION_SYSTEM=true), files are
stored as "{orgId}/originals/{docId}.ext". Running this script will rename
those files to "{orgId}/originals/{docName}.ext".

Options:
  --dry-run     Log what would change without making any modifications
  -h, --help    Show this help message
    `);
    process.exit(0);
  }

  await syncDocumentStorageNames({
    db,
    config,
    isDryRun: isDryRun || ensureBooleanArg(values['dry-run']),
    prompts: p,
  });
});
