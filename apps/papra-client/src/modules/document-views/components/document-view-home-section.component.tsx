import type { Component } from 'solid-js';
import type { Pagination } from '@/modules/shared/pagination/pagination.types';
import type { DocumentView } from '../document-views.types';
import { A } from '@solidjs/router';
import { keepPreviousData, useQuery } from '@tanstack/solid-query';
import { createSignal, Show } from 'solid-js';
import {
  createdAtColumn,
  documentDateColumn,
  DocumentsPaginatedList,
  standardActionsColumn,
  tagsColumn,
} from '@/modules/documents/components/documents-list.component';
import { fetchOrganizationDocuments } from '@/modules/documents/documents.services';
import { useI18n } from '@/modules/i18n/i18n.provider';

export const DocumentViewHomeSection: Component<{
  documentView: DocumentView;
  organizationId: string;
}> = (props) => {
  const { t } = useI18n();
  const [getPagination, setPagination] = createSignal<Pagination>({ pageIndex: 0, pageSize: 15 });

  const documentsQuery = useQuery(() => ({
    queryKey: [
      'organizations',
      props.organizationId,
      'documents',
      'home-view',
      props.documentView.id,
      props.documentView.query,
      getPagination(),
    ],
    queryFn: () =>
      fetchOrganizationDocuments({
        organizationId: props.organizationId,
        searchQuery: props.documentView.query,
        ...getPagination(),
      }),
    placeholderData: keepPreviousData,
  }));

  return (
    <div class="mb-10">
      <div class="flex items-center gap-2 mb-4">
        <div class="i-tabler-layout-list size-5 text-muted-foreground" />
        <h2 class="text-lg font-semibold">
          <A
            href={`/organizations/${props.organizationId}/views/${props.documentView.id}`}
            class="hover:underline"
          >
            {props.documentView.name}
          </A>
        </h2>
      </div>

      <Show when={documentsQuery.data}>
        {(getData) => (
          <DocumentsPaginatedList
            documents={getData().documents}
            documentsCount={getData().documentsCount}
            getPagination={getPagination}
            setPagination={setPagination}
            extraColumns={[tagsColumn, documentDateColumn, createdAtColumn, standardActionsColumn]}
          />
        )}
      </Show>

      <Show when={documentsQuery.data?.documentsCount === 0}>
        <div class="text-center py-8 text-muted-foreground text-sm">
          {t('document-views.view.no-documents')}
        </div>
      </Show>
    </div>
  );
};
