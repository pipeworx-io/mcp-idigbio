# mcp-idigbio

iDigBio biodiversity specimen MCP.

Part of [Pipeworx](https://pipeworx.io) — an MCP gateway connecting AI agents to 1394+ live data sources.

## Tools

| Tool | Description |
|------|-------------|
| `search_specimens` | Search ~150M digitized natural-history museum specimen records (plants, animals, fossils) from US collections via iDigBio. Filter by any combination of taxonomy and locality. At least one filter is required. Keyless. |
| `get_specimen` | Get the full normalized record for a single iDigBio specimen by its uuid. e.g. uuid "0746b188-c390-4ab1-bd20-5489a9c6c33c" (a Puma concolor record). Keyless. |
| `count_by_field` | Get taxonomic/geographic specimen counts grouped by a field (top values + counts) across iDigBio. Optionally scope the counts with taxonomy/locality filters. Keyless. |

## Quick Start

Add to your MCP client (Claude Desktop, Cursor, Windsurf, etc.):

```json
{
  "mcpServers": {
    "idigbio": {
      "url": "https://gateway.pipeworx.io/idigbio/mcp"
    }
  }
}
```

Or connect to the full Pipeworx gateway for access to all 1394+ data sources:

```json
{
  "mcpServers": {
    "pipeworx": {
      "url": "https://gateway.pipeworx.io/mcp"
    }
  }
}
```

## Using with ask_pipeworx

Instead of calling tools directly, you can ask questions in plain English:

```
ask_pipeworx({ question: "your question about Idigbio data" })
```

The gateway picks the right tool and fills the arguments automatically.

## More

- [Docs and guides](https://pipeworx.io/docs)
- [pipeworx.io](https://pipeworx.io)

## License

MIT
