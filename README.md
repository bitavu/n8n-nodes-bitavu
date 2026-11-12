# @bitavu/n8n-nodes-bitavu

Generate PDFs from [Bitavu](https://bitavu.com)'s visual templates and workflow
data. Dedicated template nodes list templates, inspect saved versions, and save
example JSON.

The [HTTP Request guide](https://bitavu.com/support/n8n) remains available for
n8n Cloud and self-hosted instances.

## Installation

Self-hosted n8n owners can install `@bitavu/n8n-nodes-bitavu`
through **Settings → Community nodes → Install**. Follow
[n8n's installation instructions](https://docs.n8n.io/integrations/community-nodes/installation/).
On n8n Cloud, install an n8n-verified version from the nodes panel.

## Credentials

Create a **Bitavu API** credential and paste your API key. Give it access to
the templates in the workflow and the permission for each operation.

| Operation | Permission |
| --- | --- |
| Generate PDF | Generate PDFs |
| List Templates, List Template Versions, Get Template Version | Read templates |
| Save Template Example | Save template examples |

Store the key in n8n Credentials.

Credential testing sends an authenticated, read-only `GET /v1/credentials/check`
request. It does not read reports, generate a PDF or consume render credits.
A successful check confirms the key is recognized; report access, subscription
and remaining allowance are checked when rendering.

## Generate a PDF

1. Design a report in [Studio](https://studio.bitavu.com), bind the changing
   content to fields, save a version and test it.
2. Copy **templateId**, numeric **revision** and **data** from **Integrations →
   Prepare a template request → Use in your app**.
3. Search for **Bitavu**, add **Generate PDF**, and select your credential.
4. Set **Template**, **Version Selection**, and **Document Data**. Map the JSON
   object using an expression such as `{{ $json.data }}` or `{{ $json }}`.
5. Execute. Each input item produces a PDF in the **pdf** binary field, ready
   for an email, file-storage or other node accepting binary data.

Use **Template → From List** to search the templates your key can read, sorted by folder and name. The key
needs **Read templates** permission for the picker and **Generate PDFs** for the
render. **By ID** accepts a template ID or an expression and works with a key
that only has **Generate PDFs** permission.

Choose **Pinned** and select the **Pinned Version** to keep using a tested layout.
Use **From List** with **Read templates** permission to see saved versions from newest
to oldest, with the current publication marked **Published**. Use **By Number** to
enter the saved version directly. Template and version are node settings. The
incoming data can contain just the document fields.
Choose **Latest Published** to follow the current publication when its JSON
contract is compatible. The version field becomes **Base Version**, and carries
over the version you entered. Leave it empty to compare against the first
published version. If compatibility fails, review the changes in Studio or pin
the tested version. Set **Options → Mapping ID** to use a mapping saved in Studio.

The node preserves input JSON, existing binary fields, and item pairing. The
`bitavu` output includes the requested and rendered revisions, page count,
request ID, operation ID, and output file information. The rendered revision
comes from the API when available. A pinned render can fall back to its requested
revision.

Any saved Bitavu report works when the supplied data matches that version.
`examples/bitavu-generate-pdf.json` uses fictional data with the starter invoice
(`invoice`, saved version 1) and contains no credentials.

## Work with templates

Search for **Bitavu** in the nodes panel and add the action you need. Each node
has its own settings and uses the same **Bitavu API** credential. Results are
returned under `$json.bitavu`.

| Operation | Result |
| --- | --- |
| List Templates | Accessible templates with folder paths, latest saved revisions, and Studio links |
| List Template Versions | Saved versions with a `published` flag on each row, the current `publishedRevision`, the latest summary, and an optional selected summary |
| Get Template Version | A saved version with its bindings, example JSON, and missing or unused input paths |
| Save Template Example | A new saved version with the example JSON and updated input review |

For **Save Template Example**, set **Expected Version** to the latest saved version you
reviewed. Bitavu rejects the save if that version is no longer current. Read the
latest version and check its bindings before retrying a conflict or uncertain
save. Saving an example leaves the current publication in place.

## Options and retries

- **File Name:** defaults to `<templateId>.pdf`.
- **Output Binary Field:** defaults to `pdf`.
- **Operation ID:** optional 16–128 letters, digits, underscores or hyphens.
  Reuse only for identical input.

Automatic IDs distinguish executions, nodes, loop iterations and items and stay
stable when n8n retries the node within one execution. A new execution creates
new IDs and can consume new credits. For retries across executions, retain a
unique ID upstream and map it to **Options → Operation ID**. Reusing an ID with
different data returns a conflict; the node does not hide it by changing the ID.

Configure retries in n8n. For an uncertain render result, retry with the same
operation ID and input. API errors show the request ID and retry delay when
available. Request timeout is 120 seconds.

## Errors and privacy

Errors explain invalid keys, missing permissions, compatibility checks,
revision conflicts, and allowance limits. Use n8n error workflows or
**On Error** settings to handle failures.

The node does not log keys, document data or PDFs, read files or access
environment variables. It calls only `api.bitavu.com` and follows no redirects.
n8n may store execution data and files according to your retention settings.
Bitavu does not retain render payloads or generated PDFs; explicitly saved
templates and account records remain stored.

## Development and release

Scaffolded with n8n's official node CLI. No runtime dependencies. Development
uses `n8n-workflow` 2.46.5, matching the tested n8n 2.46.7 instance.

```sh
npm ci --ignore-scripts
npm run lint
npm run typecheck
npm test
npm run vetting:check
npm run dev
```

Vetting checks both source and the packed package with n8n's scanner, with inline
lint suppressions disabled. The build restores the pinned TypeScript compiler's
command shim because the scanner brings a separate TypeScript compiler for its
own development tooling.

Programmatic execution keeps PDF validation, binary output, item pairing and
execution/node/run/item idempotency together. PDF binary output remains a
regular workflow result, with AI tool generation disabled. Credentials use
n8n's standard declarative credential test.

The publish workflow builds, tests and publishes `v*.*.*` tags with npm
provenance. Configure npm trusted publishing for repository
`bitavu/n8n-nodes-bitavu`, workflow `publish.yml`, environment `npm`.
The workflow audits the packed files and publishes that exact tarball.

## License

[MIT](LICENSE)
