# n8n-nodes-formward

An [n8n](https://n8n.io) community node for [Formward](https://formward.eu), the form backend hosted in Sweden. It lets a workflow start whenever one of your forms receives a new submission, and read your forms and submissions through the Formward REST API.

- **Trigger** a workflow on each new submission (polling trigger).
- **Read** forms and submissions, with status, since and pagination filters.

## Why Formward with n8n

Formward stores and processes form submissions in the EU. Paired with a self-hosted n8n instance, submissions can flow into your CRM, mailbox, sheets or database without a US processor in the middle. The sub-processor list and the Data Processing Agreement are public at [formward.eu/compliance](https://formward.eu/compliance).

## Nodes

### Formward Trigger: "On New Submission"

A polling trigger. On each interval it calls `GET /forms/{formId}/submissions?since=<last poll time>` and emits one item per new submission. It keeps the newest `createdAt` it has seen as a cursor in the node's static data, so each submission fires exactly once.

- On the first poll it seeds the cursor and does not replay historical submissions; only submissions created after the trigger is activated fire it.
- In manual ("Test step") mode it surfaces the most recent submissions so you can see the data shape.

Output, one item per submission:

```json
{
  "id": "sub_...",
  "payload": { "email": "a@b.com", "message": "Hi" },
  "status": "received",
  "createdAt": "2026-06-18T10:00:00.000Z",
  "spamScore": 3,
  "aiSummary": "Sales enquiry about pricing."
}
```

### Formward: actions node

| Resource   | Operation        | Request                           |
| ---------- | ---------------- | --------------------------------- |
| Form       | List Forms       | `GET /forms`                      |
| Form       | Get Form         | `GET /forms/{formId}`             |
| Submission | List Submissions | `GET /forms/{formId}/submissions` |

List Submissions supports `Limit` (1 to 100) and optional filters: `Status` (`received`, `processed`, `spam`, `held`, `failed`), `Since` (ISO datetime) and `Before` (pagination cursor from a previous page's `nextBefore`).

## Credentials

Create a **Formward API** credential:

1. In the Formward dashboard open **API keys** and create a key with at least the `forms:read` and `submissions:read` scopes. The REST API is part of the Professional plan.
2. In n8n, add a **Formward API** credential and paste the key.
3. **Base URL** defaults to `https://app.formward.eu/api/v1`. Leave it for the hosted API (`https://formward.eu/api/v1` also works), or point it at your own instance.

The credential authenticates as `Authorization: Bearer <apiKey>` and is verified with a `GET /forms` request when you save it.

## Installation

### From the n8n UI (self-hosted)

1. Open **Settings, Community Nodes, Install**.
2. Enter `n8n-nodes-formward` and confirm.

### With npm (manual or Docker)

```bash
npm install n8n-nodes-formward
```

Restart n8n so it picks up the node.

## Local development

```bash
npm install
npm run build      # tsc, then copies the icons into dist/
```

Link it into your n8n custom-nodes folder (`~/.n8n/custom`) for local testing:

```bash
npm link
cd ~/.n8n/custom && npm link n8n-nodes-formward
```

## API reference

OpenAPI description: `https://app.formward.eu/api/v1/openapi.json`. Documentation: [formward.eu/docs/api](https://formward.eu/docs/api).

## License

MIT. See [LICENSE](./LICENSE).
