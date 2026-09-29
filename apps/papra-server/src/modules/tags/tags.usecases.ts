import type { EventServices } from '../app/events/events.services';
import type { Config } from '../config/config.types';
import type { DocumentActivityRepository } from '../documents/document-activity/document-activity.repository';
import type { DocumentsRepository } from '../documents/documents.repository';
import type { DocumentStorageService } from '../documents/storage/documents.storage.services';
import type { Logger } from '../shared/logger/logger';
import type { WebhookTriggerServices } from '../webhooks/webhooks.trigger.services';
import type { TagsRepository } from './tags.repository';
import type { Tag } from './tags.types';
import { deferRegisterDocumentActivityLog } from '../documents/document-activity/document-activity.usecases';
import { createLogger } from '../shared/logger/logger';
import { createOrganizationTagLimitReachedError, createTagNotFoundError } from './tags.errors';
import { syncDocumentNamesWithTags } from './tags.name-sync.usecases';

export async function checkIfOrganizationCanCreateNewTag({
  organizationId,
  config,
  tagsRepository,
}: {
  organizationId: string;
  config: Config;
  tagsRepository: TagsRepository;
}) {
  const { tagsCount } = await tagsRepository.getOrganizationTagsCount({ organizationId });

  if (tagsCount >= config.tags.maxTagsPerOrganization) {
    throw createOrganizationTagLimitReachedError();
  }
}

export async function createTag({
  organizationId,
  name,
  color,
  description,
  prependNameToFile,
  config,
  tagsRepository,
}: {
  organizationId: string;
  name: string;
  color: string;
  description?: string;
  prependNameToFile?: boolean;
  config: Config;
  tagsRepository: TagsRepository;
}) {
  await checkIfOrganizationCanCreateNewTag({ organizationId, config, tagsRepository });

  const { tag } = await tagsRepository.createTag({
    tag: { organizationId, name, color, description, prependNameToFile },
  });

  return { tag };
}

export async function addTagToDocument({
  tagId,
  documentId,
  organizationId,
  userId,
  tag,

  tagsRepository,
  documentsRepository,
  documentsStorageService,
  eventServices,
  renameStoredFileOnDocumentRename,
  webhookTriggerServices,
  documentActivityRepository,
  logger = createLogger({ namespace: 'tags.usecases' }),
}: {
  tagId: string;
  documentId: string;
  organizationId: string;
  userId?: string;
  tag: Tag;

  tagsRepository: TagsRepository;
  documentsRepository: DocumentsRepository;
  documentsStorageService?: DocumentStorageService;
  eventServices: EventServices;
  renameStoredFileOnDocumentRename: boolean;
  webhookTriggerServices: WebhookTriggerServices;
  documentActivityRepository: DocumentActivityRepository;
  logger?: Logger;
}) {
  await tagsRepository.addTagToDocument({ tagId, documentId });

  webhookTriggerServices.deferTriggerWebhooks({
    organizationId,
    event: 'document:tag:added',
    payloads: [{ documentId, organizationId, tagId, tagName: tag.name }],
  });

  deferRegisterDocumentActivityLog({
    documentId,
    event: 'tagged',
    userId,
    documentActivityRepository,
    tagId,
  });

  // Only a flagged tag can change the file name, so skip the extra work otherwise.
  if (tag.prependNameToFile) {
    await syncDocumentNamesWithTags({
      documentIds: [documentId],
      organizationId,
      userId,
      tagsRepository,
      documentsRepository,
      documentsStorageService,
      eventServices,
      renameStoredFileOnDocumentRename,
      logger,
    });
  }
}

export async function removeTagFromDocument({
  tagId,
  documentId,
  organizationId,
  userId,
  tag,

  tagsRepository,
  documentsRepository,
  documentsStorageService,
  eventServices,
  renameStoredFileOnDocumentRename,
  webhookTriggerServices,
  documentActivityRepository,
  logger = createLogger({ namespace: 'tags.usecases' }),
}: {
  tagId: string;
  documentId: string;
  organizationId: string;
  userId?: string;
  tag: Tag;

  tagsRepository: TagsRepository;
  documentsRepository: DocumentsRepository;
  documentsStorageService?: DocumentStorageService;
  eventServices: EventServices;
  renameStoredFileOnDocumentRename: boolean;
  webhookTriggerServices: WebhookTriggerServices;
  documentActivityRepository: DocumentActivityRepository;
  logger?: Logger;
}) {
  await tagsRepository.removeTagFromDocument({ tagId, documentId });

  webhookTriggerServices.deferTriggerWebhooks({
    organizationId,
    event: 'document:tag:removed',
    payloads: [{ documentId, organizationId, tagId, tagName: tag.name }],
  });

  deferRegisterDocumentActivityLog({
    documentId,
    event: 'untagged',
    userId,
    documentActivityRepository,
    tagId,
  });

  // Removing a flagged tag must strip its name back out of the file name.
  if (tag.prependNameToFile) {
    await syncDocumentNamesWithTags({
      documentIds: [documentId],
      organizationId,
      userId,
      tagsRepository,
      documentsRepository,
      documentsStorageService,
      eventServices,
      renameStoredFileOnDocumentRename,
      logger,
    });
  }
}

