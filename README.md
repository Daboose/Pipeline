# Pipeline

Salesforce DX project built around the `SalesRisks__c` (Opportunities & Risks) object. Read `CLAUDE.md` first.

- `force-app/` source (empty so far)
- `docs/` requirements, build spec, team questions, mockups
- `manifest/package.xml` read-only retrieve list for `SalesRisks__c`

```
npm install
npm run lint
npm run test:unit
```

Always pass the org explicitly: `sf ... -o UAT|DEV|PROD`. PROD is released by Gearset only.
