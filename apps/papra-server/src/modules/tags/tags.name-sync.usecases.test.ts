import { describe, expect, test } from 'vitest';
import { createInMemoryDatabase } from '../app/database/database.test-utils';
import { createTestEventServices } from '../app/events/events.test-utils';
import { createDocumentsRepository } from '../documents/documents.repository';
import { createInMemoryDocumentStorageServices } from '../documents/storage/documents.storage.services.test-utils';
import { createTagsRepository } from './tags.repository';
import { syncDocumentNamesWithTags } from './tags.name-sync.usecases';

async function setup({
  documentName,
  tags,
  documentsTags,
}: {
  documentName: string;
  tags: { id: string; name: string; prependNameToFile?: boolean }[];
  documentsTags: { documentId: string; tagId: string }[];
}) {
  const { db } = await createInMemoryDatabase({
    organizations: [{ id: 'organization-1', name: 'Organization 1' }],
    tags: tags.map((tag) => ({
      id: tag.id,
      name: tag.name,
      normalizedName: tag.name.toLowerCase(),
      color: '#000000',
      organizationId: 'organization-1',
      prependNameToFile: tag.prependNameToFile ?? false,
    })),
    documents: [
      {
        id: 'document-1',
        organizationId: 'organization-1',
        originalSha256Hash: 'hash',
        mimeType: 'text/plain',
        originalStorageKey: 'organization-1/originals/document-1.txt',
        name: documentName,
        originalName: documentName,
        content: 'Hello, world!',
      },
    ],
    // The seeder rejects empty `values()`, so only include the join rows when there are any.
    ...(documentsTags.length > 0 ? { documentsTags } : {}),
  });

  const tagsRepository = createTagsRepository({ db });
  const documentsRepository = createDocumentsRepository({ db });

  const getDocumentName = async () => {
    const { document } = await documentsRepository.getDocumentById({
      documentId: 'document-1',
      organizationId: 'organization-1',
    });
    return document?.name;
  };

  return {
    tagsRepository,
    documentsRepository,
    getDocumentName,
    run: () =>
      syncDocumentNamesWithTags({
        documentIds: ['document-1'],
        organizationId: 'organization-1',
        tagsRepository,
        documentsRepository,
        documentsStorageService: createInMemoryDocumentStorageServices(),
        eventServices: createTestEventServices(),
        renameStoredFileOnDocumentRename: false,
      }),
  };
}

describe('tags name sync usecases', () => {
  describe('syncDocumentNamesWithTags', () => {
    test('prepends a flagged tag name to the document file name', async () => {
      const { run, getDocumentName } = await setup({
        documentName: 'invoice.pdf',
        tags: [{ id: 'tag-1', name: 'Invoice', prependNameToFile: true }],
        documentsTags: [{ documentId: 'document-1', tagId: 'tag-1' }],
      });

      await run();

      expect(await getDocumentName()).to.eql('Invoice invoice.pdf');
    });

    test('prepends multiple flagged tag names alphabetically', async () => {
      const { run, getDocumentName } = await setup({
        documentName: 'report.pdf',
        tags: [
          { id: 'tag-1', name: 'Invoice', prependNameToFile: true },
          { id: 'tag-2', name: '2024', prependNameToFile: true },
        ],
        documentsTags: [
          { documentId: 'document-1', tagId: 'tag-1' },
          { documentId: 'document-1', tagId: 'tag-2' },
        ],
      });

      await run();

      expect(await getDocumentName()).to.eql('2024 Invoice report.pdf');
    });

    test('strips a flagged tag name back out once the tag is no longer assigned', async () => {
      const { run, getDocumentName } = await setup({
        // The document already carries the prefix but the tag has been unassigned.
        documentName: 'Invoice invoice.pdf',
        tags: [{ id: 'tag-1', name: 'Invoice', prependNameToFile: true }],
        documentsTags: [],
      });

      await run();

      expect(await getDocumentName()).to.eql('invoice.pdf');
    });

    test('does not change the name when no flagged tags are involved', async () => {
      const { run, getDocumentName } = await setup({
        documentName: 'invoice.pdf',
        tags: [{ id: 'tag-1', name: 'Unflagged', prependNameToFile: false }],
        documentsTags: [{ documentId: 'document-1', tagId: 'tag-1' }],
      });

      await run();

      expect(await getDocumentName()).to.eql('invoice.pdf');
    });

    test('is idempotent when run twice', async () => {
      const { run, getDocumentName } = await setup({
        documentName: 'invoice.pdf',
        tags: [{ id: 'tag-1', name: 'Invoice', prependNameToFile: true }],
        documentsTags: [{ documentId: 'document-1', tagId: 'tag-1' }],
      });

      await run();
      await run();

      expect(await getDocumentName()).to.eql('Invoice invoice.pdf');
    });
  });
});
