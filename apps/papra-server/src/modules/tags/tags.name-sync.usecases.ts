import type { EventServices } from '../app/events/events.services';
import type { DocumentsRepository } from '../documents/documents.repository';
import type { StorageService } from '../storage/storage.services';
import type { Logger } from '../shared/logger/logger';
import type { TagsRepository } from './tags.repository';
import { updateDocument } from '../documents/documents.usecases';
import { createLogger } from '../shared/logger/logger';
import { computeDocumentNameWithTags } from './tags.name-sync.models';

// Recomputes and persists the file name of the given documents based on their currently-assigned
// flagged tags (tags with `prependNameToFile` enabled). Reuses the documents `updateDocument`
// usecase so the physical stored file is renamed (when `renameStoredFileOnDocumentRename` is set)
// and a `document.updated` event is emitted, exactly like a manual rename.
//
// This is called explicitly from every tag-mutation path (single add, single remove, batch) so
// both adding and removing a flagged tag keeps the file name in sync.
export async function syncDocumentNamesWithTags({
  documentIds,
  organizationId,
  userId,
  tagsRepository,
  documentsRepository,
  documentsStorageService,
  eventServices,
  renameStoredFileOnDocumentRename,
  logger = createLogger({ namespace: 'tags.name-sync.usecases' }),
}: {
  documentIds: string[];
  organizationId: string;
  userId?: string;
  tagsRepository: TagsRepository;
  documentsRepository: DocumentsRepository;
  documentsStorageService?: StorageService;
  eventServices: EventServices;
  renameStoredFileOnDocumentRename: boolean;
  logger?: Logger;
}): Promise<void> {
  if (documentIds.length === 0) {
    return;
  }

  const [{ flaggedTagNames }, { tagsByDocumentId }] = await Promise.all([
    tagsRepository.getFlaggedTagNames({ organizationId }),
    tagsRepository.getTagsByDocumentIds({ documentIds }),
  ]);

  for (const documentId of documentIds) {
    const { document } = await documentsRepository.getDocumentById({ documentId, organizationId });

    if (!document) {
      continue;
    }

    const assignedFlaggedTagNames = (tagsByDocumentId[documentId] ?? [])
      .filter((tag) => tag.prependNameToFile)
      .map((tag) => tag.name);

    const newName = computeDocumentNameWithTags({
      currentName: document.name,
      allFlaggedTagNames: flaggedTagNames,
      assignedFlaggedTagNames,
    });

    if (newName === document.name) {
      continue;
    }

    await updateDocument({
      documentId,
      organizationId,
      userId,
      changes: { name: newName },
      documentsRepository,
      eventServices,
      documentsStorageService,
      renameStoredFileOnDocumentRename,
      logger,
    });
  }
}
