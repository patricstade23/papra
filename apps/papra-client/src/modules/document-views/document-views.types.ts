export type DocumentView = {
  id: string;
  name: string;
  query: string;
  description?: string | null;
  organizationId: string;
  showOnHomePage: boolean;
  createdAt: Date;
  updatedAt: Date;
};
