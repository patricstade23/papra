import type { PartialBy } from '@corentinth/chisels';
import type { DbSelectableDocument } from './documents.types';
import { extname, posix } from 'node:path';
import filenamify from 'filenamify';
import { getExtension } from '../shared/files/file-names';
import { omit } from '../shared/objects';
import { generateId } from '../shared/random/ids';
import { isDefined } from '../shared/utils';
import { ORIGINAL_DOCUMENTS_STORAGE_KEY } from './documents.constants';

export function joinStorageKeyParts(...parts: string[]) {
  return parts.join('/');
}

export function buildOriginalDocumentKey({
  documentId,
  organizationId,
  fileName,
}: {
  documentId: string;
  organizationId: string;
  fileName: string;
}) {
  const { extension } = getExtension({ fileName });

  const newFileName = isDefined(extension) ? `${documentId}.${extension}` : documentId;

  const originalDocumentStorageKey = joinStorageKeyParts(
    organizationId,
    ORIGINAL_DOCUMENTS_STORAGE_KEY,
    newFileName,
  );

  return { originalDocumentStorageKey };
}

export function generateDocumentId() {
  return generateId({ prefix: 'doc' });
}

export function isDocumentSizeLimitEnabled({ maxUploadSize }: { maxUploadSize: number }) {
  return maxUploadSize > 0;
}

export function formatDocumentForApi<T extends PartialBy<DbSelectableDocument, 'content'>>({
  document,
}: {
  document: T;
}) {
  return omit(document, [
    'fileEncryptionAlgorithm',
    'fileEncryptionKeyWrapped',
    'fileEncryptionKekVersion',
    'originalStorageKey',
  ]);
}

export function formatDocumentsForApi<T extends PartialBy<DbSelectableDocument, 'content'>>({
  documents,
}: {
  documents: T[];
}) {
  return documents.map((document) => formatDocumentForApi({ document }));
}

export function ensureSafeFileName(fileName: string) {
  return filenamify(fileName, { replacement: '_' });
}

export function deriveRenamedStorageKey({
  oldStorageKey,
  newDocumentName,
}: {
  oldStorageKey: string;
  newDocumentName: string;
}): string {
  const directory = posix.dirname(oldStorageKey);
  const oldExt = extname(posix.basename(oldStorageKey));

  // Strip the extension from the new document name (the UI sends it with extension)
  const nameWithoutExt = oldExt !== '' && newDocumentName.endsWith(oldExt)
    ? newDocumentName.slice(0, -oldExt.length)
    : posix.basename(newDocumentName, extname(newDocumentName));

  const sanitized = ensureSafeFileName(nameWithoutExt).trim();

  if (!sanitized) {
    throw new Error(`Cannot derive storage key: "${newDocumentName}" produces an empty filename after sanitization`);
  }

  const newBasename = `${sanitized}${oldExt}`;

  return directory === '.' ? newBasename : `${directory}/${newBasename}`;
}
