---
type: meta
title: "Dashboard"
updated: 2026-05-08
---

# Wiki Dashboard

## Recent Activity

```dataview
TABLE type, status, updated FROM "wiki" SORT updated DESC LIMIT 15
```

## Seed Pages (Need Development)

```dataview
LIST FROM "wiki" WHERE status = "seed" SORT updated ASC
```

## Entities Missing Sources

```dataview
LIST FROM "wiki/entities" WHERE !sources OR length(sources) = 0
```

## All Concepts

```dataview
LIST FROM "wiki/concepts" SORT file.name ASC
```

## All Domains

```dataview
LIST FROM "wiki/domains" SORT file.name ASC
```
