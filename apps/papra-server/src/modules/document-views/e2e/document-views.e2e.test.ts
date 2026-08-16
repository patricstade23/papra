import { describe, expect, test } from 'vitest';
import { createInMemoryDatabase } from '../../app/database/database.test-utils';
import { createServer } from '../../app/server';
import { createTestServerDependencies } from '../../app/server.test-utils';
import { overrideConfig } from '../../config/config.test-utils';
import { ORGANIZATION_ROLES } from '../../organizations/organizations.constants';

const USER_ID = 'usr_111111111111111111111111';
const ORG_ID = 'org_222222222222222222222222';

async function setupApp() {
  const { db } = await createInMemoryDatabase({
    users: [{ id: USER_ID, email: 'user@example.com' }],
    organizations: [{ id: ORG_ID, name: 'Org 1' }],
    organizationMembers: [
      { organizationId: ORG_ID, userId: USER_ID, role: ORGANIZATION_ROLES.OWNER },
    ],
  });

  const { app } = createServer(
    createTestServerDependencies({ db, config: overrideConfig({ env: 'test' }) }),
  );

  return { db, app };
}

describe('document views e2e', () => {
  test('showOnHomePage defaults to false when not provided on create', async () => {
    const { app } = await setupApp();

    const response = await app.request(
      `/api/organizations/${ORG_ID}/document-views`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'My View', query: 'tag:invoice' }),
      },
      { loggedInUserId: USER_ID },
    );

    expect(response.status).to.eql(200);
    const { documentView } = await response.json();
    expect(documentView.showOnHomePage).to.eql(false);
  });

  test('can create a document view with showOnHomePage set to true', async () => {
    const { app } = await setupApp();

    const response = await app.request(
      `/api/organizations/${ORG_ID}/document-views`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'My View', query: 'tag:invoice', showOnHomePage: true }),
      },
      { loggedInUserId: USER_ID },
    );

    expect(response.status).to.eql(200);
    const { documentView } = await response.json();
    expect(documentView.showOnHomePage).to.eql(true);
  });

  test('can update showOnHomePage to true and it is persisted', async () => {
    const { app } = await setupApp();

    const createResponse = await app.request(
      `/api/organizations/${ORG_ID}/document-views`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'My View', query: 'tag:invoice' }),
      },
      { loggedInUserId: USER_ID },
    );
    const { documentView: created } = await createResponse.json();
    expect(created.showOnHomePage).to.eql(false);

    const updateResponse = await app.request(
      `/api/organizations/${ORG_ID}/document-views/${created.id}`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'My View', query: 'tag:invoice', showOnHomePage: true }),
      },
      { loggedInUserId: USER_ID },
    );

    expect(updateResponse.status).to.eql(200);
    const { documentView: updated } = await updateResponse.json();
    expect(updated.showOnHomePage).to.eql(true);
  });

  test('can toggle showOnHomePage back to false', async () => {
    const { app } = await setupApp();

    const createResponse = await app.request(
      `/api/organizations/${ORG_ID}/document-views`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'My View', query: 'tag:invoice', showOnHomePage: true }),
      },
      { loggedInUserId: USER_ID },
    );
    const { documentView: created } = await createResponse.json();

    const updateResponse = await app.request(
      `/api/organizations/${ORG_ID}/document-views/${created.id}`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'My View', query: 'tag:invoice', showOnHomePage: false }),
      },
      { loggedInUserId: USER_ID },
    );

    expect(updateResponse.status).to.eql(200);
    const { documentView: updated } = await updateResponse.json();
    expect(updated.showOnHomePage).to.eql(false);
  });

  test('list returns showOnHomePage for each view', async () => {
    const { app } = await setupApp();

    await app.request(
      `/api/organizations/${ORG_ID}/document-views`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'View A', query: 'tag:a', showOnHomePage: true }),
      },
      { loggedInUserId: USER_ID },
    );
    await app.request(
      `/api/organizations/${ORG_ID}/document-views`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'View B', query: 'tag:b', showOnHomePage: false }),
      },
      { loggedInUserId: USER_ID },
    );

    const listResponse = await app.request(
      `/api/organizations/${ORG_ID}/document-views`,
      { method: 'GET' },
      { loggedInUserId: USER_ID },
    );

    expect(listResponse.status).to.eql(200);
    const { documentViews } = await listResponse.json();
    expect(documentViews).to.have.length(2);

    const viewA = documentViews.find((v: { name: string }) => v.name === 'View A');
    const viewB = documentViews.find((v: { name: string }) => v.name === 'View B');
    expect(viewA.showOnHomePage).to.eql(true);
    expect(viewB.showOnHomePage).to.eql(false);
  });
});