export type DocumentTagPair = { documentId: string; tagId: string };

export async function applyTagsToDocuments({
  documentIds,
  addTagIds = [],
  removeTagIds = [],
  organizationId,
  userId,

  tagsRepository,
  eventServices,
  documentsRepository,
  documentsStorageService,
  renameStoredFileOnDocumentRename,
  logger = createLogger({ namespace: 'tags.usecases' }),
}: {
  documentIds: string[];
  addTagIds?: string[];
  removeTagIds?: string[];
  organizationId: string;
  userId?: string;

  tagsRepository: TagsRepository;
  eventServices: EventServices;
  // Optional so automated flows (tagging rules, auto-tagging) that lack a storage service can still
  // apply tags without renaming. Provide all three to opt into flagged-tag file-name syncing.
  documentsRepository?: DocumentsRepository;
  documentsStorageService?: DocumentStorageService;
  renameStoredFileOnDocumentRename?: boolean;
  logger?: Logger;
}): Promise<{ insertedPairs: DocumentTagPair[]; removedPairs: DocumentTagPair[] }> {
  if (documentIds.length === 0 || (addTagIds.length === 0 && removeTagIds.length === 0)) {
    return { insertedPairs: [], removedPairs: [] };
  }

  const requestedTagIds = [...new Set([...addTagIds, ...removeTagIds])];
  const { tags } = await tagsRepository.getTagsByIds({ tagIds: requestedTagIds, organizationId });

  if (tags.length !== requestedTagIds.length) {
    throw createTagNotFoundError();
  }

  const tagsById = new Map(tags.map((tag) => [tag.id, tag]));

  const [{ insertedPairs }, { removedPairs }] = await Promise.all([
    tagsRepository.addTagsToDocumentsBatch({ documentIds, tagIds: addTagIds }),
    tagsRepository.removeTagsFromDocumentsBatch({ documentIds, tagIds: removeTagIds }),
  ]);

  if (insertedPairs.length > 0 || removedPairs.length > 0) {
    const toEventPair = ({ documentId, tagId }: DocumentTagPair) => ({
      documentId,
      tagId,
      tagName: tagsById.get(tagId)?.name ?? '',
    });

    eventServices.emitEvent({
      eventName: 'document.tags.changed',
      payload: {
        organizationId,
        userId,
        addedPairs: insertedPairs.map(toEventPair),
        removedPairs: removedPairs.map(toEventPair),
      },
    });
  }

  // Resync only the documents whose added/removed tag is flagged, and only when the caller opted in
  // by providing the documents repository (storage service + rename flag come with it at the route).
  if (documentsRepository && renameStoredFileOnDocumentRename !== undefined) {
    const flaggedAffectedDocumentIds = [...insertedPairs, ...removedPairs]
      .filter(({ tagId }) => tagsById.get(tagId)?.prependNameToFile)
      .map(({ documentId }) => documentId);

    const uniqueFlaggedAffectedDocumentIds = [...new Set(flaggedAffectedDocumentIds)];

    if (uniqueFlaggedAffectedDocumentIds.length > 0) {
      await syncDocumentNamesWithTags({
        documentIds: uniqueFlaggedAffectedDocumentIds,
        organizationId,
        userId,
        tagsRepository,
        documentsRepository,
        documentsStorageService,
        eventServices,
        renameStoredFileOnDocumentRename,
        logger,
      });
    }
  }

  logger.info(
    {
      organizationId,
      userId,
      documentCount: documentIds.length,
      taggedCount: insertedPairs.length,
      untaggedCount: removedPairs.length,
    },
    'Applied tag changes to documents',
  );

  return { insertedPairs, removedPairs };
}
