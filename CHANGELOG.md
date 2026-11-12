# Changelog

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
