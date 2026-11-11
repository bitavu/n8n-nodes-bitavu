# @bitavu/n8n-nodes-bitavu

Generate PDFs from [Bitavu](https://bitavu.com)'s visual templates and data in
your n8n workflow. Design and test the layout in Studio, save a version, then
use **Bitavu → Generate PDF**.

The [HTTP Request guide](https://bitavu.com/support/n8n) remains available for
n8n Cloud and self-hosted instances. n8n verification of this node is pending.

## Installation

Self-hosted n8n owners can install `@bitavu/n8n-nodes-bitavu`
through **Settings → Community nodes → Install**. Follow
[n8n's installation instructions](https://docs.n8n.io/integrations/community-nodes/installation/).
n8n Cloud requires a verified community node; this package is not yet verified.

## Credentials

Create a **Bitavu API** credential and paste your API key. In Studio's
**Integrations → API keys**, reuse a suitable active key or create one with
**Generate PDFs** permission for the report. **Read templates** is not needed.
Keep the secret in Credentials, never in exported workflow JSON.

Credential testing sends an authenticated, read-only `GET /v1/credentials/check`
request. It does not read reports, generate a PDF or consume render credits.
A successful check confirms the key is recognized; report access, subscription
and remaining allowance are checked when rendering.

## Generate a PDF

1. Design a report in [Studio](https://studio.bitavu.com), bind the changing
   content to fields, save a version and test it.
2. Copy **templateId**, numeric **revision** and **data** from **Integrations →
   Prepare a template request → Use in your app**.
3. Add **Bitavu → Generate PDF** and select your credential.
4. Set **Template ID**, **Saved Version** and **Document Data**. Map the JSON
   object using an expression such as `{{ $json.data }}` or `{{ $json }}`.
5. Execute. Each input item produces a PDF in the **pdf** binary field, ready
   for an email, file-storage or other node accepting binary data.

The node calls `POST https://api.bitavu.com/v1/render`, handles Bearer
authentication and binary PDF output, and keeps TLS verification enabled.
It preserves input JSON, existing binary fields and item pairing, and adds
`bitavu` metadata with the template, version, operation ID and filename.

Any saved Bitavu report works when the supplied data matches that version.
`examples/bitavu-generate-pdf.json` uses fictional data with the starter invoice
(`invoice`, saved version 1) and contains no credentials.

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

There are no internal automatic retries. Configure retries in n8n and respect
`Retry-After` for rate limits. After an uncertain network result, retry with the
same ID and input. Request timeout: 120 seconds.

## Errors and privacy

Errors explain invalid keys, missing permissions, template/version/data
mismatches, operation conflicts and allowance limits. Use n8n error workflows
or **On Error** settings to handle failures.

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
npm test
npm run lint
npm run typecheck
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

Run the Publish workflow manually on the tag for the package version. Supply
the SHA-256 of the reviewed tarball. The workflow builds and audits the package,
then publishes with npm provenance if the tarball matches. Configure npm trusted
publishing for `bitavu/n8n-nodes-bitavu`, workflow `publish.yml`, environment `npm`.

## License

[MIT](LICENSE)
