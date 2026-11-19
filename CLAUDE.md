# QA standards for EZCORP microservices

Standards to apply when validating tickets in this repo. Treat a deviation as a defect, even if the ticket's acceptance criteria don't mention it.

## Media service uploads (`POST /media/images/{application}`)

- **Uploaded files must be stored in a dated folder:** `<container>/images/<yyyy-mm-dd>/<uuid>.<ext>`.
  - Example (productidentifier, MS-15560): `product-identifier/images/2026-08-12/541aab2e-....jpg`
  - Check the response `filePath` (base64; decode it) and `url`.
- Each application writes only to its own container (e.g. `mim`, `product-identifier`).
- A fixed `config/` folder is only for static config assets (e.g. `mim/config/mim-promo-bg.png`), never for user uploads.
