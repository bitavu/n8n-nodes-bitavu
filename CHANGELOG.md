# Changelog

## 0.1.4

- Render pinned or latest-published versions, with an optional compatibility base and saved mapping.
- Search accessible templates with a key that has Read templates permission.
- Add dedicated nodes to list templates, list saved versions, read a template version, and save example data.
- Use action names in the node picker and on the canvas. Search for Bitavu to find all five actions.
- Sort template pickers by name and version pickers by descending revision, with the current publication marked Published.
- Identify the current publication in List Template Versions output.
- Include the rendered revision, page count, and request ID in PDF output, and surface retry guidance for API errors.
- Add the Marketing & Content category.

## 0.1.3

- Update the node categories to Productivity, Utility, and Finance & Accounting.

## 0.1.2

- Add npm search keywords for Bitavu, PDF generation, invoices, and templates.

## 0.1.1

- Declare a standard credential test using Bitavu's read-only key-check endpoint.
- Remove the deprecated HTTP helper from credential testing.
- Explicitly keep binary PDF generation out of AI tool generation.
- Vet both source and packed files with n8n's scanner before publishing.

## 0.1.0

- Generate PDFs from saved Bitavu template versions and workflow JSON.
- Store API keys in a Bitavu credential with a read-only credential check.
- Return native binary output and preserve input data and item pairing.
- Keep operation IDs stable during retries; accept upstream IDs across executions.
- Explain API errors without exposing credentials or document data.
